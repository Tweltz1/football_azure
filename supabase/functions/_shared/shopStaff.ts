// Talk Shops staff roles. Every signed-in account belongs to at most one shop, as an Owner or a Technician.
// Owners run the business side: shop settings, saved prices, the plan and billing, final bills, closing or
// deleting repairs, and the team. Technicians work the cars: the Bay, check-ins, stages, notes, photos,
// draft estimate lines and How-to, but they can't send an estimate for approval or touch billing or settings.
// The account that created the shop is its main owner (repair_shops.owner_id) and can't be removed.
// Owners invite staff by email; the link carries a random token that is stored only as a hash.

import type { Ctx, Res } from './handlers.ts';
import type { SmsResult } from './shop.ts';

export type Role = 'owner' | 'tech';
export const ROLES: readonly Role[] = ['owner', 'tech'];
export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', tech: 'Technician' };

export interface Member { userId: string; shopId: string; role: Role; email: string; name: string; addedAt: string }
export interface Invite {
  id: string; shopId: string; email: string; name: string; role: Role; tokenHash: string;
  invitedBy: string | null; createdAt: string; expiresAt: string; acceptedAt: string | null;
}

export interface StaffStore {
  memberOf(userId: string): Promise<Member | null>;
  listMembers(shopId: string): Promise<Member[]>;
  /** Adds the account to a shop. False when the account already belongs to one. */
  addMember(m: Member): Promise<boolean>;
  setRole(shopId: string, userId: string, role: Role): Promise<void>;
  removeMember(shopId: string, userId: string): Promise<void>;
  saveInvite(inv: Invite): Promise<void>;
  /** Invites not yet accepted, newest first (expired ones included, so owners can see and resend them). */
  listInvites(shopId: string): Promise<Invite[]>;
  inviteByHash(hash: string): Promise<Invite | null>;
  /** Marks the invite used. False when someone already used it. */
  claimInvite(id: string, at: string): Promise<boolean>;
  deleteInvite(shopId: string, id: string): Promise<void>;
}

export interface StaffDeps {
  staff?: StaffStore | null;
  email?: { send(to: string, subject: string, text: string, opts?: { fromName?: string; replyTo?: string }): Promise<SmsResult> };
  newToken: () => string;
  siteUrl?: string;
}

/** What the signed-in account is in its shop. */
export interface Seat { role: Role; primary: boolean }

const INVITE_DAYS = 7;
export const MAX_STAFF = 30;
const ok = (body?: unknown): Res => ({ status: 200, body });
const bad = (message: string): Res => ({ status: 400, body: message });
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const validEmail = (e: string) => e.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e);
export const OWNER_ONLY = 'Only a shop owner can do that.';
export const ownerOnly = (): Res => ({ status: 403, body: OWNER_ONLY });

export async function hashToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`talkshops-invite:${token}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const joinLink = (deps: StaffDeps, token: string) => (deps.siteUrl || 'https://talkshops.app').replace(/\/$/, '') + '/?join=' + token;

const memberOut = (m: Member, primaryId: string, me: string) => ({
  userId: m.userId, email: m.email, name: m.name, role: m.role, addedAt: m.addedAt, primary: m.userId === primaryId, you: m.userId === me,
});
const inviteOut = (i: Invite, now: string) => ({ id: i.id, email: i.email, name: i.name, role: i.role, createdAt: i.createdAt, expiresAt: i.expiresAt, expired: i.expiresAt <= now });

interface ShopLite { id: string; ownerId: string; name: string; email?: string }

async function team(store: StaffStore, shop: ShopLite, me: string, now: string) {
  const members = await store.listMembers(shop.id);
  if (!members.some((m) => m.userId === shop.ownerId))
    members.unshift({ userId: shop.ownerId, shopId: shop.id, role: 'owner', email: '', name: '', addedAt: '' });
  members.sort((a, b) => (a.userId === shop.ownerId ? -1 : b.userId === shop.ownerId ? 1 : a.role === b.role ? a.addedAt.localeCompare(b.addedAt) : a.role === 'owner' ? -1 : 1));
  return { members: members.map((m) => memberOut(m, shop.ownerId, me)), invites: (await store.listInvites(shop.id)).map((i) => inviteOut(i, now)), roles: ROLE_LABEL };
}

async function sendInvite(deps: StaffDeps, shop: ShopLite, inv: Invite, token: string): Promise<SmsResult> {
  const link = joinLink(deps, token);
  if (!deps.email) return { delivery: 'not_sent', note: 'Automatic email is not set up. Copy the link and send it yourself.' };
  const hi = inv.name ? `Hi ${inv.name.split(/\s+/)[0]},\n\n` : '';
  const text = `${hi}${shop.name} invited you to join their shop on Talk Shops as ${inv.role === 'owner' ? 'an Owner' : 'a Technician'}.\n\n`
    + `Open this link to accept: ${link}\n\nSign in or create a free account with this email address (${inv.email}). The link expires in ${INVITE_DAYS} days.\n\n`
    + `If you weren't expecting this, you can ignore this email.`;
  return deps.email.send(inv.email, `Join ${shop.name} on Talk Shops`, text, { fromName: shop.name, replyTo: shop.email || undefined });
}

