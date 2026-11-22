// Run with:  npm test   (Node 22+; uses --experimental-strip-types to load the TypeScript sources directly)
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { b64urlDecode, b64urlEncode, encryptPayload, getVapidJwt } from '../src/push.ts';
import { nextOccurrence } from '../src/recurrence.ts';
import { transition } from '../src/scheduled.ts';

const subtle = webcrypto.subtle;
const enc = new TextEncoder();
let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed++;
  console.log('  ✓', name);
};
const concat = (...a) => {
  const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of a) (out.set(x, o), (o += x.length));
  return out;
};

console.log('Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID)');

// Independent receiver-side implementation, written straight from RFC 8291 section 3.4.
async function decryptAsUserAgent(uaPrivateKey, uaPublic, authSecret, body) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0, false);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  assert.equal(rs, 4096);
  assert.equal(idlen, 65);

  const asKey = await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = await subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPrivateKey, 256);

  const hmac = async (key, data) => {
    const k = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await subtle.sign('HMAC', k, data));
  };
  const prkKey = await hmac(authSecret, new Uint8Array(ecdh)); // HKDF-Extract
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = (await hmac(prkKey, concat(keyInfo, new Uint8Array([1])))).slice(0, 32); // HKDF-Expand, 1 block
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext));
  assert.equal(plain[plain.length - 1], 2, 'last-record delimiter');
  return new TextDecoder().decode(plain.slice(0, -1));
}

await test('encryptPayload round-trips with an independent RFC 8291 receiver', async () => {
  const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPublic = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
  const authSecret = webcrypto.getRandomValues(new Uint8Array(16));
  const message = JSON.stringify({ title: 'Pay rent 🏠', body: 'Bills • due today', n: 'x'.repeat(1500) });

  const body = await encryptPayload(
    { p256dh: b64urlEncode(uaPublic), auth: b64urlEncode(authSecret) },
    enc.encode(message),
  );
  assert.equal(await decryptAsUserAgent(ua.privateKey, uaPublic, authSecret, body), message);
});

await test('encryptPayload rejects oversized payloads', async () => {
  const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPublic = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
  await assert.rejects(
    encryptPayload({ p256dh: b64urlEncode(uaPublic), auth: b64urlEncode(new Uint8Array(16)) }, new Uint8Array(5000)),
    /too large/,
  );
});

await test('VAPID JWT is a valid ES256 JWT that verifies with the public key', async () => {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await subtle.exportKey('jwk', pair.privateKey);
  const pubRaw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const keys = { publicKey: b64urlEncode(pubRaw), privateKey: jwk.d, subject: 'mailto:test@example.com' };

  const jwt = await getVapidJwt(keys, 'https://fcm.googleapis.com');
  const [h, p, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64urlDecode(h))), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.sub, 'mailto:test@example.com');
  const ttl = claims.exp - Math.floor(Date.now() / 1000);
  assert.ok(ttl > 11 * 3600 && ttl <= 12 * 3600, 'exp within 12h (<= 24h required by spec)');
  assert.equal(b64urlDecode(s).length, 64, 'raw r||s signature');
  const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, b64urlDecode(s), enc.encode(`${h}.${p}`));
  assert.equal(ok, true);
});

console.log('Recurrence');
const iso = (s) => new Date(s).toISOString();

await test('daily keeps local wall-clock time across a DST change (America/New_York)', () => {
  // 9:00 EST on 2026-03-07 (UTC-5) -> 9:00 EDT on 2026-03-09 (UTC-4) after DST starts on Mar 8
  const anchor = iso('2026-03-07T14:00:00Z');
  const next = nextOccurrence(anchor, 'daily', 'America/New_York', Date.parse('2026-03-08T20:00:00Z'));
  assert.equal(next, iso('2026-03-09T13:00:00Z'));
});

await test('monthly on the 31st clamps to month end but does not drift', () => {
  const anchor = iso('2026-01-31T04:30:00Z'); // 10:00 IST on Jan 31
  const feb = nextOccurrence(anchor, 'monthly', 'Asia/Kolkata', Date.parse('2026-02-01T00:00:00Z'));
  assert.equal(feb, iso('2026-02-28T04:30:00Z'));
  const mar = nextOccurrence(anchor, 'monthly', 'Asia/Kolkata', Date.parse(feb));
  assert.equal(mar, iso('2026-03-31T04:30:00Z'));
});

