import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import {
  buildGenericTestPayload,
  buildReminderPayload,
  deliver,
  getSubscriptionsForDevice,
} from './notify.ts';
import { isValidTimeZone, nextOccurrence } from './recurrence.ts';
import { runScheduled } from './scheduled.ts';
import {
  CATEGORY_COLORS,
  REPEAT_INTERVALS,
  type Env,
  type RepeatInterval,
  type ReminderRow,
} from './types.ts';

type AppContext = Context<{ Bindings: Env }>;

// ---------------------------------------------------------------------------
// Limits & helpers
// ---------------------------------------------------------------------------

const MAX_TITLE = 120;
const MAX_NOTES = 500;
const MAX_ACTIVE_REMINDERS_PER_DEVICE = 500;
const MAX_SUBSCRIPTIONS_PER_DEVICE = 10;
const MAX_YEARS_AHEAD = 20;
const DEFAULT_SNOOZE_MINUTES = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

/** Push services we are willing to POST to. Prevents the Worker being used as an open HTTP relay (SSRF). */
const PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
  'push.microsoft.com',
];

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const bad = (message: string) => new HttpError(400, message);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

async function readJson(c: AppContext): Promise<Record<string, unknown>> {
  const body = await c.req.json().catch(() => null);
  if (!isObject(body)) throw bad('Request body must be a JSON object');
  return body;
}

/** The device id is the (unguessable, UUID) credential for a browser. Header preferred; query/body accepted. */
function deviceIdFrom(c: AppContext, body?: Record<string, unknown>): string {
  const candidate =
    c.req.header('X-Device-Id') ?? c.req.query('deviceId') ?? (typeof body?.deviceId === 'string' ? body.deviceId : '');
  if (!candidate || !UUID_RE.test(candidate)) throw new HttpError(401, 'Missing or invalid device id');
  return candidate.toLowerCase();
}

const nowIso = () => new Date().toISOString();

function toIso(value: unknown, field: string): string {
  if (typeof value !== 'string') throw bad(`${field} must be an ISO 8601 date string`);
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw bad(`${field} is not a valid date`);
  return new Date(ms).toISOString();
}

function toFutureIso(value: unknown, field: string): string {
  const iso = toIso(value, field);
  const ms = Date.parse(iso);
  const now = Date.now();
  if (ms < now - 60_000) throw bad(`${field} must be in the future`);
  if (ms > now + MAX_YEARS_AHEAD * 366 * 86_400_000) throw bad(`${field} is too far in the future`);
  return iso;
}

function validTitle(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) throw bad('title is required');
  const t = v.trim();
  if (t.length > MAX_TITLE) throw bad(`title must be at most ${MAX_TITLE} characters`);
  return t;
}

function validNotes(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string') throw bad('notes must be a string');
  const n = v.trim();
  if (n.length > MAX_NOTES) throw bad(`notes must be at most ${MAX_NOTES} characters`);
  return n || null;
}

function validCategory(v: unknown): string {
  if (typeof v !== 'string' || !(v in CATEGORY_COLORS)) {
    throw bad(`category must be one of: ${Object.keys(CATEGORY_COLORS).join(', ')}`);
  }
  return v;
}

function validRepeat(v: unknown): RepeatInterval {
  if (typeof v !== 'string' || !REPEAT_INTERVALS.includes(v as RepeatInterval)) {
    throw bad(`repeatInterval must be one of: ${REPEAT_INTERVALS.join(', ')}`);
  }
  return v as RepeatInterval;
}

function validTimeZone(v: unknown): string {
  if (typeof v !== 'string' || !isValidTimeZone(v)) throw bad('timezone must be a valid IANA time zone');
  return v;
}

function validColor(v: unknown): string {
  if (typeof v !== 'string' || !COLOR_RE.test(v)) throw bad('badgeColor must be a #rrggbb hex color');
  return v.toLowerCase();
}

function validMinutes(v: unknown): number {
  if (v === undefined || v === null) return DEFAULT_SNOOZE_MINUTES;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 7 * 24 * 60) throw bad('minutes must be between 1 and 10080');
  return Math.round(n);
}

function serializeReminder(r: ReminderRow) {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    category: r.category,
    remindAt: r.remind_at_utc,
    timezone: r.timezone,
    repeatInterval: r.repeat_interval,
    status: r.status,
    nagMode: r.nag_mode === 1,
    badgeColor: r.badge_color,
    snoozedUntil: r.snoozed_until,
    lastSentAt: r.last_sent_at,
    createdAt: r.created_at,
  };
}

