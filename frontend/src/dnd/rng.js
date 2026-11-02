// Seeded random numbers, so a map, a quest or a loot drop can be rebuilt from its seed.

/** mulberry32: a small, fast seeded generator. Returns () => [0, 1). */
export const makeRng = (seed) => {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/** Helpers bound to one generator. */
export const tools = (rand) => ({
  rand,
  int: (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1)),
  pick: (list) => list[Math.floor(rand() * list.length)],
  chance: (p) => rand() < p,
  shuffle: (list) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  },
});

/** Mixes a string into a seed, so 'map 3 of seed 99' always gives the same map. */
export const subSeed = (seed, salt) => {
  let h = (Number(seed) >>> 0) ^ 0x9e3779b9;
  const s = String(salt);
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
};
