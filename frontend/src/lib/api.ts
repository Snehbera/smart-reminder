import type { AuthResponse, Reminder, ReminderInput, User } from './types';

export const API_BASE: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

const DEVICE_KEY = 'sr_device_id';
const TOKEN_KEY = 'sr_auth_token';
const USER_KEY = 'sr_user';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: User | null): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {}
}

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
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
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
  pushSent?: number;
  emailSent?: boolean;
  failed?: number;
  removed?: number;
}

export const api = {
  // --- Auth ---
  register: async (email: string, password: string, name?: string) => {
    const res = await request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      json: { email, password, name, deviceId: getDeviceId() },
    });
    setAuthToken(res.token);
    setStoredUser(res.user);
    return res;
  },

  login: async (email: string, password: string) => {
    const res = await request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      json: { email, password, deviceId: getDeviceId() },
    });
    setAuthToken(res.token);
    setStoredUser(res.user);
    return res;
  },

  getMe: async () => {
    const res = await request<{ user: User }>('/api/auth/me');
    setStoredUser(res.user);
    return res.user;
  },

  logout: async () => {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } catch {}
    setAuthToken(null);
    setStoredUser(null);
  },

  // --- Push ---
  vapidKey: () => request<{ publicKey: string }>('/api/vapid-public-key'),

  subscribe: (subscription: PushSubscriptionJSON) =>
    request<{ ok: true }>('/api/subscribe', {
      method: 'POST',
      json: { deviceId: getDeviceId(), subscription, userAgent: navigator.userAgent },
    }),

  unsubscribe: (endpoint: string) =>
    request<{ ok: true }>('/api/unsubscribe', { method: 'POST', json: { deviceId: getDeviceId(), endpoint } }),

  testPush: () => request<TestResult>('/api/test', { method: 'POST' }),

  // --- Reminders ---
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