async function getOwnedReminder(db: D1Database, id: string, deviceId: string): Promise<ReminderRow> {
  const row = await db
    .prepare('SELECT * FROM reminders WHERE id = ?1 AND device_id = ?2')
    .bind(id, deviceId)
    .first<ReminderRow>();
  if (!row) throw new HttpError(404, 'Reminder not found');
  return row;
}

function pushHostAllowed(endpoint: string, env: Env): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const extra = (env.EXTRA_PUSH_HOSTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const host = url.hostname.toLowerCase();
  return [...PUSH_HOST_SUFFIXES, ...extra].some((suffix) => host === suffix || host.endsWith('.' + suffix));
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGIN ?? '*')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return cors({
    origin: (origin) => {
      if (allowed.includes('*')) return '*';
      return allowed.includes(origin) ? origin : '';
    },
    allowHeaders: ['Content-Type', 'X-Device-Id'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86_400,
  })(c, next);
});

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
  console.error('Unhandled error', err);
  return c.json({ error: 'Internal server error' }, 500);
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.get('/', (c) => c.json({ service: 'smart-reminder-api', ok: true }));
app.get('/api/health', (c) => c.json({ ok: true, time: nowIso() }));

/** Trigger the cron runner via HTTP (for local development, background tickers, and manual checks) */
app.all('/api/cron', async (c) => {
  await runScheduled(c.env, Date.now());
  return c.json({ ok: true, time: nowIso() });
});

// --- VAPID public key -------------------------------------------------------
app.get('/api/vapid-public-key', (c) => {
  if (!c.env.VAPID_PUBLIC_KEY) throw new HttpError(500, 'VAPID public key is not configured');
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY });
});

// --- Push subscriptions -----------------------------------------------------
app.post('/api/subscribe', async (c) => {
  const body = await readJson(c);
  const deviceId = deviceIdFrom(c, body);
  const sub = body.subscription;
  if (!isObject(sub) || typeof sub.endpoint !== 'string' || !isObject(sub.keys)) {
    throw bad('subscription must be a PushSubscription JSON object');
  }
  const { endpoint } = sub;
  const p256dh = sub.keys.p256dh;
  const auth = sub.keys.auth;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !p256dh || !auth) {
    throw bad('subscription.keys.p256dh and subscription.keys.auth are required');
  }
  if (endpoint.length > 2048) throw bad('endpoint is too long');
  if (!pushHostAllowed(endpoint, c.env)) throw bad('Unsupported push service endpoint');

  const userAgent = typeof body.userAgent === 'string' ? body.userAgent.slice(0, 300) : null;
  const email = typeof body.email === 'string' && body.email.length <= 254 ? body.email.trim() || null : null;
  const now = nowIso();

  await c.env.DB.prepare(
    `INSERT INTO subscriptions (id, device_id, email, endpoint, p256dh, auth, user_agent, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
     ON CONFLICT(endpoint) DO UPDATE SET
       device_id = excluded.device_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       user_agent = excluded.user_agent,
       email = COALESCE(excluded.email, subscriptions.email),
       updated_at = excluded.updated_at`,
  )
    .bind(crypto.randomUUID(), deviceId, email, endpoint, p256dh, auth, userAgent, now)
    .run();

  // Keep only the newest N subscriptions per device (old browsers/profiles that re-subscribed).
  await c.env.DB.prepare(
    `DELETE FROM subscriptions WHERE device_id = ?1 AND id NOT IN (
       SELECT id FROM subscriptions WHERE device_id = ?1 ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ?2)`,
  )
    .bind(deviceId, MAX_SUBSCRIPTIONS_PER_DEVICE)
    .run();

  return c.json({ ok: true });
});

app.post('/api/unsubscribe', async (c) => {
  const body = await readJson(c);
  const deviceId = deviceIdFrom(c, body);
  if (typeof body.endpoint !== 'string') throw bad('endpoint is required');
  await c.env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?1 AND device_id = ?2')
    .bind(body.endpoint, deviceId)
    .run();
  return c.json({ ok: true });
});

/** Generic "is my pipeline working?" test used by the banner's "Send Test Notification" button. */
app.post('/api/test', async (c) => {
  const deviceId = deviceIdFrom(c);
  const subs = await getSubscriptionsForDevice(c.env.DB, deviceId);
  if (!subs.length) throw new HttpError(409, 'No push subscription found for this device. Enable notifications first.');
  const summary = await deliver(c.env, subs, buildGenericTestPayload());
  return c.json({ sent: summary.delivered, failed: summary.results.length - summary.delivered, removed: summary.gone.length });
});

