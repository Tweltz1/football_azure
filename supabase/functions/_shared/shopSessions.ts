// Talk Shops device limit (Tyler, 2026-11-10). One login can be signed in on 2 devices at a time, so a shop
// can't share one technician login across the whole crew instead of buying staff seats. The newest sign-in
// always wins: signing in on a third device signs out the oldest, so a browser left signed in somewhere never
// locks anyone out. A device unused for 14 days is signed out. The database side is talkshops_claim_session.

import type { Ctx, Res } from './handlers.ts';

export const MAX_DEVICES = 2;
export const IDLE_DAYS = 14;

export type Claim = 'ok' | 'ended' | 'idle';
export interface SessionStore {
  /** Records this device's use and enforces the limit. 'ended'/'idle' means this device is signed out. */
  claim(userId: string, sessionId: string, userAgent: string): Promise<Claim>;
  /** Signs out one device (sessionId), all but one (keep), or every device of the login. Returns how many. */
  end(userId: string, sessionId: string | null, keep: string | null): Promise<number>;
  /** Devices signed in per login, for the owner's Team list. */
  counts(userIds: string[]): Promise<Record<string, number>>;
  /** Why a device was signed out (kept 30 days), looked up when Supabase turns its token down. */
  endedReason?(sessionId: string): Promise<EndReason | null>;
}
export type EndReason = 'limit' | 'idle' | 'owner' | 'others';

export const SESSION_ENDED = 'session_ended';
const LIMIT = `You were signed out here because this login was signed in on another device. Each login works on ${MAX_DEVICES} devices at a time, so everyone on the team needs their own login.`;
const MESSAGES: Record<string, string> = {
  ended: LIMIT,
  limit: LIMIT,
  idle: `You were signed out because this device wasn't used for ${IDLE_DAYS} days.`,
  owner: 'A shop owner signed this login out on all devices. Sign in again to keep working.',
  others: 'This login was signed out here from another device (Sign Out My Other Devices).',
  rejected: 'Your sign-in ended. Please sign in again.',
};
export const sessionEnded = (why: Claim | EndReason | 'rejected'): Res => ({ status: 401, body: { code: SESSION_ENDED, reason: why, message: MESSAGES[why] } });

/** Checks this request's device. A response means stop: the device was signed out. Fails open if the check breaks. */
export async function checkDevice(ctx: Ctx, sessions: SessionStore | null | undefined): Promise<Res | null> {
  if (!ctx.userId) {
    if (!ctx.signInRejected) return null;
    // The token's session id is unverified here; it only picks which message to show.
    const why = ctx.sessionId && sessions?.endedReason ? await sessions.endedReason(ctx.sessionId).catch(() => null) : null;
    return sessionEnded(why ?? 'rejected');
  }
  if (!sessions || !ctx.sessionId) return null;
  try {
    const r = await sessions.claim(ctx.userId, ctx.sessionId, ctx.userAgent ?? '');
    return r === 'ok' ? null : sessionEnded(r);
  } catch (e) {
    ctx.log.warn('device check failed', { error: String(e) });
    return null;
  }
}

/** shop/session/end (Sign Out on this device) and shop/session/others (sign out my other devices). */
export async function sessionRoute(ctx: Ctx, sessions: SessionStore | null | undefined, method: string, parts: string[]): Promise<Res | null> {
  if (parts[1] !== 'session') return null;
  if (method !== 'POST' || parts.length !== 3) return { status: 405 };
  if (!ctx.userId) return { status: 401, body: 'Sign in first.' };
  if (!sessions) return { status: 200, body: { ended: 0 } };
  if (parts[2] === 'end') return { status: 200, body: { ended: ctx.sessionId ? await sessions.end(ctx.userId, ctx.sessionId, null) : 0 } };
  if (parts[2] === 'others') return { status: 200, body: { ended: await sessions.end(ctx.userId, null, ctx.sessionId ?? null) } };
  return { status: 404 };
}