await test('yearly on Feb 29 lands on Feb 28 in non-leap years, Feb 29 in leap years', () => {
  const anchor = iso('2028-02-29T06:00:00Z');
  const y1 = nextOccurrence(anchor, 'yearly', 'UTC', Date.parse('2028-03-01T00:00:00Z'));
  assert.equal(y1, iso('2029-02-28T06:00:00Z'));
  const y4 = nextOccurrence(anchor, 'yearly', 'UTC', Date.parse('2031-03-01T00:00:00Z'));
  assert.equal(y4, iso('2032-02-29T06:00:00Z'));
});

await test('weekly advances in 7-day steps and skips missed occurrences', () => {
  const anchor = iso('2026-11-22T04:00:00Z');
  const next = nextOccurrence(anchor, 'weekly', 'Asia/Kolkata', Date.parse('2026-12-15T00:00:00Z'));
  assert.equal(next, iso('2026-12-20T04:00:00Z'));
});

await test('result is always strictly after "after" and non-recurring returns null', () => {
  const anchor = iso('2026-11-22T04:00:00Z');
  const exact = Date.parse('2026-11-23T04:00:00Z');
  assert.equal(nextOccurrence(anchor, 'daily', 'UTC', exact), iso('2026-11-24T04:00:00Z'));
  assert.equal(nextOccurrence(anchor, 'none', 'UTC', exact), null);
});

await test('daily reminder stale for years catches up quickly and correctly', () => {
  const anchor = iso('2020-01-01T00:00:00Z');
  const after = Date.parse('2026-11-22T10:15:00Z');
  assert.equal(nextOccurrence(anchor, 'daily', 'UTC', after), iso('2026-11-23T00:00:00Z'));
});

console.log('Scheduler state machine');
const row = (over = {}) => ({
  id: 'r1',
  device_id: 'd',
  title: 't',
  notes: null,
  category: 'Work',
  remind_at_utc: iso('2026-11-22T10:00:00Z'),
  anchor_utc: iso('2026-11-22T10:00:00Z'),
  timezone: 'UTC',
  repeat_interval: 'none',
  status: 'pending',
  nag_mode: 0,
  badge_color: '#000000',
  snoozed_until: null,
  last_sent_at: null,
  attempts: 0,
  created_at: '',
  updated_at: null,
  ...over,
});
const now = Date.parse('2026-11-22T10:00:30Z');

await test('one-time reminder becomes "sent"', () => {
  assert.equal(transition(row(), 'due', now).status, 'sent');
});
await test('recurring (no nag) advances to next occurrence and stays pending', () => {
  const n = transition(row({ repeat_interval: 'daily' }), 'due', now);
  assert.equal(n.status, 'pending');
  assert.equal(n.remind_at_utc, iso('2026-11-23T10:00:00Z'));
});
await test('recurring + nag stays "sent" on the fired occurrence until Mark Done', () => {
  const n = transition(row({ repeat_interval: 'daily', nag_mode: 1 }), 'due', now);
  assert.equal(n.status, 'sent');
  assert.equal(n.remind_at_utc, iso('2026-11-22T10:00:00Z'));
});
await test('nag re-alert keeps status "sent"', () => {
  assert.equal(transition(row({ status: 'sent', nag_mode: 1 }), 'nag', now).status, 'sent');
});
await test('snooze firing on a one-time reminder -> "sent" (so nag can resume)', () => {
  const n = transition(row({ status: 'snoozed', snoozed_until: iso('2026-11-22T10:00:00Z') }), 'snooze', now);
  assert.equal(n.status, 'sent');
  assert.equal(n.snoozed_until, null);
});
await test('extra snooze ping on an already-advanced recurring reminder resumes pending, keeps next occurrence', () => {
  const n = transition(
    row({ repeat_interval: 'daily', status: 'snoozed', remind_at_utc: iso('2026-11-23T10:00:00Z') }),
    'snooze',
    now,
  );
  assert.equal(n.status, 'pending');
  assert.equal(n.remind_at_utc, iso('2026-11-23T10:00:00Z'));
});

console.log(`\n${passed} tests passed`);
