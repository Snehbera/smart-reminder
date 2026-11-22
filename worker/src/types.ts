export interface Env {
  DB: D1Database;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  ALLOWED_ORIGIN?: string;
  EXTRA_PUSH_HOSTS?: string;
}

export type RepeatInterval = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type ReminderStatus = 'pending' | 'sent' | 'snoozed' | 'completed';

export const REPEAT_INTERVALS: RepeatInterval[] = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

export const CATEGORY_COLORS: Record<string, string> = {
  General: '#6366f1',
  Personal: '#6366f1',
  Work: '#0ea5e9',
  Bills: '#f59e0b',
  Health: '#10b981',
  Important: '#ef4444',
};

export interface ReminderRow {
  id: string;
  device_id: string;
  user_id?: string | null;
  title: string;
  notes: string | null;
  category: string;
  remind_at_utc: string;
  anchor_utc: string;
  timezone: string;
  repeat_interval: RepeatInterval;
  status: ReminderStatus;
  nag_mode: number;
  badge_color: string;
  snoozed_until: string | null;
  last_sent_at: string | null;
  attempts: number;
  created_at: string;
  updated_at: string | null;
}

export interface SubscriptionRow {
  id: string;
  device_id: string;
  user_id?: string | null;
  email: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
  name: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface SessionRow {
  token: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

/** JSON sent (encrypted) to the service worker. */
export interface PushPayload {
  v: 1;
  id: string;
  title: string;
  body: string;
  category: string;
  color: string;
  /** The occurrence this alert belongs to (ISO). Lets "Mark Done"/"Snooze" act on the right occurrence of a recurring reminder. */
  remindAt: string;
  timestamp: number;
  url: string;
  test: boolean;
  nag: boolean;
  repeat: RepeatInterval;
}
