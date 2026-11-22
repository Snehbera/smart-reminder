// Generates a VAPID key pair (P-256) using only Node's built-in WebCrypto.
// Output format is identical to `npx web-push generate-vapid-keys`.
//   node scripts/generate-vapid.mjs
import { webcrypto } from 'node:crypto';

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const { privateKey, publicKey } = await webcrypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);

const jwk = await webcrypto.subtle.exportKey('jwk', privateKey);
const raw = new Uint8Array(await webcrypto.subtle.exportKey('raw', publicKey)); // 65 bytes: 0x04 || X || Y

console.log('\nVAPID keys generated.\n');
console.log('Public key  (VAPID_PUBLIC_KEY) :', b64url(raw));
console.log('Private key (VAPID_PRIVATE_KEY):', jwk.d);
console.log('\nLocal dev  -> put them in worker/.dev.vars');
console.log('Production -> npx wrangler secret put VAPID_PUBLIC_KEY');
console.log('              npx wrangler secret put VAPID_PRIVATE_KEY');
console.log('\nKeep the private key secret. Changing keys later invalidates existing push subscriptions');
console.log('(the app re-subscribes automatically the next time each user opens it).\n');
