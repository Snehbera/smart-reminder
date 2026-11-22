import { buildReminderEmailHtml, sendEmail } from './email.ts';
import { buildReminderPayload, deliver } from './notify.ts';
import { nextOccurrence } from './recurrence.ts';
import type { Env, ReminderRow, ReminderStatus, SubscriptionRow } from './types.ts';

/** Max reminders processed per cron tick. Keeps each run inside Workers subrequest limits; any backlog drains next minute. */
const MAX_PER_TICK = 40;
const CONCURRENCY = 5;
const NAG_INTERVAL_MS = 15 * 60 * 1000;
const MAX_TRANSIENT_ATTEMPTS = 5;
const COMPLETED_RETENTION_DAYS = 90;

type FireKind = 'due' | 'snooze' | 'nag';
interface Job {
  kind: FireKind;
  row: ReminderRow;
}

/**
 * Cron entry point (runs every minute). Finds everything that must alert now, sends Web Push to the owner's
 * devices, then advances each reminder's state.
 *
 *   due     status='pending'  AND remind_at_utc  <= now
 *   snooze  status='snoozed'  AND snoozed_until  <= now
 *   nag     status='sent' AND nag_mode=1 AND last_sent_at <= now - 15min   (until the user taps "Mark Done")
 */
export async function runScheduled(env: Env, scheduledTime: number): Promise<void> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const nagCutoffIso = new Date(now - NAG_INTERVAL_MS).toISOString();

  const [due, snoozed, nag] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM reminders WHERE status = 'pending' AND remind_at_utc <= ?1 ORDER BY remind_at_utc ASC LIMIT ?2`,
    )
      .bind(nowIso, MAX_PER_TICK)
      .all<ReminderRow>(),
    env.DB.prepare(
      `SELECT * FROM reminders WHERE status = 'snoozed' AND snoozed_until <= ?1 ORDER BY snoozed_until ASC LIMIT ?2`,
    )
      .bind(nowIso, MAX_PER_TICK)
      .all<ReminderRow>(),
    env.DB.prepare(
      `SELECT * FROM reminders
        WHERE status = 'sent' AND nag_mode = 1 AND COALESCE(last_sent_at, remind_at_utc) <= ?1
        ORDER BY COALESCE(last_sent_at, remind_at_utc) ASC LIMIT ?2`,
    )
      .bind(nagCutoffIso, MAX_PER_TICK)
      .all<ReminderRow>(),
  ]);

  const jobs: Job[] = [
    ...(due.results ?? []).map((row) => ({ kind: 'due' as const, row })),
    ...(snoozed.results ?? []).map((row) => ({ kind: 'snooze' as const, row })),
    ...(nag.results ?? []).map((row) => ({ kind: 'nag' as const, row })),
  ].slice(0, MAX_PER_TICK);

  if (jobs.length) {
    const subsByReminder = await loadSubscriptionsForJobs(env.DB, jobs);
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      await Promise.all(
        jobs.slice(i, i + CONCURRENCY).map((job) =>
          processJob(env, job, subsByReminder.get(job.row.id) ?? [], now).catch((err) =>
            console.error('job failed', job.kind, job.row.id, String(err)),
          ),
        ),
      );
    }
    console.log(`cron ${new Date(scheduledTime).toISOString()}: processed ${jobs.length} reminder(s)`);
  }

  // Early email alerts (e.g. 5m, 15m, 1h before scheduled time)
  try {
    const earlyReminders = await env.DB.prepare(
      `SELECT * FROM reminders
        WHERE status = 'pending'
          AND (channel = 'email' OR channel = 'both')
          AND email_offset_minutes > 0
          AND email_sent_at IS NULL
          AND datetime(remind_at_utc, '-' || email_offset_minutes || ' minutes') <= ?1
        LIMIT 20`,
    )
      .bind(nowIso)
      .all<ReminderRow>();

    for (const row of earlyReminders.results ?? []) {
      const targetEmail = await resolveEmail(env.DB, row);
      if (targetEmail) {
        const { subject, html } = buildReminderEmailHtml(row, 'early', row.email_offset_minutes);
        const res = await sendEmail(env, { to: targetEmail, subject, html });
        if (res.ok && !res.mock) {
          await env.DB.prepare('UPDATE reminders SET email_sent_at = ?1 WHERE id = ?2')
            .bind(nowIso, row.id)
            .run();
        }
      }
    }
  } catch (err) {
    console.error('Failed to process early email alerts', err);
  }

  // Hourly housekeeping
  if (new Date(scheduledTime).getUTCMinutes() === 0) {
    const cutoff = new Date(now - COMPLETED_RETENTION_DAYS * 86_400_000).toISOString();
    await env.DB.prepare(`DELETE FROM reminders WHERE status = 'completed' AND COALESCE(updated_at, created_at) < ?1`)
      .bind(cutoff)
      .run();
  }
}

async function loadSubscriptionsForJobs(db: D1Database, jobs: Job[]): Promise<Map<string, SubscriptionRow[]>> {
  const map = new Map<string, SubscriptionRow[]>();
  const userIds = [...new Set(jobs.map((j) => j.row.user_id).filter((id): id is string => Boolean(id)))];
  const deviceIds = [...new Set(jobs.map((j) => j.row.device_id).filter(Boolean))];

  const userSubs = new Map<string, SubscriptionRow[]>();
  for (let i = 0; i < userIds.length; i += 50) {
    const chunk = userIds.slice(i, i + 50);
    const placeholders = chunk.map((_, idx) => `?${idx + 1}`).join(',');
    const { results } = await db
      .prepare(`SELECT * FROM subscriptions WHERE user_id IN (${placeholders})`)
      .bind(...chunk)
      .all<SubscriptionRow>();
    for (const s of results ?? []) {
      if (s.user_id) {
        const list = userSubs.get(s.user_id) ?? [];
        list.push(s);
        userSubs.set(s.user_id, list);
      }
    }
  }

  const deviceSubs = new Map<string, SubscriptionRow[]>();
  for (let i = 0; i < deviceIds.length; i += 50) {
    const chunk = deviceIds.slice(i, i + 50);
    const placeholders = chunk.map((_, idx) => `?${idx + 1}`).join(',');
    const { results } = await db
      .prepare(`SELECT * FROM subscriptions WHERE device_id IN (${placeholders})`)
      .bind(...chunk)
      .all<SubscriptionRow>();
    for (const s of results ?? []) {
      const list = deviceSubs.get(s.device_id) ?? [];
      list.push(s);
      deviceSubs.set(s.device_id, list);
    }
  }

  for (const job of jobs) {
    let subs: SubscriptionRow[] = [];
    if (job.row.user_id && userSubs.has(job.row.user_id)) {
      subs = [...(userSubs.get(job.row.user_id) ?? [])];
    }
    const dSubs = deviceSubs.get(job.row.device_id) ?? [];
    const endpoints = new Set(subs.map((s) => s.endpoint));
    for (const ds of dSubs) {
      if (!endpoints.has(ds.endpoint)) {
        subs.push(ds);
        endpoints.add(ds.endpoint);
      }
    }
    map.set(job.row.id, subs);
  }

  return map;
}

async function resolveEmail(db: D1Database, row: ReminderRow): Promise<string | null> {
  if (row.email && row.email.includes('@')) return row.email.trim();
  if (row.user_id) {
    const user = await db.prepare('SELECT email FROM users WHERE id = ?1').bind(row.user_id).first<{ email: string }>();
    if (user?.email) return user.email;
  }
  return null;
}

async function maybeSendEmailAlert(env: Env, row: ReminderRow, kind: FireKind): Promise<void> {
  const targetEmail = await resolveEmail(env.DB, row);
  if (!targetEmail) return;

  const emailType = kind === 'nag' ? 'overdue' : 'due';
  const { subject, html } = buildReminderEmailHtml(row, emailType);
  const res = await sendEmail(env, { to: targetEmail, subject, html });
  if (res.ok && !res.mock) {
    await env.DB.prepare('UPDATE reminders SET email_sent_at = ?1 WHERE id = ?2')
      .bind(new Date().toISOString(), row.id)
      .run();
  }
}

async function processJob(env: Env, { kind, row }: Job, subs: SubscriptionRow[], now: number): Promise<void> {
  const nowIso = new Date(now).toISOString();
  let delivered = 0;

  const sendPush = row.channel !== 'email';
  if (sendPush && subs.length) {
    const summary = await deliver(env, subs, buildReminderPayload(row));
    delivered = summary.delivered;

    // Only transient failures and nothing got through -> keep the reminder due and retry next minute (bounded).
    if (delivered === 0 && summary.transientFailures > 0 && row.attempts + 1 < MAX_TRANSIENT_ATTEMPTS) {
      await env.DB.prepare(`UPDATE reminders SET attempts = attempts + 1 WHERE id = ?1`).bind(row.id).run();
      return;
    }
  }

  // Send email alert if enabled for this reminder (due or nag/overdue)
  const sendEmailAlert = row.channel === 'email' || row.channel === 'both';
  if (sendEmailAlert) {
    await maybeSendEmailAlert(env, row, kind).catch((err) =>
      console.error('Failed to send reminder email', row.id, err),
    );
  }

  const next = transition(row, kind, now);
  const guard = guardClause(kind);

  await env.DB.prepare(
    `UPDATE reminders
        SET status = ?1, remind_at_utc = ?2, snoozed_until = ?3, last_sent_at = ?4, attempts = 0, updated_at = ?5
      WHERE id = ?6 AND ${guard.sql}`,
  )
    .bind(next.status, next.remind_at_utc, next.snoozed_until, nowIso, nowIso, row.id, ...guard.binds(row))
    .run();
}

/** Optimistic guard: if the user edited / completed the reminder while we were sending, we don't overwrite it. */
function guardClause(kind: FireKind): { sql: string; binds: (r: ReminderRow) => unknown[] } {
  switch (kind) {
    case 'due':
      return { sql: `status = 'pending' AND remind_at_utc = ?7`, binds: (r) => [r.remind_at_utc] };
    case 'snooze':
      return { sql: `status = 'snoozed' AND snoozed_until = ?7`, binds: (r) => [r.snoozed_until] };
    case 'nag':
      return { sql: `status = 'sent' AND remind_at_utc = ?7`, binds: (r) => [r.remind_at_utc] };
  }
}

export interface NextState {
  status: ReminderStatus;
  remind_at_utc: string;
  snoozed_until: string | null;
}

/** Pure state machine for what happens to a reminder right after it alerted. */
export function transition(row: ReminderRow, kind: FireKind, now: number): NextState {
  const recurring = row.repeat_interval !== 'none';
  const nag = row.nag_mode === 1;
  const advance = (): string | null => nextOccurrence(row.anchor_utc, row.repeat_interval, row.timezone, now);
  const keep: NextState = { status: 'sent', remind_at_utc: row.remind_at_utc, snoozed_until: null };

  if (kind === 'nag') return keep; // stay 'sent'; last_sent_at moves forward -> next nag in 15 min

  if (kind === 'due') {
    if (!recurring) return keep;
    if (nag) return keep; // recurring + nag: wait for "Mark Done", which rolls it to the next occurrence
    const next = advance();
    return next ? { status: 'pending', remind_at_utc: next, snoozed_until: null } : keep;
  }

  // kind === 'snooze' (a snoozed alert just fired again)
  if (!recurring) return keep;
  const occurrenceWasDue = Date.parse(row.remind_at_utc) <= now;
  if (nag) {
    return occurrenceWasDue ? keep : { status: 'pending', remind_at_utc: row.remind_at_utc, snoozed_until: null };
  }
  if (occurrenceWasDue) {
    const next = advance();
    if (next) return { status: 'pending', remind_at_utc: next, snoozed_until: null };
    return keep;
  }
  return { status: 'pending', remind_at_utc: row.remind_at_utc, snoozed_until: null };
}
