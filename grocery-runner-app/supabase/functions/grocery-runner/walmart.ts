// Walmart Affiliate API (https://walmart.io), Store Locator only. It returns real Walmart store
// numbers near a ZIP, so shopper aisle votes are shared per actual store. No affiliate API returns
// aisle numbers, so product data is not used.
//
// Secrets: WALMART_CONSUMER_ID, WALMART_KEY_VERSION (usually "1"), WALMART_PRIVATE_KEY (PKCS#8 PEM,
// "-----BEGIN PRIVATE KEY-----"; convert an "RSA PRIVATE KEY" with: openssl pkcs8 -topk8 -nocrypt -in key.pem).

const STORES = 'https://developer.api.walmart.com/api-proxy/service/affil/product/v2/stores';

export const walmartReady = () =>
  Boolean(Deno.env.get('WALMART_CONSUMER_ID') && Deno.env.get('WALMART_PRIVATE_KEY'));

let key: CryptoKey | null = null;

async function signingKey(): Promise<CryptoKey> {
  if (key) return key;
  const pem = Deno.env.get('WALMART_PRIVATE_KEY') ?? '';
  if (pem.includes('BEGIN RSA PRIVATE KEY')) {
    throw new Error('Walmart key is in PKCS#1 format; convert it to PKCS#8 (see walmart.ts).');
  }
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  return key;
}

async function headers(): Promise<Record<string, string>> {
  const consumerId = Deno.env.get('WALMART_CONSUMER_ID')!;
  const keyVersion = Deno.env.get('WALMART_KEY_VERSION') ?? '1';
  const timestamp = String(Date.now());
  // Walmart signs the header values in header-name order, each followed by a newline.
  const message = `${consumerId}\n${timestamp}\n${keyVersion}\n`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await signingKey(), new TextEncoder().encode(message));
  return {
    'WM_CONSUMER.ID': consumerId,
    'WM_CONSUMER.INTIMESTAMP': timestamp,
    'WM_SEC.KEY_VERSION': keyVersion,
    'WM_SEC.AUTH_SIGNATURE': btoa(String.fromCharCode(...new Uint8Array(sig))),
    Accept: 'application/json',
  };
}

export async function walmartStores(zip: string) {
  const res = await fetch(`${STORES}?zip=${encodeURIComponent(zip)}`, { headers: await headers() });
  if (!res.ok) throw new Error(`Walmart store search failed (${res.status}).`);
  const body = await res.json();
  // deno-lint-ignore no-explicit-any
  return (Array.isArray(body) ? body : []).slice(0, 10).map((s: any) => ({
    id: String(s.no),
    name: s.name ?? `Walmart #${s.no}`,
    address: [s.streetAddress, s.city, s.stateProvCode].filter(Boolean).join(', '),
  }));
}

export async function walmartStoresNear(
  lat: number,
  lon: number,
): Promise<{ id: string; name: string; address: string; lat: number; lon: number }[]> {
  const res = await fetch(`${STORES}?lat=${lat}&lon=${lon}`, { headers: await headers() });
  if (!res.ok) throw new Error(`Walmart store search failed (${res.status}).`);
  const body = await res.json();
  // deno-lint-ignore no-explicit-any
  return (Array.isArray(body) ? body : []).filter((s: any) => Array.isArray(s.coordinates)).map((s: any) => ({
    id: String(s.no),
    name: s.name ?? `Walmart #${s.no}`,
    address: [s.streetAddress, s.city].filter(Boolean).join(', '),
    lon: Number(s.coordinates[0]),
    lat: Number(s.coordinates[1]),
  }));
}
