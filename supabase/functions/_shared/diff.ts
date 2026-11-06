// Small, JSON-only diff used for live draft updates. Broadcasting the whole league on every bid
// would send ~100KB+ to every browser; these ops are usually a few hundred bytes.
// The same applyOps lives in frontend/src/realtime.js; keep the two in sync.

export type Op =
  | { k: string; set: unknown }
  | { k: string; del: true }
  | { k: string; append: unknown[] }
  | { k: string; items: Record<string, unknown> };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function diffObjects(prev: Record<string, unknown>, next: Record<string, unknown>): Op[] {
  const ops: Op[] = [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);

  for (const k of keys) {
    const a = prev[k];
    const b = next[k];
    if (!(k in next)) {
      ops.push({ k, del: true });
      continue;
    }
    if (same(a, b)) continue;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (b.length > a.length && same(a, b.slice(0, a.length))) {
        ops.push({ k, append: b.slice(a.length) });
        continue;
      }
      // A few existing items edited plus new ones appended (a whiteboard award trims the previous
      // pick's drawings and adds a pick): send the edits, then the append. applyOps runs them in order.
      if (b.length > a.length && a.length > 0) {
        const items: Record<string, unknown> = {};
        let changed = 0;
        for (let i = 0; i < a.length; i += 1) {
          if (!same(a[i], b[i])) {
            items[i] = b[i];
            changed += 1;
          }
        }
        if (changed * 2 <= b.length) {
          ops.push({ k, items });
          ops.push({ k, append: b.slice(a.length) });
          continue;
        }
      }
      if (b.length === a.length) {
        const items: Record<string, unknown> = {};
        let changed = 0;
        for (let i = 0; i < b.length; i += 1) {
          if (!same(a[i], b[i])) {
            items[i] = b[i];
            changed += 1;
          }
        }
        if (changed * 2 <= b.length) {
          ops.push({ k, items });
          continue;
        }
      }
    }

    ops.push({ k, set: b });
  }

  return ops;
}

export function applyOps(target: Record<string, unknown>, ops: Op[]): Record<string, unknown> {
  const next: Record<string, unknown> = { ...target };
  for (const op of ops) {
    if ('del' in op) {
      delete next[op.k];
    } else if ('set' in op) {
      next[op.k] = op.set;
    } else if ('append' in op) {
      next[op.k] = [...((next[op.k] as unknown[]) ?? []), ...op.append];
    } else if ('items' in op) {
      const list = [...((next[op.k] as unknown[]) ?? [])];
      for (const [index, value] of Object.entries(op.items)) list[Number(index)] = value;
      next[op.k] = list;
    }
  }
  return next;
}
