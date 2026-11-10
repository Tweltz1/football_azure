// Sends iPhone notifications straight to Apple (APNs) with a token key from developer.apple.com.
// Needs three Supabase secrets: APNS_KEY_ID, APNS_TEAM_ID and APNS_PRIVATE_KEY (the .p8 file's text).
// Without them nothing is sent and the rest of the app works as before.

export interface PushNote { title: string; body: string; path?: string }
export interface PushTarget { token: string; sandbox: boolean }
export interface PushSender {
  /** Sends the note to each phone; returns the tokens Apple says are no longer valid. */
  send(targets: PushTarget[], note: PushNote): Promise<string[]>;
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const text64 = (s: string) => b64url(new TextEncoder().encode(s));

/** The provider token APNs wants: an ES256 JWT, reused for up to 50 minutes. */
export async function apnsJwt(keyId: string, teamId: string, p8: string, now: Date): Promise<string> {
  const pem = p8.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = text64(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = text64(JSON.stringify({ iss: teamId, iat: Math.floor(now.getTime() / 1000) }));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${claims}`)));
  return `${head}.${claims}.${b64url(sig)}`;
}

export function applePushSender(
  cfg: { keyId?: string; teamId?: string; privateKey?: string; topic: string },
  fetchFn: typeof fetch = fetch,
  log: { warn: (...a: unknown[]) => void } = console,
): PushSender | null {
  if (!cfg.keyId || !cfg.teamId || !cfg.privateKey) return null;
  let jwt: { value: string; at: number } | null = null;
  const token = async () => {
    const now = new Date();
    if (!jwt || now.getTime() - jwt.at > 50 * 60_000) jwt = { value: await apnsJwt(cfg.keyId!, cfg.teamId!, cfg.privateKey!, now), at: now.getTime() };
    return jwt.value;
  };
  return {
    async send(targets, note) {
      const dead: string[] = [];
      const auth = await token();
      const payload = JSON.stringify({ aps: { alert: { title: note.title, body: note.body }, sound: 'default' }, ...(note.path ? { path: note.path } : {}) });
      await Promise.all(targets.map(async (t) => {
        if (!/^[0-9a-f]{32,200}$/i.test(t.token)) { dead.push(t.token); return; }
        const host = t.sandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
        try {
          const res = await fetchFn(`https://${host}/3/device/${t.token}`, {
            method: 'POST',
            headers: { authorization: `bearer ${auth}`, 'apns-topic': cfg.topic, 'apns-push-type': 'alert', 'apns-priority': '10', 'content-type': 'application/json' },
            body: payload,
          });
          if (res.status === 410) dead.push(t.token);
          else if (res.status === 400) {
            const why = await res.text().catch(() => '');
            if (/BadDeviceToken|DeviceTokenNotForTopic/.test(why)) dead.push(t.token);
            else log.warn('apns: refused', why);
          } else if (!res.ok) log.warn('apns: failed', res.status, await res.text().catch(() => ''));
        } catch (error) {
          log.warn('apns: send failed', error);
        }
      }));
      return dead;
    },
  };
}