/** Routes under shop/join (accepting an invite) and shop/staff (the owner's Team panel). Null for other paths. */
export async function staffRoute(
  ctx: Ctx & { userEmail?: string | null }, deps: StaffDeps, method: string, parts: string[], body: Record<string, unknown>,
  whoAmI: () => Promise<{ shop: ShopLite; seat: Seat } | null>, shopById: (id: string) => Promise<ShopLite | null>,
): Promise<Res | null> {
  if (parts[1] !== 'join' && parts[1] !== 'staff') return null;
  const store = deps.staff;
  if (!store) return { status: 503, body: 'Staff accounts are not available right now.' };
  const now = ctx.now().toISOString();

  // ---- Invite link: GET shows who it's from (no sign-in); POST accepts it ----
  if (parts[1] === 'join') {
    const token = parts[2] || '';
    if (parts.length !== 3 || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { status: 404, body: 'This invite link is not valid.' };
    const inv = await store.inviteByHash(await hashToken(token));
    const shop = inv ? await shopById(inv.shopId) : null;
    if (!inv || !shop) return { status: 404, body: 'This invite link is not valid. Ask the shop owner to send a new one.' };
    if (inv.acceptedAt) return { status: 410, body: 'This invite was already used. Sign in to open your shop.' };
    if (inv.expiresAt <= now) return { status: 410, body: 'This invite has expired. Ask the shop owner to send a new one.' };
    const info = { shopName: shop.name, email: inv.email, role: inv.role, roleLabel: ROLE_LABEL[inv.role] };
    if (method === 'GET') return ok(info);
    if (method !== 'POST') return { status: 405 };
    if (!ctx.userId) return { status: 401, body: 'Sign in first.' };
    const mine = (ctx.userEmail ?? '').toLowerCase();
    if (mine !== inv.email.toLowerCase())
      return { status: 403, body: `This invite is for ${inv.email}. Sign out, then sign in or create an account with that email.` };
    const current = await whoAmI();
    if (current?.shop.id === inv.shopId) { await store.claimInvite(inv.id, now); return ok({ joined: true, ...info }); }
    if (current) return { status: 409, body: `This account already belongs to ${current.shop.name}. Use a different email for ${shop.name}, or ask its owner to remove you first.` };
    if ((await store.listMembers(inv.shopId)).length >= MAX_STAFF) return { status: 409, body: `${shop.name} already has ${MAX_STAFF} staff accounts.` };
    if (!await store.claimInvite(inv.id, now)) return { status: 410, body: 'This invite was already used.' };
    const added = await store.addMember({ userId: ctx.userId, shopId: inv.shopId, role: inv.role, email: mine, name: inv.name || ctx.displayName || '', addedAt: now });
    if (!added) return { status: 409, body: 'This account already belongs to a shop.' };
    return ok({ joined: true, ...info });
  }

  // ---- Team (owners only) ----
  if (!ctx.userId) return { status: 401, body: 'Sign in first.' };
  const me = await whoAmI();
  if (!me) return { status: 409, body: 'Set up your shop first.' };
  if (me.seat.role !== 'owner') return ownerOnly();
  const { shop } = me;

  if (parts.length === 2 && method === 'GET') return ok(await team(store, shop, ctx.userId, now));

  if (parts[2] === 'invite' && parts.length === 3 && method === 'POST') {
    const email = str(body.email, 254).toLowerCase();
    const name = str(body.name, 80);
    const role = body.role === 'owner' ? 'owner' : 'tech';
    if (!validEmail(email)) return bad("Enter the person's email address.");
    const members = await store.listMembers(shop.id);
    if (members.some((m) => m.email.toLowerCase() === email)) return bad(`${email} is already on your team.`);
    const invites = await store.listInvites(shop.id);
    if (members.length + invites.filter((i) => i.expiresAt > now && i.email !== email).length >= MAX_STAFF) return bad(`A shop can have up to ${MAX_STAFF} staff accounts.`);
    if (invites.filter((i) => i.createdAt > new Date(ctx.now().getTime() - 86_400_000).toISOString()).length >= 40) return { status: 429, body: 'Too many invites today. Try again tomorrow.' };
    for (const old of invites.filter((i) => i.email === email)) await store.deleteInvite(shop.id, old.id);
    const token = deps.newToken();
    const inv: Invite = {
      id: ctx.newId(), shopId: shop.id, email, name, role, tokenHash: await hashToken(token), invitedBy: ctx.userId,
      createdAt: now, expiresAt: new Date(ctx.now().getTime() + INVITE_DAYS * 86_400_000).toISOString(), acceptedAt: null,
    };
    await store.saveInvite(inv);
    const sent = await sendInvite(deps, shop, inv, token);
    if (sent.delivery !== 'sent') ctx.log.warn('staff invite not emailed', { delivery: sent.delivery, note: sent.note });
    return ok({ ...(await team(store, shop, ctx.userId, now)), link: joinLink(deps, token), emailed: sent.delivery === 'sent', note: sent.note ?? null });
  }

  if (parts[2] === 'invites' && parts[3] && parts.length === 4 && method === 'DELETE') {
    await store.deleteInvite(shop.id, parts[3]);
    return ok(await team(store, shop, ctx.userId, now));
  }

  if (parts[2] === 'members' && parts[3] && parts.length === 4 && (method === 'POST' || method === 'DELETE')) {
    const target = parts[3];
    if (target === shop.ownerId) return bad("The shop's main owner can't be changed or removed.");
    if (target === ctx.userId) return bad("You can't change your own access. Ask another owner.");
    const m = (await store.listMembers(shop.id)).find((x) => x.userId === target);
    if (!m) return { status: 404, body: 'That person is not on your team.' };
    if (method === 'DELETE') await store.removeMember(shop.id, target);
    else {
      if (body.role !== 'owner' && body.role !== 'tech') return bad('Choose Owner or Technician.');
      await store.setRole(shop.id, target, body.role);
    }
    return ok(await team(store, shop, ctx.userId, now));
  }
  return { status: 404 };
}
