// Small deterministic helpers for procedural texture generation.

export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

/** Tileable value noise (period = wrap cells). */
export function vnoise(x: number, y: number, wrap: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const w = (v: number) => ((v % wrap) + wrap) % wrap;
  const a = hash2(w(xi), w(yi), seed);
  const b = hash2(w(xi + 1), w(yi), seed);
  const c = hash2(w(xi), w(yi + 1), seed);
  const d = hash2(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/** Fractal brownian motion, tileable on a 64px texture. */
export function fbm(px: number, py: number, seed = 0, size = 64): number {
  let amp = 0.5;
  let sum = 0;
  let cells = 4;
  for (let o = 0; o < 4; o++) {
    sum += amp * vnoise((px / size) * cells, (py / size) * cells, cells, seed + o * 17);
    amp *= 0.5;
    cells *= 2;
  }
  return sum;
}

export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
