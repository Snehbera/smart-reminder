import { sendWebPush, type PushResult, type VapidKeys } from './push.ts';
import type { Env, PushPayload, ReminderRow, SubscriptionRow } from './types.ts';

export function vapidFromEnv(env: Env): VapidKeys {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not configured');
  }
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT || 'mailto:admin@example.com',
  };
}

const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

export function buildReminderPayload(r: ReminderRow, opts: { test?: boolean } = {}): PushPayload {
  const test = opts.test === true;
  const notes = (r.notes ?? '').trim();
  return {
    v: 1,
    id: r.id,
    title: truncate(test ? `🔔 Test: ${r.title}` : r.title, 120),
    body: truncate(notes ? `${r.category} • ${notes}` : `${r.category} reminder`, 300),
    category: r.category,
    color: r.badge_color,
    remindAt: r.remind_at_utc,
    timestamp: Date.now(),
    url: `/?highlight=${encodeURIComponent(r.id)}`,
    test,
    nag: r.nag_mode === 1,
    repeat: r.repeat_interval,
  };
}

export function buildGenericTestPayload(): PushPayload {
  return {
    v: 1,
    id: 'test',
    title: '✅ Notifications are working',
    body: 'This is how your pinned reminder alerts will look. The buttons below only appear on supported browsers.',
    category: 'General',
    color: '#6366f1',
    remindAt: new Date().toISOString(),
    timestamp: Date.now(),
    url: '/',
    test: true,
    nag: false,
    repeat: 'none',
  };
}

export interface DeliverySummary {
  results: PushResult[];
  delivered: number;
  gone: string[]; // endpoints the push service reported as expired (404/410)
  transientFailures: number;
  hardFailures: number;
}

/** Sends one payload to every subscription and removes dead (404/410) subscriptions from D1. */
export async function deliver(env: Env, subs: SubscriptionRow[], payload: PushPayload): Promise<DeliverySummary> {
  const vapid = vapidFromEnv(env);
  const json = JSON.stringify(payload);
  const results = await Promise.all(
    subs.map((s) =>
      sendWebPush(vapid, { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, json, {
        urgency: 'high',
        ttl: payload.test ? 60 : 24 * 60 * 60,
      }),
    ),
  );

  const gone = results.filter((r) => r.outcome === 'gone').map((r) => r.endpoint);
  if (gone.length) await deleteSubscriptionsByEndpoint(env.DB, gone);

  return {
    results,
    delivered: results.filter((r) => r.outcome === 'ok').length,
    gone,
    transientFailures: results.filter((r) => r.outcome === 'retry').length,
    hardFailures: results.filter((r) => r.outcome === 'fail').length,
  };
}

export async function deleteSubscriptionsByEndpoint(db: D1Database, endpoints: string[]): Promise<void> {
  if (!endpoints.length) return;
  await db.batch(endpoints.map((e) => db.prepare('DELETE FROM subscriptions WHERE endpoint = ?1').bind(e)));
}

export async function getSubscriptionsForDevice(db: D1Database, deviceId: string): Promise<SubscriptionRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM subscriptions WHERE device_id = ?1')
    .bind(deviceId)
    .all<SubscriptionRow>();
  return results ?? [];
}
