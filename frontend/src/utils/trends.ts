// ─── Pseudo-random trend helpers for KPI sparklines ──────────────────────────

function pseudoRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export function fakeTrendSeries(value: number, key: string, points = 12): number[] {
  if (!value) return Array(points).fill(0);
  let seed = 0;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  seed = (seed + Math.round(value)) >>> 0;
  const rnd = pseudoRand(seed || 1);
  const out: number[] = [];
  let cur = value * (0.55 + rnd() * 0.25);
  for (let i = 0; i < points - 1; i++) {
    const noise = (rnd() - 0.45) * value * 0.18;
    cur = Math.max(0, cur + noise + (value - cur) * 0.08);
    out.push(cur);
  }
  out.push(value);
  return out;
}

export function fakeTrendDelta(value: number, key: string): number {
  if (!value) return 0;
  const s = fakeTrendSeries(value, key, 14);
  const prev = s[Math.floor(s.length / 2) - 1] || 1;
  const last = s[s.length - 1];
  if (!prev) return 0;
  return ((last - prev) / prev) * 100;
}
