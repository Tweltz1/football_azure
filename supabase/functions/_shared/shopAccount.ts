// Talk Shops account recovery: "Forgot password" sends a 6-digit code to the account's email (through
// Resend) or to a phone the shop verified in Settings (through Twilio), and the code sets a new password.
// Codes are stored only as hashes, expire after 15 minutes and allow 5 tries. Answers to "send a code"
// never say whether an account exists.

import type { Ctx, Res } from './handlers.ts';
import type { SmsResult } from './shop.ts';

export type CodePurpose = 'reset' | 'phone';
export type CodeChannel = 'email' | 'sms';

export interface AuthCode {
  id: string;
  userId: string;
  purpose: CodePurpose;
  channel: CodeChannel;
  /** Where the code went: the email address or the phone number. */
  target: string;
  codeHash: string;
  attempts: number;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface AccountStore {
  userByEmail(email: string): Promise<{ id: string; email: string } | null>;
  /** Sets the password; `confirmEmail` also marks the email verified (the code proved the person reads it). */
  setPassword(userId: string, password: string, confirmEmail: boolean): Promise<void>;
  recoveryPhone(userId: string): Promise<{ phone: string; verifiedAt: string | null } | null>;
  setRecoveryPhone(userId: string, phone: string | null, verifiedAt: string | null): Promise<void>;
  /** Saves a new code and retires the user's other open codes for the same purpose. */
  saveCode(code: AuthCode): Promise<void>;
  /** The newest unused, unexpired code. */
  openCode(userId: string, purpose: CodePurpose, now: string): Promise<AuthCode | null>;
  /** Codes created for the user since `since` (for the send limit). */
  countCodes(userId: string, since: string): Promise<number>;
  updateCode(id: string, patch: { attempts?: number; usedAt?: string }): Promise<void>;
}

export interface AccountDeps {
  account?: AccountStore | null;
  sms: { send(to: string, text: string): Promise<SmsResult> };
  email?: { send(to: string, subject: string, text: string, opts?: { fromName?: string; replyTo?: string }): Promise<SmsResult> };
  /** Test hook: makes codes predictable. */
  newCode?: () => string;
}

type Body = Record<string, unknown>;
const CODE_MINUTES = 15;
const MAX_TRIES = 5;
const MAX_SENDS_PER_HOUR = 5;
const ok = (body?: unknown): Res => ({ status: 200, body });
const bad = (message: string): Res => ({ status: 400, body: message });
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const validEmail = (e: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);

export const maskPhone = (p: string) => (p.length >= 4 ? `(•••) •••-${p.slice(-4)}` : p);

function randomCode(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0] % 1_000_000).padStart(6, '0');
}

export async function hashCode(userId: string, code: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`talkshops:${userId}:${code}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function issueCode(ctx: Ctx, deps: AccountDeps, store: AccountStore, userId: string, purpose: CodePurpose, channel: CodeChannel, target: string): Promise<SmsResult | 'limited'> {
  const now = ctx.now();
  if (await store.countCodes(userId, new Date(now.getTime() - 3_600_000).toISOString()) >= MAX_SENDS_PER_HOUR) return 'limited';
  const code = (deps.newCode ?? randomCode)();
  await store.saveCode({
    id: ctx.newId(), userId, purpose, channel, target, codeHash: await hashCode(userId, code), attempts: 0,
    expiresAt: new Date(now.getTime() + CODE_MINUTES * 60_000).toISOString(), usedAt: null, createdAt: now.toISOString(),
  });
  if (channel === 'email') {
    if (!deps.email) return { delivery: 'not_sent', note: 'Email is not set up.' };
    return deps.email.send(target, `Your Talk Shops code: ${code}`,
      `Your Talk Shops password reset code is ${code}\n\nEnter it on the sign-in page to choose a new password. It expires in ${CODE_MINUTES} minutes.\n\nIf you didn't ask to reset your password, you can ignore this email. Your password stays the same.`);
  }
  const text = purpose === 'phone'
    ? `Talk Shops: your code is ${code}. Enter it in Shop settings to use this phone for password resets.`
    : `Talk Shops: your password reset code is ${code}. It expires in ${CODE_MINUTES} minutes. If you didn't ask for it, ignore this text.`;
  return deps.sms.send(target, text);
}

