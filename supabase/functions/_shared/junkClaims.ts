// Curbsy "I'm on my way": one tap claims an item while you drive over, and the trip is tracked so a
// claim nobody is actually acting on goes back up for grabs.
//
// While a claim is open the claimer's phone sends its position every minute or so (the iPhone app keeps
// sending with the screen off, see TripPlugin in ios-junk-app). The claim is released automatically when:
//   - the phone stops sending (location off, app closed) for STALE_MIN minutes,
//   - the claimer heads the other way (much farther than the closest they got),
//   - they stop getting closer for STALL_MIN minutes,
//   - or the trip takes far longer than the drive should.
// Rules are checked on every ping and whenever someone looks at the item, so no timer job is needed.
// Only the claimer's distance to the item is kept (plus their last rounded position while the trip is on);
// the poster sees "2.1 mi away, getting closer", never where the claimer is.

export type ClaimStatus = 'active' | 'arrived' | 'picked_up' | 'cancelled' | 'released' | 'owner_released' | 'item_gone';
export const OPEN_CLAIM: ClaimStatus[] = ['active', 'arrived'];

export interface JunkClaim {
  id: string;
  itemId: string;
  ownerId: string;
  claimerId: string;
  claimerName: string;
  /** On a first come, first served listing: several people can be on the way at once. */
  shared: boolean;
  /** On a multi-item post, the things this trip is for (empty means the whole listing). */
  pieceIds: string[];
  status: ClaimStatus;
  /** Why it ended, in words for the people involved. */
  reason: string;
  startKm: number;
  /** Closest the claimer has been, and when they last got meaningfully closer. */
  bestKm: number;
  bestAt: string;
  lastKm: number;
  lastPingAt: string;
  createdAt: string;
  deadlineAt: string;
  arrivedAt: string | null;
  endedAt: string | null;
}

export interface ClaimStore {
  /** Saves a new open claim; false when the claimer already has one, or (unless shared) the item does. */
  insertClaim(c: JunkClaim): Promise<boolean>;
  updateClaim(c: JunkClaim): Promise<void>;
  openClaimsForItems(itemIds: string[]): Promise<JunkClaim[]>;
  countClaimsSince(userId: string, since: string): Promise<number>;
  /** When this person's last claim on this item ended without a pickup (for the cool-down), or null. */
  lastEndedClaim(userId: string, itemId: string): Promise<JunkClaim | null>;
}

/** Within this of the (rounded) spot counts as there. Item spots are rounded to about 110 m. */
export const ARRIVE_KM = 0.3;
/** Getting at least this much closer counts as progress. */
export const PROGRESS_KM = 0.25;
/** No position from the phone for this long releases the claim. */
export const STALE_MIN = 12;
/** No progress for this long releases the claim. */
export const STALL_MIN = 12;
/** No judging of direction in the first few minutes (backing out of the driveway, finding the car). */
export const GRACE_MIN = 5;
/** After arriving, this long to load up and tap "Got it" before the item goes back up. */
export const ARRIVED_MIN = 45;
/** Can't claim items farther than this. */
export const MAX_CLAIM_KM = 80;
export const CLAIMS_PER_DAY = 12;
/** After a claim on an item is released, the same person waits this long to claim it again. */
export const RECLAIM_COOLDOWN_MIN = 30;

const MIN = 60_000;

/** Time allowed for the whole trip: 15 minutes plus 3 minutes per km (about 20 km/h door to door), at most 2.5 hours. */
export const tripMinutes = (km: number) => Math.min(150, Math.round(15 + 3 * km));
/** Rough drive time shown to people: about 40 km/h in town. */
export const etaMinutes = (km: number) => Math.max(1, Math.round(1 + (km * 60) / 40));
/** How much farther than the closest point they can drift before it counts as heading away. */
export const awayAllowanceKm = (startKm: number) => Math.max(1, startKm * 0.25);

