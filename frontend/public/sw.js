/* Smart Reminders — service worker
 *
 * Runs in the background (even with every tab closed) and turns Web Push messages from the Worker's cron job
 * into persistent, actionable notifications.
 *
 * Configuration comes from the registration URL (set by src/lib/push.ts):
 *   /sw.js?api=<API base URL, may be empty for same-origin>&device=<device id>
 */

const params = new URL(self.location.href).searchParams;
const API_BASE = (params.get('api') || '').replace(/\/+$/, '');
const DEVICE_ID = params.get('device') || '';

const ICON = '/icon-192.png';
const BADGE = '/badge-96.png';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function broadcast(message) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) client.postMessage(message);
}

async function patchReminder(id, body) {
  const url = `${API_BASE}/api/reminders/${encodeURIComponent(id)}`;
  const init = {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': DEVICE_ID },
    body: JSON.stringify(body),
    keepalive: true,
  };
  try {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return true;
  } catch (err) {
    // One quick retry for flaky mobile networks.
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch(url, init);
      return res.ok;
    } catch (_) {
      return false;
    }
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// push: show the notification
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: 'Reminder', body: event.data ? event.data.text() : '' };
  }

  const reminderId = data.id || 'unknown';
  const title = data.title || 'Reminder';

  const options = {
    body: data.body || '',
    icon: data.icon || ICON,
    badge: data.badge || BADGE,
    tag: 'reminder-' + reminderId,
    renotify: true,
    requireInteraction: true, // stays on screen (desktop) until the user acts on it
    vibrate: [300, 100, 300, 100, 300],
    sound: '/notification.wav',
    timestamp: data.timestamp || Date.now(),
    actions: [
      { action: 'mark_done', title: '✓ Mark Done' },
      { action: 'snooze_10', title: '⏰ Snooze 10m' },
    ],
    data: {
      id: reminderId,
      url: data.url || '/?highlight=' + encodeURIComponent(reminderId),
      remindAt: data.remindAt || null,
      test: data.test === true,
      sound: data.sound || 'chime',
    },
  };
  if (data.image) options.image = data.image;

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      broadcast({ type: 'push-received', id: reminderId, sound: data.sound || 'chime' }), // lets an open tab refresh its list and play sound immediately
    ]),
  );
});

// ---------------------------------------------------------------------------
// notification clicks: Mark Done / Snooze run silently in the background
// ---------------------------------------------------------------------------

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const info = event.notification.data || {};
  const { id, url, remindAt, test } = info;

  if (event.action === 'mark_done' || event.action === 'snooze_10') {
    if (test) return; // test notifications never change a real reminder

    const body =
      event.action === 'mark_done'
        ? { status: 'completed', occurrenceAt: remindAt || undefined }
        : { action: 'snooze', minutes: 10, occurrenceAt: remindAt || undefined };

    event.waitUntil(
      (async () => {
        const ok = await patchReminder(id, body);
        if (ok) {
          await broadcast({ type: 'reminders-changed', id });
        } else {
          await self.registration.showNotification('Could not update reminder', {
            body: 'You seem to be offline. Open Smart Reminders to mark it done or snooze it.',
            icon: ICON,
            badge: BADGE,
            tag: 'reminder-action-failed-' + id,
            data: { id, url },
          });
        }
      })(),
    );
    return;
  }

  // Body click: focus an existing tab of the app, otherwise open a new one.
  event.waitUntil(
    (async () => {
      const target = url || '/?highlight=' + encodeURIComponent(id || '');
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const sameOrigin = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (sameOrigin) {
        await sameOrigin.focus();
        sameOrigin.postMessage({ type: 'highlight', id });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// ---------------------------------------------------------------------------
// subscription rotated by the browser -> re-subscribe and tell the server
// ---------------------------------------------------------------------------

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      if (!DEVICE_ID) return;
      const keyRes = await fetch(`${API_BASE}/api/vapid-public-key`);
      const { publicKey } = await keyRes.json();
      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await fetch(`${API_BASE}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Id': DEVICE_ID },
        body: JSON.stringify({ deviceId: DEVICE_ID, subscription: subscription.toJSON() }),
      });
    })().catch(() => undefined),
  );
});
