// Procedurally painted pixel-art billboards. Everything is generated at runtime – no image files needed.

export const SS = 64;
export type SprTex = Uint8ClampedArray; // RGBA, real alpha (0 or 255)

export type Pose = "stand" | "walk1" | "walk2" | "shoot" | "pain" | "dead0" | "dead1";
export type EnemyKind = "soldier" | "heavy";
export type ItemKind = "health" | "ammo" | "shells" | "shotgun" | "barrel" | "lamp" | "plasma";

type Ctx = CanvasRenderingContext2D;

interface Pal {
  armor: string;
  dark: string;
  light: string;
  skin: string;
  visor: string;
  gun: string;
  pants: string;
  boots: string;
  accent: string;
}

const SOLDIER: Pal = {
  armor: "#4f6c3c",
  dark: "#2c4023",
  light: "#78995a",
  skin: "#c88f6c",
  visor: "#0c1319",
  gun: "#1b1b1d",
  pants: "#3b3a2b",
  boots: "#17171a",
  accent: "#d0a42a",
};

const HEAVY: Pal = {
  armor: "#7d2b23",
  dark: "#47130f",
  light: "#b04a3a",
  skin: "#7d7e86",
  visor: "#ff3a18",
  gun: "#26262c",
  pants: "#2b2b33",
  boots: "#141418",
  accent: "#ffb02a",
};

