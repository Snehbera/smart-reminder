import type { RepeatInterval } from './types.ts';

/**
 * Timezone-aware recurrence.
 *
 * Occurrences are computed from the ORIGINAL anchor (not from the previous occurrence), in the reminder's
 * own IANA timezone, so that:
 *   - "monthly on the 31st" goes Jan 31 -> Feb 28 -> Mar 31 (no permanent drift to the 28th)
 *   - "daily at 9:00" stays at 9:00 local time across daylight-saving changes
 *   - "yearly on Feb 29" lands on Feb 28 in non-leap years and on Feb 29 again in leap years
 */

interface Parts {
  y: number;
  m: number; // 1-12
  d: number;
  h: number;
  mi: number;
  s: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function utcToLocalParts(utcMs: number, timeZone: string): Parts {
  const parts = formatterFor(timeZone).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    y: get('year'),
    m: get('month'),
    d: get('day'),
    h: get('hour') % 24,
    mi: get('minute'),
    s: get('second'),
  };
}

const partsAsUtcMs = (p: Parts) => Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);

function offsetMs(utcMs: number, timeZone: string): number {
  const whole = utcMs - (((utcMs % 1000) + 1000) % 1000);
  return partsAsUtcMs(utcToLocalParts(whole, timeZone)) - whole;
}

/** Converts a wall-clock time in `timeZone` to a UTC timestamp (handles DST transitions). */
export function localPartsToUtcMs(p: Parts, timeZone: string): number {
  const asUtc = partsAsUtcMs(p);
  const firstGuess = asUtc - offsetMs(asUtc, timeZone);
  return asUtc - offsetMs(firstGuess, timeZone);
}

const daysInMonth = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0)).getUTCDate();

function addUnits(a: Parts, interval: Exclude<RepeatInterval, 'none'>, n: number): Parts {
  switch (interval) {
    case 'daily':
    case 'weekly': {
      const days = interval === 'daily' ? n : n * 7;
      const d = new Date(Date.UTC(a.y, a.m - 1, a.d + days));
      return { ...a, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
    }
    case 'monthly': {
      const total = a.m - 1 + n;
      const y = a.y + Math.floor(total / 12);
      const m = (((total % 12) + 12) % 12) + 1;
      return { ...a, y, m, d: Math.min(a.d, daysInMonth(y, m)) };
    }
    case 'yearly': {
      const y = a.y + n;
      return { ...a, y, d: Math.min(a.d, daysInMonth(y, a.m)) };
    }
  }
}

// Upper bounds (ms) of one step — used only to skip ahead quickly without ever overshooting.
const MAX_STEP_MS: Record<Exclude<RepeatInterval, 'none'>, number> = {
  daily: 25 * 3600_000,
  weekly: 7 * 86400_000 + 3600_000,
  monthly: 31 * 86400_000,
  yearly: 366 * 86400_000,
};

/**
 * First occurrence strictly AFTER `afterMs`, as an ISO UTC string. Returns null for non-recurring reminders.
 */
export function nextOccurrence(
  anchorIso: string,
  interval: RepeatInterval,
  timeZone: string,
  afterMs: number,
): string | null {
  if (interval === 'none') return null;
  const anchorMs = Date.parse(anchorIso);
  if (Number.isNaN(anchorMs)) return null;

  const anchor = utcToLocalParts(anchorMs, timeZone);
  let n = Math.max(1, Math.floor((afterMs - anchorMs) / MAX_STEP_MS[interval]));
  for (let guard = 0; guard < 20_000; guard++, n++) {
    const candidate = localPartsToUtcMs(addUnits(anchor, interval, n), timeZone);
    if (candidate > afterMs) return new Date(candidate).toISOString();
  }
  return null;
}
