import { fbm, hash2 } from "./rng";

/** 64x64 RGBA. Alpha channel stores EMISSIVE strength (0-255), not transparency. */
export type Tex = Uint8ClampedArray;
export const TS = 64;

type Px = [number, number, number, number?];

function build(fn: (x: number, y: number) => Px): Tex {
  const t = new Uint8ClampedArray(TS * TS * 4);
  for (let y = 0; y < TS; y++) {
    for (let x = 0; x < TS; x++) {
      const [r, g, b, e] = fn(x, y);
      const i = (y * TS + x) * 4;
      t[i] = r;
      t[i + 1] = g;
      t[i + 2] = b;
      t[i + 3] = e ?? 0;
    }
  }
  return t;
}

const grain = (x: number, y: number, s: number, amt: number) => (hash2(x, y, s) - 0.5) * amt;

// ───────────────────────── WALLS ─────────────────────────

function brick(): Tex {
  return build((x, y) => {
    const row = (y / 8) | 0;
    const off = (row % 2) * 8;
    const xx = (x + off) % 64;
    const bx = xx % 16;
    const by = y % 8;
    const brickId = ((xx / 16) | 0) + row * 4;
    const n = fbm(x, y, 3);
    const grime = fbm(x * 0.7, y * 2.2, 9);
    // mortar
    if (bx < 1 || by < 1) {
      const m = 95 + grain(x, y, 2, 40) + n * 30;
      return [m, m - 4, m - 10];
    }
    const v = hash2(brickId, row, 5);
    let r = 128 + v * 60;
    let g = 52 + v * 24;
    let b = 38 + v * 18;
    // bevel
    if (by === 1 || bx === 1) {
      r *= 1.22;
      g *= 1.22;
      b *= 1.22;
    }
    if (by === 7 || bx === 15) {
      r *= 0.68;
      g *= 0.68;
      b *= 0.68;
    }
    // pitting & grain
    const k = 0.78 + n * 0.5 + grain(x, y, 11, 0.22);
    r *= k;
    g *= k;
    b *= k;
    // soot / grime streaks
    const gm = Math.max(0, grime - 0.5) * 1.6;
    r *= 1 - gm * 0.7;
    g *= 1 - gm * 0.6;
    b *= 1 - gm * 0.5;
    return [r, g, b];
  });
}

function metal(): Tex {
  return build((x, y) => {
    const px = x % 32;
    const py = y % 32;
    const n = fbm(x, y, 21);
    const brushed = hash2(0, y, 31) * 14 + hash2((x / 8) | 0, y, 33) * 10;
    let base = 98 + brushed + n * 40;
    let r = base * 0.86;
    let g = base * 0.93;
    let b = base * 1.06;
    // seams
    if (px === 0 || py === 0) {
      r *= 0.35;
      g *= 0.35;
      b *= 0.4;
    } else if (px === 1 || py === 1) {
      r *= 1.35;
      g *= 1.35;
      b *= 1.4;
    }
    // rivets
    const rv = (cx: number, cy: number) => {
      const d = Math.hypot(px - cx, py - cy);
      return d;
    };
    const dd = Math.min(rv(4, 4), rv(27, 4), rv(4, 27), rv(27, 27));
    if (dd < 2.2) {
      const l = dd < 1.2 ? 1.5 : 0.55;
      r *= l;
      g *= l;
      b *= l;
    }
    // rust
    const rust = fbm(x * 1.2, y * 0.9, 41);
    const rm = Math.max(0, rust - 0.56) * 4;
    if (rm > 0) {
      const t = Math.min(1, rm);
      r = r * (1 - t) + (150 + hash2(x, y, 3) * 40) * t;
      g = g * (1 - t) + (72 + hash2(x, y, 4) * 24) * t;
      b = b * (1 - t) + 32 * t;
    }
    // hazard stripe band
    if (y >= 54 && y < 61) {
      const s = ((x + y) >> 3) & 1;
      const hr = s ? 225 : 28;
      const hg = s ? 180 : 28;
      const hb = s ? 20 : 26;
      const k = 0.8 + n * 0.4;
      return [hr * k, hg * k, hb * k];
    }
    return [r, g, b];
  });
}

