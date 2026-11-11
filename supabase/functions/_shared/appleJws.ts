// Checks App Store purchase records (StoreKit 2 "signed transactions") without any Apple API key.
//
// Every transaction the phone sends is a JWS signed by Apple: its header carries three certificates
// (Apple's signing certificate, Apple's intermediate, and Apple Root CA - G3). We check that the root is
// Apple's (by its SHA-256 fingerprint), that each certificate was signed by the next, that the two Apple
// certificates carry Apple's marker extensions, and that the JWS itself was signed by the first one.
// Plain Web Crypto, so it runs in the Edge Function and in the Node tests.

/** SHA-256 of Apple Root CA - G3 (https://www.apple.com/certificateauthority/). */
export const APPLE_ROOT_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

// Object ids, as their DER bytes.
const OID = {
  ecdsaSha256: [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02],
  ecdsaSha384: [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x03],
  p256: [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07],
  p384: [0x2b, 0x81, 0x04, 0x00, 0x22],
  // 1.2.840.113635.100.6.11.1: Apple's App Store receipt signing certificate.
  appleLeaf: [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x0b, 0x01],
  // 1.2.840.113635.100.6.2.1: Apple Worldwide Developer Relations intermediate.
  appleIntermediate: [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x02, 0x01],
};

interface Der { tag: number; start: number; hdr: number; end: number }

function readDer(buf: Uint8Array, pos: number): Der {
  if (pos + 2 > buf.length) throw new Error('bad certificate');
  const tag = buf[pos];
  let len = buf[pos + 1];
  let hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4) throw new Error('bad certificate');
    len = 0;
    for (let i = 0; i < n; i += 1) len = len * 256 + buf[pos + 2 + i];
    hdr = 2 + n;
  }
  const end = pos + hdr + len;
  if (end > buf.length) throw new Error('bad certificate');
  return { tag, start: pos, hdr, end };
}

function kids(buf: Uint8Array, node: Der): Der[] {
  const out: Der[] = [];
  let p = node.start + node.hdr;
  while (p < node.end) {
    const c = readDer(buf, p);
    out.push(c);
    p = c.end;
  }
  return out;
}

const body = (buf: Uint8Array, n: Der) => buf.subarray(n.start + n.hdr, n.end);
const whole = (buf: Uint8Array, n: Der) => buf.subarray(n.start, n.end);
const same = (a: Uint8Array, b: number[]) => a.length === b.length && b.every((x, i) => a[i] === x);
const contains = (hay: Uint8Array, needle: number[]) => {
  const full = [0x06, needle.length, ...needle];
  outer: for (let i = 0; i + full.length <= hay.length; i += 1) {
    for (let j = 0; j < full.length; j += 1) if (hay[i + j] !== full[j]) continue outer;
    return true;
  }
  return false;
};

function derTime(buf: Uint8Array, n: Der): number {
  const s = new TextDecoder().decode(body(buf, n));
  const m = n.tag === 0x17 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s) : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) throw new Error('bad certificate date');
  let year = Number(m[1]);
  if (n.tag === 0x17) year += year < 50 ? 2000 : 1900;
  return Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}

interface Cert {
  der: Uint8Array;
  tbs: Uint8Array;
  sigHash: 'SHA-256' | 'SHA-384';
  sig: Uint8Array;
  spki: Uint8Array;
  curve: 'P-256' | 'P-384';
  notBefore: number;
  notAfter: number;
}

function parseCert(der: Uint8Array): Cert {
  const top = readDer(der, 0);
  const [tbsNode, algNode, sigNode] = kids(der, top);
  if (!tbsNode || !algNode || !sigNode) throw new Error('bad certificate');
  const alg = body(der, kids(der, algNode)[0]);
  const sigHash = same(alg, OID.ecdsaSha256) ? 'SHA-256' : same(alg, OID.ecdsaSha384) ? 'SHA-384' : null;
  if (!sigHash) throw new Error('unexpected certificate signature');
  const t = kids(der, tbsNode);
  const o = t[0].tag === 0xa0 ? 1 : 0; // [0] version
  const validity = kids(der, t[o + 3]);
  const spkiNode = t[o + 5];
  const curveOid = body(der, kids(der, kids(der, spkiNode)[0])[1]);
  const curve = same(curveOid, OID.p256) ? 'P-256' : same(curveOid, OID.p384) ? 'P-384' : null;
  if (!curve) throw new Error('unexpected certificate key');
  return {
    der, tbs: whole(der, tbsNode), sigHash, sig: body(der, sigNode).subarray(1), spki: whole(der, spkiNode), curve,
    notBefore: derTime(der, validity[0]), notAfter: derTime(der, validity[1]),
  };
}

/** DER ECDSA signature (SEQUENCE of two INTEGERs) to the raw r|s form Web Crypto wants. */
function rawSig(der: Uint8Array, size: number): Uint8Array {
  const seq = readDer(der, 0);
  const [r, s] = kids(der, seq).map((n) => {
    let v = body(der, n);
    while (v.length > size && v[0] === 0) v = v.subarray(1);
    if (v.length > size) throw new Error('bad signature');
    const out = new Uint8Array(size);
    out.set(v, size - v.length);
    return out;
  });
  const out = new Uint8Array(size * 2);
  out.set(r, 0);
  out.set(s, size);
  return out;
}

const keyOf = (c: Cert) => crypto.subtle.importKey('spki', c.spki as BufferSource, { name: 'ECDSA', namedCurve: c.curve }, false, ['verify']);

async function signedBy(child: Cert, parent: Cert): Promise<boolean> {
  const size = parent.curve === 'P-256' ? 32 : 48;
  return crypto.subtle.verify({ name: 'ECDSA', hash: child.sigHash }, await keyOf(parent), rawSig(child.sig, size) as BufferSource, child.tbs as BufferSource);
}

const b64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
const b64url = (s: string) => b64(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');

/**
 * The payload of an App Store signed transaction, once its signature checks out; throws otherwise.
 * `rootSha256` is only changed by tests.
 */
export async function verifyAppleJws(jws: string, opts: { rootSha256?: string; now?: Date } = {}): Promise<Record<string, unknown>> {
  const parts = typeof jws === 'string' ? jws.split('.') : [];
  if (parts.length !== 3) throw new Error('not a signed transaction');
  const header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length !== 3) throw new Error('unexpected signature');
  const [leaf, mid, root] = (header.x5c as string[]).map((c) => parseCert(b64(c)));
  if (hex(await crypto.subtle.digest('SHA-256', root.der as BufferSource)) !== (opts.rootSha256 ?? APPLE_ROOT_G3_SHA256)) throw new Error('not signed by Apple');
  if (!contains(leaf.tbs, OID.appleLeaf) || !contains(mid.tbs, OID.appleIntermediate)) throw new Error('not signed by Apple');
  if (!(await signedBy(mid, root)) || !(await signedBy(leaf, mid))) throw new Error('broken certificate chain');
  // Checked at the time Apple signed it (old purchases sent again on "Restore" were signed long ago).
  const at = typeof payload.signedDate === 'number' ? payload.signedDate : (opts.now ?? new Date()).getTime();
  for (const c of [leaf, mid, root]) if (at < c.notBefore || at > c.notAfter) throw new Error('certificate out of date');
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, await keyOf(leaf), b64url(parts[2]) as BufferSource,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`) as BufferSource,
  );
  if (!ok) throw new Error('bad signature');
  return payload;
}