// --- Reminders --------------------------------------------------------------
app.get('/api/reminders', async (c) => {
  const deviceId = deviceIdFrom(c);
  const { results } = await c.env.DB.prepare('SELECT * FROM reminders WHERE device_id = ?1 ORDER BY remind_at_utc ASC')
    .bind(deviceId)
    .all<ReminderRow>();
  return c.json({ reminders: (results ?? []).map(serializeReminder) });
});

app.post('/api/reminders', async (c) => {
  const body = await readJson(c);
  const deviceId = deviceIdFrom(c, body);

  const title = validTitle(body.title);
  const notes = validNotes(body.notes);
  const category = body.category === undefined ? 'General' : validCategory(body.category);
  const timezone = validTimeZone(body.timezone);
  const repeat = body.repeatInterval === undefined ? 'none' : validRepeat(body.repeatInterval);
  const remindAt = toFutureIso(body.remindAt, 'remindAt');
  const nag = body.nagMode === true || body.nagMode === 1 ? 1 : 0;
  const color = body.badgeColor === undefined ? CATEGORY_COLORS[category] : validColor(body.badgeColor);

  const count = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM reminders WHERE device_id = ?1 AND status != 'completed'`,
  )
    .bind(deviceId)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_ACTIVE_REMINDERS_PER_DEVICE) {
    throw bad(`You can have at most ${MAX_ACTIVE_REMINDERS_PER_DEVICE} active reminders`);
  }

  const id = crypto.randomUUID();
  const now = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO reminders
       (id, device_id, title, notes, category, remind_at_utc, anchor_utc, timezone, repeat_interval,
        status, nag_mode, badge_color, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7, ?8, 'pending', ?9, ?10, ?11, ?11)`,
  )
    .bind(id, deviceId, title, notes, category, remindAt, timezone, repeat, nag, color, now)
    .run();

  const row = await getOwnedReminder(c.env.DB, id, deviceId);
  return c.json({ reminder: serializeReminder(row) }, 201);
});

/**
 * PATCH body may combine:
 *   - field edits: title, notes, category, remindAt (reschedule), timezone, repeatInterval, nagMode, badgeColor
 *   - status: 'completed' | 'snoozed' | 'pending'     (shorthand for the actions below)
 *   - action: 'done' | 'snooze' | 'reopen', minutes?, occurrenceAt?
 *
 * `occurrenceAt` is the occurrence the user acted on (sent inside the push payload). For recurring reminders it
 * makes "Mark Done" from a notification an acknowledgement (no skipped occurrence) and makes "Snooze" re-alert
 * in N minutes without disturbing the already-scheduled next occurrence.
 */