function concrete(): Tex {
  return build((x, y) => {
    const n = fbm(x, y, 51);
    const n2 = fbm(x * 3, y * 3, 52);
    let v = 118 + n * 70 + n2 * 20 + grain(x, y, 53, 26);
    // stains running down
    const st = fbm(x * 2.5, y * 0.5, 54);
    v *= 1 - Math.max(0, st - 0.55) * 1.4;
    let r = v * 0.98;
    let g = v * 0.99;
    let b = v * 1.0;
    // panel joints
    const px = x % 32;
    const py = y % 32;
    if (px === 0 || py === 0) {
      r *= 0.5;
      g *= 0.5;
      b *= 0.5;
    } else if (px === 1 || py === 1) {
      r *= 1.12;
      g *= 1.12;
      b *= 1.12;
    }
    // hairline cracks
    const crack = Math.abs(Math.sin((x + fbm(x, y, 55) * 26) * 0.35 + y * 0.12));
    if (crack < 0.035 && fbm(x * 0.5, y * 0.5, 56) > 0.48) {
      r *= 0.4;
      g *= 0.4;
      b *= 0.4;
    }
    // stencil number-ish block
    if (x > 40 && x < 56 && y > 38 && y < 52 && ((x - 40) % 6 < 4) && ((y - 38) % 5 < 3)) {
      r *= 0.55;
      g *= 0.55;
      b *= 0.55;
    }
    return [r, g, b];
  });
}

function tech(): Tex {
  return build((x, y) => {
    const px = x % 32;
    const py = y % 32;
    const pid = ((x / 32) | 0) + ((y / 32) | 0) * 2;
    const kind = Math.floor(hash2(pid, 7, 61) * 4);
    const n = fbm(x, y, 62);
    let base = 38 + n * 26 + grain(x, y, 63, 8);
    let r = base * 0.8;
    let g = base * 0.95;
    let b = base * 1.25;
    // frame
    if (px < 2 || py < 2) {
      r = 22;
      g = 26;
      b = 34;
    } else if (px === 2 || py === 2) {
      r *= 1.7;
      g *= 1.7;
      b *= 1.8;
    }
    // content
    if (kind === 0) {
      // screen
      if (px > 5 && px < 27 && py > 6 && py < 20) {
        const scan = (py & 1) === 0 ? 1 : 0.7;
        const wave = Math.sin(px * 0.6 + pid * 3) * 0.5 + 0.5;
        const on = py > 20 - wave * 12 ? 1 : 0.2;
        return [20 * scan, (170 * on + 40) * scan, (190 * on + 40) * scan, 220];
      }
      if (px > 4 && px < 28 && py > 5 && py < 21) return [10, 12, 16];
    } else if (kind === 1) {
      // leds
      if (py > 6 && py < 26 && px > 6 && px < 26 && px % 6 === 3 && py % 5 === 2) {
        const c = hash2(px, py, pid) > 0.5;
        return c ? [60, 255, 90, 255] : [255, 60, 50, 255];
      }
    } else if (kind === 2) {
      // vents
      if (px > 5 && px < 27 && py > 5 && py < 27) {
        if (py % 3 === 0) return [8, 10, 14];
        return [r * 1.25, g * 1.25, b * 1.25];
      }
    } else {
      // warning sign
      if (px > 8 && px < 24 && py > 8 && py < 24) {
        const cx = px - 16;
        const cy = py - 18;
        const tri = cy > -9 && Math.abs(cx) < (cy + 10) * 0.55;
        if (tri) return Math.abs(cx) < 1.2 && cy < 3 ? [20, 20, 20] : [230, 180, 20, 60];
      }
    }
    return [r, g, b];
  });
}

// ───────────────────────── FLOORS ─────────────────────────

function floorConcrete(): Tex {
  return build((x, y) => {
    const n = fbm(x, y, 71);
    const n2 = fbm(x * 2, y * 2, 72);
    let v = 62 + n * 52 + n2 * 14 + grain(x, y, 73, 16);
    const tile = ((x / 32) | 0) + ((y / 32) | 0);
    v *= 0.94 + hash2(tile, 1, 74) * 0.1;
    const px = x % 32;
    const py = y % 32;
    if (px === 0 || py === 0) v *= 0.4;
    else if (px === 1 || py === 1) v *= 1.15;
    // oil / grime
    const oil = fbm(x * 1.4, y * 1.4, 75);
    if (oil > 0.63) v *= 0.55;
    return [v * 0.97, v, v * 1.04];
  });
}

