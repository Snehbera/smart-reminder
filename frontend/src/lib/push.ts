import { API_BASE, api, getDeviceId } from './api';

export type PushState =
  | 'loading'
  | 'unsupported' // browser has no Push API
  | 'needs-install' // iOS/iPadOS Safari: Web Push only works for apps added to the Home Screen
  | 'default' // permission not asked yet
  | 'denied' // blocked in browser settings
  | 'connecting' // permission granted, registering the subscription
  | 'active'
  | 'error'; // permission granted but registering with the server failed

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** State derived purely from browser capabilities/permission (before any server round-trip). */
export function initialPushState(): PushState {
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!pushSupported()) return 'unsupported';
  switch (Notification.permission) {
    case 'granted':
      return 'connecting';
    case 'denied':
      return 'denied';
    default:
      return 'default';
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

/**
 * Registers the service worker. The API base URL and device id travel in the script URL so the worker can call
 * the API (Mark Done / Snooze) with no page open and no access to localStorage.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const url = `/sw.js?api=${encodeURIComponent(API_BASE)}&device=${encodeURIComponent(getDeviceId())}`;
  return navigator.serviceWorker.register(url, { scope: '/' });
}

/** Idempotent: (re)creates the browser PushSubscription and upserts it on the server. Safe to call on every load. */
export async function subscribeAndSync(): Promise<void> {
  await registerServiceWorker();
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api.vapidKey();
  const serverKey = urlBase64ToUint8Array(publicKey);

  let sub = await reg.pushManager.getSubscription();
  // VAPID keys were rotated: the old subscription is bound to the old key and must be replaced.
  if (sub && !sameKey(sub.options.applicationServerKey, serverKey)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey as BufferSource });
  }
  await api.subscribe(sub.toJSON());
}

/** Asks for notification permission (must be called from a click) and subscribes. */
export async function enableNotifications(): Promise<NotificationPermission> {
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission === 'granted') await subscribeAndSync();
  return permission;
}

export async function disableNotifications(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.unsubscribe(sub.endpoint).catch(() => undefined);
    await sub.unsubscribe();
  }
}