app.patch('/api/reminders/:id', async (c) => {
  const body = await readJson(c);
  const deviceId = deviceIdFrom(c, body);
  const current = await getOwnedReminder(c.env.DB, c.req.param('id'), deviceId);

  const now = Date.now();
  const next: ReminderRow = { ...current };

  // 1) Field edits
  if ('title' in body) next.title = validTitle(body.title);
  if ('notes' in body) next.notes = validNotes(body.notes);
  if ('category' in body) {
    next.category = validCategory(body.category);
    if (!('badgeColor' in body)) next.badge_color = CATEGORY_COLORS[next.category];
  }
  if ('badgeColor' in body) next.badge_color = validColor(body.badgeColor);
  if ('timezone' in body) next.timezone = validTimeZone(body.timezone);
  if ('repeatInterval' in body) next.repeat_interval = validRepeat(body.repeatInterval);
  if ('nagMode' in body) next.nag_mode = body.nagMode === true || body.nagMode === 1 ? 1 : 0;

  if ('remindAt' in body) {
    const iso = toFutureIso(body.remindAt, 'remindAt');
    next.remind_at_utc = iso;
    next.anchor_utc = iso;
    next.status = 'pending';
    next.snoozed_until = null;
    next.last_sent_at = null;
    next.attempts = 0;
  }

  // 2) Actions
  let action: string | undefined;
  if (body.action !== undefined) {
    if (body.action !== 'done' && body.action !== 'snooze' && body.action !== 'reopen') {
      throw bad("action must be 'done', 'snooze' or 'reopen'");
    }
    action = body.action;
  } else if (body.status !== undefined) {
    if (body.status === 'completed') action = 'done';
    else if (body.status === 'snoozed') action = 'snooze';
    else if (body.status === 'pending') action = 'reopen';
    else throw bad("status must be 'completed', 'snoozed' or 'pending'");
  }
  const occurrenceAt = body.occurrenceAt === undefined ? null : toIso(body.occurrenceAt, 'occurrenceAt');

  if (action === 'done') {
    const recurring = next.repeat_interval !== 'none';
    if (!recurring) {
      next.status = 'completed';
      next.snoozed_until = null;
    } else if (occurrenceAt && occurrenceAt < next.remind_at_utc) {
      // Acknowledging an occurrence that already rolled forward (non-nag recurring): keep the series intact.
      next.status = 'pending';
      next.snoozed_until = null;
    } else {
      // Done with this occurrence -> roll the series forward to the next one.
      const after = Math.max(now, Date.parse(next.remind_at_utc));
      const upcoming = nextOccurrence(next.anchor_utc, next.repeat_interval, next.timezone, after);
      if (upcoming) {
        next.remind_at_utc = upcoming;
        next.status = 'pending';
        next.snoozed_until = null;
        next.last_sent_at = null;
      } else {
        next.status = 'completed';
        next.snoozed_until = null;
      }
    }
  } else if (action === 'snooze') {
    const minutes = validMinutes(body.minutes);
    const alreadyRolledForward = occurrenceAt !== null && occurrenceAt < next.remind_at_utc;
    // Snoozing an upcoming (not yet fired) reminder delays it; snoozing an alert that fired re-alerts N minutes from now.
    const base =
      next.status === 'pending' && !alreadyRolledForward ? Math.max(now, Date.parse(next.remind_at_utc)) : now;
    next.status = 'snoozed';
    next.snoozed_until = new Date(base + minutes * 60_000).toISOString();
  } else if (action === 'reopen') {
    if (!('remindAt' in body)) {
      const minutes = validMinutes(body.minutes);
      const iso = new Date(now + minutes * 60_000).toISOString();
      next.remind_at_utc = iso;
      next.anchor_utc = iso;
    }
    next.status = 'pending';
    next.snoozed_until = null;
    next.last_sent_at = null;
    next.attempts = 0;
  }

  await c.env.DB.prepare(
    `UPDATE reminders SET
       title = ?1, notes = ?2, category = ?3, remind_at_utc = ?4, anchor_utc = ?5, timezone = ?6,
       repeat_interval = ?7, status = ?8, nag_mode = ?9, badge_color = ?10, snoozed_until = ?11,
       last_sent_at = ?12, attempts = ?13, updated_at = ?14
     WHERE id = ?15 AND device_id = ?16`,
  )
    .bind(
      next.title,
      next.notes,
      next.category,
      next.remind_at_utc,
      next.anchor_utc,
      next.timezone,
      next.repeat_interval,
      next.status,
      next.nag_mode,
      next.badge_color,
      next.snoozed_until,
      next.last_sent_at,
      next.attempts,
      new Date(now).toISOString(),
      current.id,
      deviceId,
    )
    .run();

  const row = await getOwnedReminder(c.env.DB, current.id, deviceId);
  return c.json({ reminder: serializeReminder(row) });
});

app.delete('/api/reminders/:id', async (c) => {
  const deviceId = deviceIdFrom(c);
  const res = await c.env.DB.prepare('DELETE FROM reminders WHERE id = ?1 AND device_id = ?2')
    .bind(c.req.param('id'), deviceId)
    .run();
  if (!res.meta.changes) throw new HttpError(404, 'Reminder not found');
  return c.json({ ok: true });
});

/** Sends this reminder's notification right now (marked as a test: its action buttons don't change the reminder). */
app.post('/api/reminders/:id/test', async (c) => {
  const deviceId = deviceIdFrom(c);
  const reminder = await getOwnedReminder(c.env.DB, c.req.param('id'), deviceId);
  const subs = await getSubscriptionsForDevice(c.env.DB, deviceId);
  if (!subs.length) throw new HttpError(409, 'No push subscription found for this device. Enable notifications first.');
  const summary = await deliver(c.env, subs, buildReminderPayload(reminder, { test: true }));
  return c.json({ sent: summary.delivered, failed: summary.results.length - summary.delivered, removed: summary.gone.length });
});

// ---------------------------------------------------------------------------
// Worker entry
// ---------------------------------------------------------------------------

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduled(env, event.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
