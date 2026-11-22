import type { Reminder, ReminderInput } from './types';

export const API_BASE: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

const DEVICE_KEY = 'sr_device_id';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback for very old browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Anonymous per-browser identity: a UUID kept in localStorage (no login required). */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return uuid(); // storage blocked: session-only identity
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Device-Id': getDeviceId() };
  let body: BodyInit | undefined;
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(API_BASE + path, { ...init, headers, body });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

export interface TestResult {
  sent: number;
  failed: number;
  removed: number;
}

export const api = {
  vapidKey: () => request<{ publicKey: string }>('/api/vapid-public-key'),

  subscribe: (subscription: PushSubscriptionJSON) =>
    request<{ ok: true }>('/api/subscribe', {
      method: 'POST',
      json: { deviceId: getDeviceId(), subscription, userAgent: navigator.userAgent },
    }),

  unsubscribe: (endpoint: string) =>
    request<{ ok: true }>('/api/unsubscribe', { method: 'POST', json: { deviceId: getDeviceId(), endpoint } }),

  testPush: () => request<TestResult>('/api/test', { method: 'POST' }),

  list: async () =>
    (await request<{ reminders: Reminder[] }>(`/api/reminders?deviceId=${encodeURIComponent(getDeviceId())}`)).reminders,

  create: async (input: ReminderInput) =>
    (await request<{ reminder: Reminder }>('/api/reminders', { method: 'POST', json: input })).reminder,

  update: async (id: string, patch: Record<string, unknown>) =>
    (await request<{ reminder: Reminder }>(`/api/reminders/${id}`, { method: 'PATCH', json: patch })).reminder,

  markDone: (r: Reminder) => api.update(r.id, { status: 'completed', occurrenceAt: r.remindAt }),
  snooze: (id: string, minutes = 10) => api.update(id, { action: 'snooze', minutes }),
  reopen: (id: string, minutes = 10) => api.update(id, { action: 'reopen', minutes }),

  remove: (id: string) => request<{ ok: true }>(`/api/reminders/${id}`, { method: 'DELETE' }),

  testReminder: (id: string) => request<TestResult>(`/api/reminders/${id}/test`, { method: 'POST' }),
};
