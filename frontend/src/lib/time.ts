import type { Reminder } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Date -> value for <input type="datetime-local"> in the browser's local time. */
export function toLocalInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** <input type="datetime-local"> value (interpreted as LOCAL time) -> ISO 8601 UTC string. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value); // no zone suffix => parsed as local time
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** Adds calendar months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

export const presets = {
  inMinutes: (m: number) => new Date(Date.now() + m * 60_000),
  tomorrowAt9: () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  },
  nextMonth: () => addMonths(new Date(), 1),
  nextYear: () => addMonths(new Date(), 12),
};

/** The moment a reminder will next alert (snoozed reminders alert at snoozedUntil). */
export function effectiveAt(r: Reminder): Date {
  return new Date(r.status === 'snoozed' && r.snoozedUntil ? r.snoozedUntil : r.remindAt);
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** "in 2 hours 14 mins", "in 11 months, 4 days", "due now". Calendar-aware for months/years. */
export function formatCountdown(target: Date, now: Date = new Date()): string {
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return 'due now';
  if (diff < 60_000) return `in ${plural(Math.max(1, Math.ceil(diff / 1000)), 'sec')}`;

  let months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  if (addMonths(now, months).getTime() > target.getTime()) months -= 1;
  months = Math.max(0, months);
  const rest = target.getTime() - addMonths(now, months).getTime();

  const years = Math.floor(months / 12);
  const mo = months % 12;
  const days = Math.floor(rest / 86_400_000);
  const hours = Math.floor((rest % 86_400_000) / 3_600_000);
  const mins = Math.floor((rest % 3_600_000) / 60_000);

  if (years > 0) return 'in ' + [plural(years, 'year'), mo ? plural(mo, 'month') : ''].filter(Boolean).join(', ');
  if (mo > 0) return 'in ' + [plural(mo, 'month'), days ? plural(days, 'day') : ''].filter(Boolean).join(', ');
  if (days > 0) return 'in ' + [plural(days, 'day'), hours ? plural(hours, 'hour') : ''].filter(Boolean).join(' ');
  if (hours > 0) return 'in ' + [plural(hours, 'hour'), mins ? plural(mins, 'min') : ''].filter(Boolean).join(' ');
  return 'in ' + plural(mins, 'min');
}

export function formatAgo(from: Date, now: Date = new Date()): string {
  const diff = now.getTime() - from.getTime();
  if (diff < 60_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${plural(mins, 'min')} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${plural(hours, 'hour')} ago`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${plural(days, 'day')} ago`;
  return `${plural(Math.floor(days / 30), 'month')} ago`;
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