/** The claim as it stands at `now`: still open, or ended with a reason. Pure; the caller saves changes. */
export function judgeClaim(c: JunkClaim, now: Date): JunkClaim {
  if (!OPEN_CLAIM.includes(c.status)) return c;
  const t = now.getTime();
  const nowIso = now.toISOString();
  const end = (reason: string): JunkClaim => ({ ...c, status: 'released', reason, endedAt: nowIso });
  if (c.status === 'arrived') {
    if (c.arrivedAt && t - Date.parse(c.arrivedAt) > ARRIVED_MIN * MIN) return end('Pickup wasn\'t confirmed in time.');
    return c;
  }
  if (t > Date.parse(c.deadlineAt)) return end('The trip took too long.');
  if (t - Date.parse(c.lastPingAt) > STALE_MIN * MIN) return end('We stopped getting your location.');
  if (t - Date.parse(c.createdAt) >= GRACE_MIN * MIN) {
    if (c.lastKm > c.bestKm + awayAllowanceKm(c.startKm)) return end('You were heading away from it.');
    if (t - Date.parse(c.bestAt) > STALL_MIN * MIN) return end('You weren\'t getting any closer.');
  }
  return c;
}

/** Records a new position (distance to the item) on an open claim, then judges it. */
export function pingClaim(c: JunkClaim, km: number, now: Date): JunkClaim {
  if (!OPEN_CLAIM.includes(c.status)) return c;
  const nowIso = now.toISOString();
  const next: JunkClaim = { ...c, lastKm: km, lastPingAt: nowIso };
  if (km <= c.bestKm - PROGRESS_KM) {
    next.bestKm = km;
    next.bestAt = nowIso;
  }
  if (next.status === 'active' && km <= ARRIVE_KM) {
    next.status = 'arrived';
    next.arrivedAt = nowIso;
    next.bestKm = Math.min(next.bestKm, km);
    next.bestAt = nowIso;
  }
  return judgeClaim(next, now);
}

export function newClaim(f: { id: string; itemId: string; ownerId: string; claimerId: string; claimerName: string; km: number; now: Date; shared?: boolean; pieceIds?: string[] }): JunkClaim {
  const nowIso = f.now.toISOString();
  const arrived = f.km <= ARRIVE_KM;
  return {
    id: f.id, itemId: f.itemId, ownerId: f.ownerId, claimerId: f.claimerId, claimerName: f.claimerName, shared: !!f.shared, pieceIds: f.pieceIds ?? [],
    status: arrived ? 'arrived' : 'active', reason: '',
    startKm: f.km, bestKm: f.km, bestAt: nowIso, lastKm: f.km, lastPingAt: nowIso,
    createdAt: nowIso, deadlineAt: new Date(f.now.getTime() + tripMinutes(f.km) * MIN).toISOString(),
    arrivedAt: arrived ? nowIso : null, endedAt: null,
  };
}

/** Getting closer, holding steady, or drifting away, from the last two readings we judge on. */
const trend = (c: JunkClaim) => (c.lastKm <= c.bestKm + 0.05 ? 'closer' : c.lastKm > c.bestKm + 0.5 ? 'away' : 'steady');

/** What each person may see about a claim. */
export function claimOut(c: JunkClaim, me: string | null) {
  const open = OPEN_CLAIM.includes(c.status);
  const base = {
    id: c.id,
    itemId: c.itemId,
    state: c.status,
    open,
    etaMin: open && c.status === 'active' ? etaMinutes(c.lastKm) : 0,
    since: c.createdAt,
    pieceIds: c.pieceIds ?? [],
  };
  if (me === c.claimerId) {
    return {
      ...base, mine: true, reason: c.reason, km: Math.round(c.lastKm * 100) / 100, startKm: Math.round(c.startKm * 100) / 100,
      trend: trend(c), deadlineAt: c.deadlineAt, lastPingAt: c.lastPingAt, arrivedAt: c.arrivedAt,
    };
  }
  if (me === c.ownerId) {
    return {
      ...base, mine: false, forMyItem: true, claimerId: c.claimerId, claimerName: c.claimerName, reason: c.reason,
      km: Math.round(c.lastKm * 10) / 10, trend: trend(c), arrivedAt: c.arrivedAt,
    };
  }
  // Everyone else just learns the item is spoken for.
  return { ...base, mine: false };
}