function finish(c: Ctx, tint?: [number, number, number, number]): SprTex {
  const img = c.getImageData(0, 0, SS, SS);
  const d = img.data;
  // hard alpha
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
  const alpha = new Uint8Array(SS * SS);
  for (let i = 0; i < SS * SS; i++) alpha[i] = d[i * 4 + 3];
  for (let y = 0; y < SS; y++) {
    for (let x = 0; x < SS; x++) {
      const p = y * SS + x;
      if (!alpha[p]) continue;
      const i = p * 4;
      // directional light + grain
      const k = 1.0 - (x / SS) * 0.26;
      const n = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 10;
      let r = d[i] * k + n;
      let g = d[i + 1] * k + n;
      let b = d[i + 2] * k + n;
      // dark outline
      const edge =
        (x > 0 && !alpha[p - 1]) || (x < SS - 1 && !alpha[p + 1]) || (y > 0 && !alpha[p - SS]) || (y < SS - 1 && !alpha[p + SS]);
      if (edge) {
        r *= 0.38;
        g *= 0.38;
        b *= 0.38;
      }
      if (tint) {
        const t = tint[3];
        r = r * (1 - t) + tint[0] * t;
        g = g * (1 - t) + tint[1] * t;
        b = b * (1 - t) + tint[2] * t;
      }
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
  }
  return new Uint8ClampedArray(d);
}

function canvas(): Ctx {
  const cv = document.createElement("canvas");
  cv.width = SS;
  cv.height = SS;
  const c = cv.getContext("2d", { willReadFrequently: true })!;
  c.imageSmoothingEnabled = false;
  return c;
}

function rect(c: Ctx, color: string, x: number, y: number, w: number, h: number) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function humanoid(c: Ctx, pose: Pose, p: Pal, b: number) {
  const cx = 32;
  const bw = Math.round(10 * b);
  const legW = Math.round(6 * b);
  const shootUp = pose === "shoot";
  const pain = pose === "pain";

  // legs
  const leg = (x: number, top: number, h: number) => {
    rect(c, p.pants, x, top, legW, h - 5);
    rect(c, p.dark, x, top, 2, h - 5);
    rect(c, p.boots, x - 1, top + h - 5, legW + 2, 5);
  };
  const gap = 1;
  if (pose === "walk1") {
    leg(cx - legW - gap - 1, 38, 17);
    leg(cx + gap + 1, 43, 17);
  } else if (pose === "walk2") {
    leg(cx - legW - gap - 1, 43, 17);
    leg(cx + gap + 1, 38, 17);
  } else {
    leg(cx - legW - gap, 42, 18);
    leg(cx + gap, 42, 18);
  }

  const ty = pain ? 22 : 20;
  // torso
  rect(c, p.armor, cx - bw, ty, bw * 2, 23);
  rect(c, p.light, cx - bw, ty, Math.round(bw * 0.6), 23);
  rect(c, p.dark, cx + Math.round(bw * 0.55), ty, Math.round(bw * 0.45), 23);
  // chest plate
  rect(c, p.light, cx - bw + 2, ty + 2, bw * 2 - 4, 9);
  rect(c, p.dark, cx - 1, ty + 2, 2, 9);
  // straps & belt
  rect(c, p.dark, cx - bw, ty + 17, bw * 2, 3);
  rect(c, p.accent, cx - 2, ty + 17, 4, 3);
  // pouches
  rect(c, p.dark, cx - bw + 1, ty + 12, 4, 4);
  rect(c, p.dark, cx + bw - 5, ty + 12, 4, 4);

  // shoulders
  const sh = b > 1.2 ? 9 : 6;
  rect(c, p.light, cx - bw - 3, ty - 1, sh, 6);
  rect(c, p.dark, cx - bw - 3, ty + 4, sh, 2);
  rect(c, p.armor, cx + bw - sh + 3, ty - 1, sh, 6);
  rect(c, p.dark, cx + bw - sh + 3, ty + 4, sh, 2);

  // left arm
  rect(c, p.armor, cx - bw - 4, ty + 5, 5, 14);
  rect(c, p.dark, cx - bw - 4, ty + 5, 1, 14);
  rect(c, p.skin, cx - bw - 4, ty + 18, 5, 4);

  // right arm + weapon
  if (shootUp) {
    rect(c, p.armor, cx + bw - 1, ty + 1, 5, 11);
    rect(c, p.skin, cx + bw - 1, ty - 3, 5, 4);
    rect(c, p.gun, cx + bw - 2, ty - 12, 7, 12);
    rect(c, "#555a60", cx + bw - 1, ty - 12, 2, 12);
    rect(c, "#0b0b0b", cx + bw, ty - 15, 3, 4);
    // muzzle flash
    const g = c.createRadialGradient(cx + bw + 1, ty - 17, 1, cx + bw + 1, ty - 17, 9);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, "#ffe27a");
    g.addColorStop(1, "rgba(255,120,20,0)");
    c.fillStyle = g;
    c.fillRect(cx + bw - 10, ty - 28, 24, 24);
  } else {
    rect(c, p.armor, cx + bw - 1, ty + 5, 5, 11);
    rect(c, p.skin, cx + bw - 1, ty + 15, 5, 4);
    rect(c, p.gun, cx + bw - 2, ty + 5, 7, 16);
    rect(c, "#555a60", cx + bw - 1, ty + 5, 2, 16);
    rect(c, "#0b0b0b", cx + bw, ty + 3, 3, 3);
  }

  // neck + head
  const hy = pain ? 14 : 12;
  const hx = pain ? cx + 2 : cx;
  rect(c, p.skin, hx - 3, hy + 6, 6, 5);
  c.fillStyle = p.skin;
  c.beginPath();
  c.ellipse(hx, hy + 1, 6.5, 7.5, 0, 0, Math.PI * 2);
  c.fill();
  // helmet
  c.fillStyle = p.armor;
  c.beginPath();
  c.arc(hx, hy, 8.5, Math.PI, 0);
  c.closePath();
  c.fill();
  rect(c, p.armor, hx - 8, hy, 16, 3);
  rect(c, p.light, hx - 7, hy - 6, 5, 2);
  rect(c, p.dark, hx + 3, hy - 4, 5, 6);
  // visor
  rect(c, p.visor, hx - 6, hy + 2, 12, 4);
  if (b > 1.2) {
    rect(c, "#ffd0b0", hx - 5, hy + 3, 10, 1);
  } else {
    rect(c, "#3b6a88", hx - 5, hy + 2, 4, 1);
  }
  // mouth/jaw
  rect(c, p.dark, hx - 3, hy + 8, 6, 1);
  if (b > 1.2) {
    // horns / antenna
    rect(c, p.dark, hx - 9, hy - 4, 2, 5);
    rect(c, p.dark, hx + 7, hy - 4, 2, 5);
  }
}