function floorGrate(): Tex {
  return build((x, y) => {
    // diamond plate
    const n = fbm(x, y, 81);
    const dx = (x % 16) - 8;
    const dy = (y % 16) - 8;
    const dia = Math.abs(dx) + Math.abs(dy) < 5 ? 1 : 0;
    const rot = ((x >> 4) + (y >> 4)) & 1;
    const lug = rot ? (Math.abs(dx - dy) < 2 && Math.abs(dx + dy) < 9 ? 1 : 0) : (Math.abs(dx + dy) < 2 && Math.abs(dx - dy) < 9 ? 1 : 0);
    let v = 58 + n * 40 + grain(x, y, 82, 12);
    if (lug) v += 38;
    else if (dia) v += 6;
    if (x % 32 === 0 || y % 32 === 0) v *= 0.4;
    let r = v * 0.82;
    let g = v * 0.9;
    let b = v * 1.0;
    const rust = fbm(x * 1.3, y * 1.3, 83);
    if (rust > 0.6) {
      const t = Math.min(1, (rust - 0.6) * 5);
      r = r * (1 - t) + 120 * t;
      g = g * (1 - t) + 62 * t;
      b = b * (1 - t) + 30 * t;
    }
    return [r, g, b];
  });
}

function exitPad(active: boolean): Tex {
  return build((x, y) => {
    const dx = x - 31.5;
    const dy = y - 31.5;
    const d = Math.hypot(dx, dy);
    const base = 40 + fbm(x, y, 91) * 30;
    const col: [number, number, number] = active ? [60, 255, 120] : [255, 50, 40];
    // rings
    const ring = Math.abs(d - 22) < 2 || Math.abs(d - 12) < 1.4;
    const cross = (Math.abs(dx) < 1.5 || Math.abs(dy) < 1.5) && d < 22;
    const border = x < 3 || y < 3 || x > 60 || y > 60;
    if (ring || cross) return [col[0], col[1], col[2], 255];
    if (border) {
      const s = ((x + y) >> 3) & 1;
      return s ? [220, 180, 20, 60] : [20, 20, 20];
    }
    return [base * 0.8, base * 0.9, base, 0];
  });
}

// ───────────────────────── CEILINGS ─────────────────────────

function ceilPlain(): Tex {
  return build((x, y) => {
    const n = fbm(x, y, 101);
    let v = 34 + n * 30 + grain(x, y, 102, 10);
    const px = x % 32;
    const py = y % 32;
    if (px < 2 || py < 2) v *= 0.45;
    else if (px === 2 || py === 2) v *= 1.3;
    // pipe run
    if (y > 40 && y < 50) {
      const t = (y - 40) / 10;
      const sh = 0.5 + Math.sin(t * Math.PI) * 0.9;
      const band = x % 21 < 2 ? 0.55 : 1;
      return [v * 1.9 * sh * band, v * 1.8 * sh * band, v * 1.6 * sh * band];
    }
    return [v * 0.9, v * 0.95, v * 1.05];
  });
}

function ceilLamp(): Tex {
  return build((x, y) => {
    const px = x - 31.5;
    const py = y - 31.5;
    if (Math.abs(px) < 17 && Math.abs(py) < 10) {
      const edge = Math.abs(px) > 15 || Math.abs(py) > 8;
      if (edge) return [80, 80, 84];
      const strip = Math.abs(((px + 17) % 8.5) - 4.25) > 3.8;
      if (strip) return [200, 200, 190, 160];
      return [255, 250, 225, 255];
    }
    const n = fbm(x, y, 111);
    let v = 34 + n * 30;
    const qx = x % 32;
    const qy = y % 32;
    if (qx < 2 || qy < 2) v *= 0.45;
    return [v * 0.9, v * 0.95, v * 1.05];
  });
}

export interface TextureSet {
  walls: Tex[]; // 0 brick, 1 metal, 2 concrete, 3 tech
  floors: Tex[]; // 0 concrete, 1 grate, 2 exit locked, 3 exit active
  ceils: Tex[]; // 0 plain, 1 lamp
}

let cache: TextureSet | null = null;
export function getTextures(): TextureSet {
  if (cache) return cache;
  cache = {
    walls: [brick(), metal(), concrete(), tech()],
    floors: [floorConcrete(), floorGrate(), exitPad(false), exitPad(true)],
    ceils: [ceilPlain(), ceilLamp()],
  };
  return cache;
}