/** Checks a code. Wrong answers count toward the limit; the right one is used up. */
async function useCode(ctx: Ctx, store: AccountStore, userId: string, purpose: CodePurpose, code: string): Promise<AuthCode | null> {
  const now = ctx.now().toISOString();
  const open = await store.openCode(userId, purpose, now);
  if (!open || open.attempts >= MAX_TRIES) return null;
  if (!/^\d{6}$/.test(code) || (await hashCode(userId, code)) !== open.codeHash) {
    const attempts = open.attempts + 1;
    await store.updateCode(open.id, attempts >= MAX_TRIES ? { attempts, usedAt: now } : { attempts });
    return null;
  }
  await store.updateCode(open.id, { usedAt: now });
  return open;
}

const WRONG_CODE = "That code isn't right or has expired. Check it, or send a new one.";

/** Routes under shop/auth (no sign-in) and shop/recovery (signed in). Null when the path is neither. */
export async function accountRoute(ctx: Ctx, deps: AccountDeps, method: string, parts: string[], body: Body, normalizePhone: (raw: string) => string | null): Promise<Res | null> {
  if (parts[1] !== 'auth' && parts[1] !== 'recovery') return null;
  const store = deps.account;
  if (!store) return { status: 503, body: 'Password reset is not available right now.' };

  // ---- Forgot password (signed out) ----
  if (parts[1] === 'auth') {
    if (method !== 'POST') return { status: 405 };
    const email = str(body.email, 254).toLowerCase();
    if (!validEmail(email)) return bad('Enter the email you sign in with.');

    if (parts[2] === 'forgot' && parts.length === 3) {
      const channel: CodeChannel = body.channel === 'sms' ? 'sms' : 'email';
      const generic = channel === 'sms'
        ? { sent: true, message: `If ${email} has a Talk Shops account with a verified phone, we texted a 6-digit code to it.` }
        : { sent: true, message: `If ${email} has a Talk Shops account, we emailed a 6-digit code to it. Check your spam folder too.` };
      const user = await store.userByEmail(email);
      if (!user) return ok(generic);
      let target = user.email;
      if (channel === 'sms') {
        const phone = await store.recoveryPhone(user.id);
        if (!phone?.verifiedAt) return ok(generic);
        target = phone.phone;
      }
      const sent = await issueCode(ctx, deps, store, user.id, 'reset', channel, target);
      if (sent === 'limited') return { status: 429, body: 'Too many codes were sent. Wait an hour, then try again.' };
      if (sent.delivery !== 'sent') ctx.log.warn('reset code not sent', { channel, delivery: sent.delivery, note: sent.note });
      return ok(generic);
    }

    if (parts[2] === 'reset' && parts.length === 3) {
      const code = str(body.code, 12).replace(/\s/g, '');
      const password = typeof body.password === 'string' ? body.password : '';
      if (password.length < 8 || password.length > 72) return bad('Choose a password with at least 8 characters.');
      const user = await store.userByEmail(email);
      const used = user ? await useCode(ctx, store, user.id, 'reset', code) : null;
      if (!user || !used) return bad(WRONG_CODE);
      await store.setPassword(user.id, password, used.channel === 'email');
      return ok({ reset: true });
    }
    return { status: 404 };
  }

  // ---- Phone for password resets (Shop settings, signed in) ----
  if (!ctx.userId) return { status: 401, body: 'Sign in first.' };
  const out = async () => {
    const p = await store.recoveryPhone(ctx.userId!);
    return ok({ phone: p ? maskPhone(p.phone) : null, verified: !!p?.verifiedAt });
  };
  if (parts.length === 2 && method === 'GET') return out();
  if (parts.length === 2 && method === 'DELETE') { await store.setRecoveryPhone(ctx.userId, null, null); return out(); }
  if (parts[2] === 'phone' && parts.length === 3 && method === 'POST') {
    const phone = normalizePhone(str(body.phone, 30));
    if (!phone) return bad('Enter a valid mobile number.');
    const sent = await issueCode(ctx, deps, store, ctx.userId, 'phone', 'sms', phone);
    if (sent === 'limited') return { status: 429, body: 'Too many codes were sent. Wait an hour, then try again.' };
    if (sent.delivery !== 'sent') {
      const why = sent.delivery === 'not_sent' ? 'Texting is not set up on the server yet.' : (sent.note || 'The texting service turned it down.');
      return { status: 502, body: `We couldn't text that number. ${why}` };
    }
    return ok({ sent: true, phone: maskPhone(phone) });
  }
  if (parts[2] === 'verify' && parts.length === 3 && method === 'POST') {
    const used = await useCode(ctx, store, ctx.userId, 'phone', str(body.code, 12).replace(/\s/g, ''));
    if (!used) return bad(WRONG_CODE);
    await store.setRecoveryPhone(ctx.userId, used.target, ctx.now().toISOString());
    return out();
  }
  return { status: 404 };
}