function enemyFrame(kind: EnemyKind, pose: Pose): SprTex {
  const pal = kind === "heavy" ? HEAVY : SOLDIER;
  const b = kind === "heavy" ? 1.35 : 1;
  const c = canvas();
  if (pose === "dead0" || pose === "dead1") {
    // blood pool
    const pool = pose === "dead1" ? 24 : 14;
    c.fillStyle = "rgba(110,8,8,0.95)";
    c.beginPath();
    c.ellipse(34, 59, pool, pose === "dead1" ? 5 : 3, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(160,14,10,0.9)";
    c.beginPath();
    c.ellipse(32, 58, pool * 0.6, 2.5, 0, 0, Math.PI * 2);
    c.fill();
    c.save();
    if (pose === "dead0") {
      c.translate(40, 60);
      c.rotate(-0.85);
      c.scale(0.9, 0.9);
      c.translate(-32, -60);
    } else {
      c.translate(58, 54);
      c.rotate(-Math.PI / 2);
      c.scale(0.62, 0.62);
      c.translate(-32, -58);
    }
    humanoid(c, "stand", pal, b);
    c.restore();
    return finish(c);
  }
  humanoid(c, pose, pal, b);
  if (pose === "pain") return finish(c, [255, 70, 50, 0.45]);
  return finish(c);
}

// ───────────────────────── ITEMS ─────────────────────────

function itemHealth(): SprTex {
  const c = canvas();
  rect(c, "#d8dadc", 18, 42, 28, 18);
  rect(c, "#f4f6f8", 18, 42, 28, 4);
  rect(c, "#9aa0a6", 18, 56, 28, 4);
  rect(c, "#8a9096", 42, 42, 4, 18);
  rect(c, "#c4121c", 29, 46, 6, 12);
  rect(c, "#c4121c", 26, 49, 12, 6);
  rect(c, "#8f0b12", 26, 54, 12, 1);
  rect(c, "#333", 20, 40, 8, 3);
  return finish(c);
}

function itemAmmo(): SprTex {
  const c = canvas();
  rect(c, "#4a5b2c", 16, 44, 32, 16);
  rect(c, "#62783a", 16, 44, 32, 4);
  rect(c, "#2f3b1b", 16, 56, 32, 4);
  for (let i = 0; i < 5; i++) {
    rect(c, "#e0b030", 19 + i * 5.5, 46, 3, 8);
    rect(c, "#b08418", 19 + i * 5.5, 52, 3, 2);
  }
  rect(c, "#222", 16, 49, 32, 1);
  rect(c, "#d8d8c0", 36, 55, 10, 3);
  return finish(c);
}

function itemShells(): SprTex {
  const c = canvas();
  for (let i = 0; i < 4; i++) {
    const x = 16 + i * 8;
    rect(c, "#c0181a", x, 42, 7, 14);
    rect(c, "#e44a4a", x, 42, 2, 14);
    rect(c, "#8a0e10", x + 5, 42, 2, 14);
    rect(c, "#d2a640", x, 55, 7, 5);
    rect(c, "#8a6a1e", x + 5, 55, 2, 5);
  }
  return finish(c);
}

function itemShotgun(): SprTex {
  const c = canvas();
  // shadow
  c.fillStyle = "rgba(0,0,0,0.5)";
  c.beginPath();
  c.ellipse(32, 58, 26, 3, 0, 0, Math.PI * 2);
  c.fill();
  rect(c, "#2b2d31", 8, 48, 46, 3);
  rect(c, "#4a4d54", 8, 48, 46, 1);
  rect(c, "#202226", 8, 51, 44, 3);
  rect(c, "#6a3f1e", 26, 50, 14, 6);
  rect(c, "#8a5a30", 26, 50, 14, 2);
  rect(c, "#6a3f1e", 46, 52, 14, 6);
  rect(c, "#8a5a30", 46, 52, 14, 2);
  rect(c, "#2b2d31", 40, 51, 6, 5);
  // glow ring so it's easy to spot
  return finish(c);
}

function itemBarrel(): SprTex {
  const c = canvas();
  const g = c.createLinearGradient(20, 0, 44, 0);
  g.addColorStop(0, "#a42a1c");
  g.addColorStop(0.35, "#e0503a");
  g.addColorStop(1, "#4e0f0a");
  c.fillStyle = g;
  c.fillRect(20, 20, 24, 38);
  c.beginPath();
  c.ellipse(32, 58, 12, 4, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#c04030";
  c.beginPath();
  c.ellipse(32, 20, 12, 4, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#702018";
  c.beginPath();
  c.ellipse(32, 20, 8, 2.4, 0, 0, Math.PI * 2);
  c.fill();
  // bands
  rect(c, "#2a1210", 20, 28, 24, 2);
  rect(c, "#2a1210", 20, 48, 24, 2);
  // hazard plate
  rect(c, "#e6c020", 26, 33, 12, 12);
  rect(c, "#161616", 31, 35, 2, 5);
  rect(c, "#161616", 31, 41, 2, 2);
  return finish(c);
}

function itemLamp(): SprTex {
  const c = canvas();
  rect(c, "#2c2e33", 26, 58, 12, 3);
  rect(c, "#44474e", 28, 56, 8, 3);
  rect(c, "#5a5e66", 31, 14, 3, 43);
  rect(c, "#8a8f98", 31, 14, 1, 43);
  rect(c, "#2c2e33", 26, 12, 12, 3);
  const g = c.createRadialGradient(32, 8, 1, 32, 8, 10);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.4, "#fff0b0");
  g.addColorStop(1, "rgba(255,190,80,0)");
  c.fillStyle = g;
  c.fillRect(18, 0, 28, 20);
  return finish(c);
}

function plasma(): SprTex {
  const c = canvas();
  const g = c.createRadialGradient(32, 32, 1, 32, 32, 18);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.25, "#ffe08a");
  g.addColorStop(0.6, "#ff5a1c");
  g.addColorStop(1, "rgba(255,40,10,0)");
  c.fillStyle = g;
  c.fillRect(8, 8, 48, 48);
  const img = c.getImageData(0, 0, SS, SS);
  // keep it glowy – skip outline/shading by returning raw with hard alpha
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 70 ? 255 : 0;
  return new Uint8ClampedArray(d);
}

export interface SpriteSet {
  enemies: Record<EnemyKind, Record<Pose, SprTex>>;
  items: Record<ItemKind, SprTex>;
}

let cache: SpriteSet | null = null;
export function getSprites(): SpriteSet {
  if (cache) return cache;
  const poses: Pose[] = ["stand", "walk1", "walk2", "shoot", "pain", "dead0", "dead1"];
  const mkEnemy = (k: EnemyKind) => {
    const o = {} as Record<Pose, SprTex>;
    for (const p of poses) o[p] = enemyFrame(k, p);
    return o;
  };
  cache = {
    enemies: { soldier: mkEnemy("soldier"), heavy: mkEnemy("heavy") },
    items: {
      health: itemHealth(),
      ammo: itemAmmo(),
      shells: itemShells(),
      shotgun: itemShotgun(),
      barrel: itemBarrel(),
      lamp: itemLamp(),
      plasma: plasma(),
    },
  };
  return cache;
}
