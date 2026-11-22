export type RepeatInterval = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type ReminderStatus = 'pending' | 'sent' | 'snoozed' | 'completed';
export type CategoryName = 'Personal' | 'Work' | 'Bills' | 'Health' | 'Important';
export type NavPage = 'upcoming' | 'overdue' | 'completed' | 'create' | 'settings';

export interface User {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthResponse {
  ok: boolean;
  user: User;
  token: string;
}

export type FrequencyFilter = 'all' | 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type AlertChannel = 'push' | 'email' | 'both';

export interface Reminder {
  id: string;
  title: string;
  notes: string | null;
  category: string;
  /** Next scheduled occurrence (ISO, UTC). */
  remindAt: string;
  timezone: string;
  repeatInterval: RepeatInterval;
  status: ReminderStatus;
  nagMode: boolean;
  badgeColor: string;
  channel?: AlertChannel;
  email?: string | null;
  emailOffsetMinutes?: number;
  emailSentAt?: string | null;
  /** When status === 'snoozed': when the re-alert fires (ISO, UTC). */
  snoozedUntil: string | null;
  lastSentAt: string | null;
  createdAt: string;
}

export interface ReminderInput {
  title: string;
  notes: string | null;
  category: CategoryName;
  remindAt: string;
  timezone: string;
  repeatInterval: RepeatInterval;
  nagMode: boolean;
  badgeColor: string;
  channel?: AlertChannel;
  email?: string | null;
  emailOffsetMinutes?: number;
}

export const CATEGORIES: { name: CategoryName; color: string }[] = [
  { name: 'Personal', color: '#6366f1' },
  { name: 'Work', color: '#0ea5e9' },
  { name: 'Bills', color: '#f59e0b' },
  { name: 'Health', color: '#10b981' },
  { name: 'Important', color: '#ef4444' },
];

export const REPEAT_OPTIONS: { value: RepeatInterval; label: string }[] = [
  { value: 'none', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export function categoryColor(name: string): string {
  return CATEGORIES.find((c) => c.name === name)?.color ?? '#6366f1';
}
