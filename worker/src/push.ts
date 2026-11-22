/**
 * Web Push for Cloudflare Workers — Web Crypto only (no Node APIs, no `web-push` package).
 *
 *  - VAPID (RFC 8292): ES256 JWT signed with the application server key
 *  - Payload encryption (RFC 8291 / RFC 8188): ECDH P-256 + HKDF-SHA256 + AES-128-GCM ("aes128gcm")
 */

const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// base64url helpers
// ---------------------------------------------------------------------------

export function b64urlEncode(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(input: string): Uint8Array {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  const bin = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// VAPID
// ---------------------------------------------------------------------------

export interface VapidKeys {
  publicKey: string; // base64url, 65-byte uncompressed P-256 point
  privateKey: string; // base64url, 32-byte scalar "d"
  subject: string; // mailto: or https: URL
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function importVapidSigningKey(keys: VapidKeys): Promise<CryptoKey> {
  const cacheKey = keys.publicKey + ':' + keys.privateKey.slice(0, 8);
  let cached = keyCache.get(cacheKey);
  if (!cached) {
    const pub = b64urlDecode(keys.publicKey);
    if (pub.length !== 65 || pub[0] !== 4) {
      throw new Error('VAPID_PUBLIC_KEY must be a 65-byte uncompressed P-256 key (base64url)');
    }
    const jwk: JsonWebKey = {
      kty: 'EC',
      crv: 'P-256',
      x: b64urlEncode(pub.slice(1, 33)),
      y: b64urlEncode(pub.slice(33, 65)),
      d: keys.privateKey,
      ext: true,
    };
    cached = crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    keyCache.set(cacheKey, cached);
  }
  return cached;
}

const jwtCache = new Map<string, { token: string; expiresAtMs: number }>();

/** Returns a (cached) VAPID JWT for the push service origin. Valid 12h, refreshed when < 1h is left. */
export async function getVapidJwt(keys: VapidKeys, audience: string): Promise<string> {
  const now = Date.now();
  const hit = jwtCache.get(audience);
  if (hit && hit.expiresAtMs - now > 60 * 60 * 1000) return hit.token;

  const expSeconds = Math.floor(now / 1000) + 12 * 60 * 60;
  const header = b64urlEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64urlEncode(encoder.encode(JSON.stringify({ aud: audience, exp: expSeconds, sub: keys.subject })));
  const signingInput = `${header}.${payload}`;

  const key = await importVapidSigningKey(keys);
  // WebCrypto returns the raw r||s (IEEE P1363) signature, which is exactly the JWS ES256 format.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(signingInput));
  const token = `${signingInput}.${b64urlEncode(sig)}`;
  jwtCache.set(audience, { token, expiresAtMs: expSeconds * 1000 });
  return token;
}

// ---------------------------------------------------------------------------
// Payload encryption (aes128gcm)
// ---------------------------------------------------------------------------

export interface PushKeys {
  p256dh: string;
  auth: string;
}

const RECORD_SIZE = 4096;

export async function encryptPayload(keys: PushKeys, plaintext: Uint8Array): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(keys.p256dh); // 65 bytes
  const authSecret = b64urlDecode(keys.auth); // 16 bytes
  if (uaPublic.length !== 65) throw new Error('Invalid p256dh key');

  // 1. Ephemeral server key pair + ECDH shared secret
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const asKeyPair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', asKeyPair.publicKey)) as ArrayBuffer);
  // The runtime parameter is `public`; workers-types names it `$public`, hence the cast.
  const ecdhParams = { name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const sharedSecret = await crypto.subtle.deriveBits(ecdhParams, asKeyPair.privateKey, 256);

  // 2. IKM = HKDF(salt=auth_secret, ikm=ecdh, info="WebPush: info\0" || ua_public || as_public, L=32)
  const sharedKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveBits']);
  const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: keyInfo },
    sharedKey,
    256,
  );

  // 3. CEK + nonce from a fresh random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const ikmKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const cekBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode('Content-Encoding: aes128gcm\0') },
    ikmKey,
    128,
  );
  const nonceBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode('Content-Encoding: nonce\0') },
    ikmKey,
    96,
  );
  const cek = await crypto.subtle.importKey('raw', cekBits, 'AES-GCM', false, ['encrypt']);

  // 4. Single record: plaintext || 0x02 (last-record delimiter), AES-128-GCM
  if (plaintext.length > RECORD_SIZE - 17) throw new Error('Push payload too large');
  const record = concat(plaintext, new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(nonceBits) }, cek, record),
  );

  // 5. RFC 8188 header: salt(16) || rs(4, BE) || idlen(1) || keyid(as_public, 65)
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE, false);
  header[20] = asPublic.length;
  header.set(asPublic, 21);

  return concat(header, ciphertext);
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export interface PushTarget extends PushKeys {
  endpoint: string;
}

export type PushOutcome = 'ok' | 'gone' | 'retry' | 'fail';

export interface PushResult {
  outcome: PushOutcome;
  status: number;
  endpoint: string;
}

export interface SendOptions {
  /** Seconds the push service should hold the message if the device is offline. */
  ttl?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
}

/**
 * Encrypts `payload` for the subscription and POSTs it to the push service.
 *  - 201/200/202           -> ok
 *  - 404 / 410             -> gone  (subscription expired: caller deletes it)
 *  - 429 / 5xx / network   -> retry (transient)
 *  - anything else         -> fail
 */
export async function sendWebPush(
  vapid: VapidKeys,
  target: PushTarget,
  payload: string,
  options: SendOptions = {},
): Promise<PushResult> {
  const { endpoint } = target;
  try {
    const audience = new URL(endpoint).origin;
    const [jwt, body] = await Promise.all([
      getVapidJwt(vapid, audience),
      encryptPayload(target, encoder.encode(payload)),
    ]);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(options.ttl ?? 24 * 60 * 60),
        Urgency: options.urgency ?? 'high',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    // Drain the body so the connection can be reused.
    await res.arrayBuffer().catch(() => undefined);

    const status = res.status;
    if (status >= 200 && status < 300) return { outcome: 'ok', status, endpoint };
    if (status === 404 || status === 410) return { outcome: 'gone', status, endpoint };
    if (status === 429 || status >= 500) return { outcome: 'retry', status, endpoint };
    return { outcome: 'fail', status, endpoint };
  } catch (err) {
    console.warn('push send error', endpoint.slice(0, 60), String(err));
    return { outcome: 'retry', status: 0, endpoint };
  }
}
