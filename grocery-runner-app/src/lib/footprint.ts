/**
 * What a store's building outline (from OpenStreetMap) says about its floor plan. A roof can't show
 * shelves, so this only estimates two things:
 * - the width of the shop front, which sets roughly how many aisles fit side by side;
 * - which end of the front the entrance is at, seen from the parking lot (left or right).
 *
 * The front wall is the one with the mapped entrance; without one, the wall facing the biggest
 * nearby parking lot. Pure geometry, no network, so it can be tested.
 */

export type LatLon = { lat: number; lon: number };

export type BuildingInfo = {
  /** Width of the shop front, metres. */
  frontageM: number;
  /** Front to back, metres. */
  depthM: number;
  /** Where the entrance is along the front, seen from outside. null = no entrance mapped. */
  entranceSide: 'left' | 'center' | 'right' | null;
  /** Rough count of numbered aisles that fit across the front. */
  aisleEstimate: number;
};

type P = { x: number; y: number };

const AISLE_PITCH_M = 3.4; // shelf + walkway
const PERIMETER_M = 25; // produce, bakery, dairy cases along the side walls
const MIN_AISLES = 4;
const MAX_AISLES = 60;

/** Local flat projection in metres around `origin` (x east, y north). Fine at building scale. */
function project(origin: LatLon) {
  const kx = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return (p: LatLon): P => ({ x: (p.lon - origin.lon) * kx, y: (p.lat - origin.lat) * 110_540 });
}

const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: P, b: P) => a.x * b.x + a.y * b.y;
const len = (a: P) => Math.hypot(a.x, a.y);

function centroid(pts: P[]): P {
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
}

function distToSegment(p: P, a: P, b: P): number {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  return len(sub(p, { x: a.x + ab.x * t, y: a.y + ab.y * t }));
}

/** Area of a polygon in square metres (shoelace). */
export function polygonAreaM2(outline: LatLon[]): number {
  if (outline.length < 3) return 0;
  const pts = outline.map(project(outline[0]));
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** True when `p` is inside the outline (ray casting). */
export function containsPoint(outline: LatLon[], p: LatLon): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i];
    const b = outline[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) {
      inside = !inside;
    }
  }
  return inside;
}

export function aisleEstimateFromFrontage(frontageM: number): number {
  return Math.min(MAX_AISLES, Math.max(MIN_AISLES, Math.round((frontageM - PERIMETER_M) / AISLE_PITCH_M)));
}

export function analyseFootprint(outline: LatLon[], entrances: LatLon[] = [], parking: LatLon[] = []): BuildingInfo | null {
  const ring = outline.length > 1 && outline[0].lat === outline.at(-1)!.lat && outline[0].lon === outline.at(-1)!.lon
    ? outline.slice(0, -1)
    : outline;
  if (ring.length < 3) return null;
  const proj = project(ring[0]);
  const pts = ring.map(proj);
  const c = centroid(pts);

  // Pick the front wall: nearest to the entrance, else facing the biggest parking lot.
  const entrance = entrances.length
    ? entrances.map(proj).sort((a, b) => nearestEdge(pts, a).d - nearestEdge(pts, b).d)[0]
    : null;
  const target = entrance ?? (parking.length ? centroid(parking.map(proj)) : null);
  // Without any clue, call the longest wall the front: most stores are wider than deep.
  const edgeIndex = target ? facingEdge(pts, c, target) : longestEdge(pts);

  // Measure the building across (along the front wall) and front to back.
  const a = pts[edgeIndex];
  const b = pts[(edgeIndex + 1) % pts.length];
  const along = sub(b, a);
  const u = { x: along.x / (len(along) || 1), y: along.y / (len(along) || 1) };
  const inward0 = { x: -u.y, y: u.x };
  const inward = dot(inward0, sub(c, a)) >= 0 ? inward0 : { x: u.y, y: -u.x };
  const spanU = pts.map((p) => dot(sub(p, a), u));
  const spanV = pts.map((p) => dot(sub(p, a), inward));
  const frontageM = Math.max(...spanU) - Math.min(...spanU);
  const depthM = Math.max(...spanV) - Math.min(...spanV);

  let entranceSide: BuildingInfo['entranceSide'] = null;
  if (entrance) {
    // Standing outside looking in (direction `inward`), right is `inward` turned clockwise.
    const right = { x: inward.y, y: -inward.x };
    const mid = Math.min(...spanU) + frontageM / 2;
    // Position along the wall, measured toward the viewer's right, from -1 (left end) to 1 (right end).
    const offset = (dot(sub(entrance, a), u) - mid) * Math.sign(dot(u, right) || 1);
    const s = offset / (frontageM / 2 || 1);
    entranceSide = s > 0.33 ? 'right' : s < -0.33 ? 'left' : 'center';
  }

  return {
    frontageM: Math.round(frontageM),
    depthM: Math.round(depthM),
    entranceSide,
    aisleEstimate: aisleEstimateFromFrontage(frontageM),
  };
}

function nearestEdge(pts: P[], p: P) {
  let best = { i: 0, d: Infinity };
  for (let i = 0; i < pts.length; i++) {
    const d = distToSegment(p, pts[i], pts[(i + 1) % pts.length]);
    if (d < best.d) best = { i, d };
  }
  return best;
}

/** The wall whose outward side faces `target` best, weighted by wall length (ignores small jogs). */
function facingEdge(pts: P[], c: P, target: P): number {
  const toTarget = sub(target, c);
  const n = len(toTarget) || 1;
  const dir = { x: toTarget.x / n, y: toTarget.y / n };
  let best = { i: 0, score: -Infinity };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const e = sub(b, a);
    const l = len(e) || 1;
    let normal = { x: e.y / l, y: -e.x / l };
    if (dot(normal, sub(a, c)) < 0) normal = { x: -normal.x, y: -normal.y };
    // Facing the target matters most; length breaks near ties toward the main wall, not a corner jog.
    const score = dot(normal, dir) * 100 + Math.min(l, 100) / 10 - distToSegment(target, a, b) / 100;
    if (score > best.score) best = { i, score };
  }
  // An entrance on a wall decides it outright.
  if (len(sub(target, c)) > 0) {
    const near = nearestEdge(pts, target);
    if (near.d < 8) return near.i;
  }
  return best.i;
}

function longestEdge(pts: P[]): number {
  let best = { i: 0, l: -1 };
  for (let i = 0; i < pts.length; i++) {
    const l = len(sub(pts[(i + 1) % pts.length], pts[i]));
    if (l > best.l) best = { i, l };
  }
  return best.i;
}
