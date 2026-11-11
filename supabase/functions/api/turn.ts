// TURN relays for Hood Quest voice chat, from Cloudflare Realtime TURN (free up to 1,000 GB a month).
// Phones on strict networks (some cellular carriers, work Wi-Fi) can't reach each other directly, so their
// audio goes through a relay. Set the CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_KEY_API_TOKEN secrets to turn it
// on; without them voice chat uses public STUN only, which works on most home networks.

const TTL_SECONDS = 4 * 60 * 60;

export function createTurn(keyId: string | undefined, apiToken: string | undefined, fetchFn: typeof fetch = fetch) {
  if (!keyId || !apiToken) return null;
  let cached: { at: number; servers: unknown[] } | null = null;
  return async (): Promise<unknown[]> => {
    // One set of short-lived credentials is shared for an hour, so a busy night makes few calls.
    if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.servers;
    const res = await fetchFn(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TTL_SECONDS }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Cloudflare TURN ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const list = Array.isArray(data?.iceServers) ? data.iceServers : data?.iceServers ? [data.iceServers] : [];
    // Keep only TURN entries; the STUN ones are already in the default list.
    const servers = list
      .map((s: { urls?: string | string[]; username?: string; credential?: string }) => ({
        ...s,
        urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => typeof u === 'string' && u.startsWith('turn')),
      }))
      .filter((s: { urls: string[] }) => s.urls.length);
    cached = { at: Date.now(), servers };
    return servers;
  };
}
