import { LEVELS, type LevelDef } from "./levels";
import { getTextures, TS, type Tex } from "./textures";
import { getSprites, SS, type SprTex, type Pose, type EnemyKind, type ItemKind } from "./sprites";
import { Sound, type SfxKind } from "./audio";
import { hash2 } from "./rng";

export type GameState = "menu" | "playing" | "paused" | "dead" | "levelDone" | "victory";

export interface Hud {
  health: number;
  bullets: number;
  shells: number;
  weapon: 0 | 1;
  hasShotgun: boolean;
  kills: number;
  total: number;
  level: number;
  levelName: string;
  message: string;
  exitOpen: boolean;
  time: number;
  hurt: number;
}

interface Callbacks {
  onHud: (h: Hud) => void;
  onState: (s: GameState) => void;
}

interface Enemy {
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  dead: boolean;
  deadT: number;
  alerted: boolean;
  painT: number;
  atkT: number;
  cd: number;
  anim: number;
  moving: boolean;
  strafe: number;
  strafeT: number;
}
interface Item {
  x: number;
  y: number;
  kind: ItemKind;
  taken: boolean;
}
interface Prop {
  x: number;
  y: number;
  kind: "barrel" | "lamp";
  alive: boolean;
  hp: number;
  fuse: number;
}
interface Proj {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}
interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  r: number;
  g: number;
  b: number;
  size: number;
  grav: number;
}
interface Drawable {
  x: number;
  y: number;
  tex: SprTex;
  scale: number;
  lift: number;
  full: boolean;
  dist: number;
}

const LMR = 8; // lightmap samples per tile
const SOLID_PROP_R = 0.3;

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  sound = new Sound();
  cb: Callbacks;
  state: GameState = "menu";
  isTouch = false;

  // render target
  W = 320;
  H = 200;
  img!: ImageData;
  buf!: Uint32Array;
  zbuf = new Float32Array(320);
  focal = 200;
  planeLen = 0.8;
  quality = 1;

  // assets
  tex = getTextures();
  spr = getSprites();

  // level
  levelIndex = 0;
  def: LevelDef = LEVELS[0];
  mw = 0;
  mh = 0;
  cells = new Uint8Array(0); // 0 empty else wallTex+1
  floorKind = new Uint8Array(0);
  ceilLamp = new Uint8Array(0);
  lm = new Float32Array(0);
  lmf = new Float32Array(0);
  lw = 0;
  lh = 0;
  seen = new Uint8Array(0);
  flow = new Int16Array(0);
  flowT = 0;
  exit = { x: 0, y: 0 };
  exitOpen = false;
  flick = 1;

  enemies: Enemy[] = [];
  items: Item[] = [];
  props: Prop[] = [];
  projs: Proj[] = [];
  parts: Particle[] = [];
  drawList: Drawable[] = [];

  // player
  p = {
    x: 2,
    y: 2,
    a: 0,
    health: 100,
    bullets: 60,
    shells: 0,
    weapon: 0 as 0 | 1,
    hasShotgun: false,
    bobT: 0,
    bobAmp: 0,
    stepPhase: 0,
    fireCd: 0,
    fireAnim: 0,
    flash: 0,
    hurt: 0,
    pick: 0,
    hit: 0,
    deathT: 0,
    shake: 0,
    kills: 0,
    time: 0,
  };
  saved = { health: 100, bullets: 60, shells: 0, weapon: 0 as 0 | 1, hasShotgun: false };

  // input
  keys: Record<string, boolean> = {};
  moveX = 0;
  moveY = 0;
  lookDX = 0;
  fireHeld = false;
  locked = false;

  message = "";
  messageT = 0;
  lastMsgExit = 0;
  hudT = 0;
  last = 0;
  raf = 0;
  running = false;
  menuT = 0;
  sensitivity = 0.0023;

  constructor(canvas: HTMLCanvasElement, cb: Callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.cb = cb;
    this.loadLevel(0, true);
    this.resize(canvas.clientWidth || 640, canvas.clientHeight || 400);
  }

  // ───────────────────────── lifecycle ─────────────────────────

  attach() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: true });
    document.addEventListener("visibilitychange", this.onVis);
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  detach() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("visibilitychange", this.onVis);
    this.sound.stopAmbient();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  setState(s: GameState) {
    this.state = s;
    this.cb.onState(s);
  }

  start() {
    this.sound.init();
    this.sound.startAmbient();
    this.saved = { health: 100, bullets: 60, shells: 0, weapon: 0, hasShotgun: false };
    this.loadLevel(0, false);
    this.setState("playing");
    this.lockPointer();
  }

  restartLevel() {
    this.sound.init();
    this.sound.startAmbient();
    this.loadLevel(this.levelIndex, false);
    this.setState("playing");
    this.lockPointer();
  }

  nextLevel() {
    if (this.levelIndex + 1 >= LEVELS.length) {
      this.setState("victory");
      return;
    }
    this.saved = {
      health: Math.max(60, this.p.health),
      bullets: Math.max(30, this.p.bullets),
      shells: this.p.shells,
      weapon: this.p.weapon,
      hasShotgun: this.p.hasShotgun,
    };
    this.loadLevel(this.levelIndex + 1, false);
    this.setState("playing");
    this.lockPointer();
  }

  toMenu() {
    this.sound.stopAmbient();
    this.loadLevel(0, true);
    this.setState("menu");
    this.releaseHeld();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  pause() {
    if (this.state !== "playing") return;
    this.releaseHeld();
    this.setState("paused");
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  resume() {
    if (this.state !== "paused") return;
    this.sound.init();
    this.setState("playing");
    this.lockPointer();
  }

  lockPointer() {
    if (this.isTouch) return;
    try {
      const r = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === "function") r.catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  releaseHeld() {
    this.keys = {};
    this.fireHeld = false;
    this.moveX = 0;
    this.moveY = 0;
    this.lookDX = 0;
  }

  setMuted(m: boolean) {
    this.sound.setMuted(m);
  }

  // ───────────────────────── input ─────────────────────────

  onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) {
      if (this.state === "playing") e.preventDefault();
      return;
    }
    this.keys[e.code] = true;
    if (this.state === "playing") {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab"].includes(e.code)) e.preventDefault();
      if (e.code === "Digit1") this.selectWeapon(0);
      if (e.code === "Digit2") this.selectWeapon(1);
      if (e.code === "KeyQ") this.cycleWeapon();
      if (e.code === "KeyP") this.pause();
    } else if (this.state === "paused" && (e.code === "KeyP" || e.code === "Escape")) {
      this.resume();
    }
  };
  onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };
  onBlur = () => {
    this.releaseHeld();
    if (this.state === "playing") this.pause();
  };
  onVis = () => {
    if (document.hidden && this.state === "playing") this.pause();
  };
  onLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked && this.state === "playing" && !this.isTouch) this.pause();
  };
  onMouseMove = (e: MouseEvent) => {
    if (this.locked && this.state === "playing") this.lookDX += e.movementX;
  };
  onMouseDown = (e: MouseEvent) => {
    if (this.isTouch) return;
    if (this.state === "playing" && e.button === 0) {
      if (!this.locked) this.lockPointer();
      this.fireHeld = true;
    }
  };
  onMouseUp = () => {
    if (!this.isTouch) this.fireHeld = false;
  };
  onWheel = (e: WheelEvent) => {
    if (this.state === "playing" && Math.abs(e.deltaY) > 2) this.cycleWeapon();
  };

  selectWeapon(w: 0 | 1) {
    if (w === 1 && !this.p.hasShotgun) return;
    if (this.p.weapon !== w) {
      this.p.weapon = w;
      this.p.fireCd = Math.max(this.p.fireCd, 0.25);
      this.sound.play("switch");
    }
  }
  cycleWeapon() {
    this.selectWeapon(this.p.weapon === 0 ? 1 : 0);
  }
  /** touch helpers */
  setAnalog(x: number, y: number) {
    this.moveX = x;
    this.moveY = y;
  }
  addLook(dx: number) {
    this.lookDX += dx * (this.sensitivity / 0.0023) * 1.7;
  }
  setFire(f: boolean) {
    this.fireHeld = f;
  }

  // ───────────────────────── sizing ─────────────────────────

  setQuality(q: number) {
    this.quality = q;
    this.resize(this.canvas.clientWidth || 640, this.canvas.clientHeight || 400);
  }

  resize(cssW: number, cssH: number) {
    const aspect = Math.max(0.3, cssW / Math.max(1, cssH));
    const baseH = [144, 200, 288][this.quality] ?? 200;
    let W: number;
    let H: number;
    if (aspect >= 1) {
      H = baseH;
      W = Math.min(720, Math.round(H * aspect));
    } else {
      W = Math.round(baseH * 0.9);
      H = Math.round(W / aspect);
    }
    W = Math.max(120, W & ~1);
    H = Math.max(120, H & ~1);
    this.W = W;
    this.H = H;
    this.canvas.width = W;
    this.canvas.height = H;
    this.img = this.ctx.createImageData(W, H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.zbuf = new Float32Array(W);
    this.planeLen = 0.8;
    this.focal = W / (2 * this.planeLen);
    this.ctx.imageSmoothingEnabled = false;
  }

  // ───────────────────────── level ─────────────────────────

  loadLevel(i: number, menu: boolean) {
    this.levelIndex = i;
    const def = LEVELS[i];
    this.def = def;
    const rows = def.map;
    this.mh = rows.length;
    this.mw = Math.max(...rows.map((r) => r.length));
    const n = this.mw * this.mh;
    this.cells = new Uint8Array(n);
    this.floorKind = new Uint8Array(n);
    this.ceilLamp = new Uint8Array(n);
    this.seen = new Uint8Array(n);
    this.flow = new Int16Array(n);
    this.enemies = [];
    this.items = [];
    this.props = [];
    this.projs = [];
    this.parts = [];
    this.exitOpen = false;
    const lights: { x: number; y: number; I: number; R: number; fl: boolean }[] = [];

    for (let y = 0; y < this.mh; y++) {
      for (let x = 0; x < this.mw; x++) {
        const ch = rows[y][x] ?? "#";
        const idx = y * this.mw + x;
        const cx = x + 0.5;
        const cy = y + 0.5;
        const interior = x > 0 && y > 0 && x < this.mw - 1 && y < this.mh - 1;
        if (ch === "#") {
          const patch = interior && hash2(x >> 1, y >> 1, i + 3) > 0.74;
          this.cells[idx] = (patch ? def.secondary : def.primary) + 1;
        } else if (ch === "M") this.cells[idx] = 2;
        else if (ch === "C") this.cells[idx] = 3;
        else if (ch === "T") this.cells[idx] = 4;
        else {
          this.floorKind[idx] = hash2(x >> 2, y >> 2, i + 11) > 0.62 ? 1 : 0;
          if (ch === "P") {
            this.p.x = cx;
            this.p.y = cy;
          } else if (ch === "e" || ch === "H") {
            const heavy = ch === "H";
            this.enemies.push({
              kind: heavy ? "heavy" : "soldier",
              x: cx,
              y: cy,
              hp: heavy ? 150 : 45,
              dead: false,
              deadT: 0,
              alerted: false,
              painT: 0,
              atkT: 0,
              cd: 1 + Math.random(),
              anim: Math.random() * 3,
              moving: false,
              strafe: Math.random() < 0.5 ? -1 : 1,
              strafeT: Math.random() * 2,
            });
          } else if (ch === "h") this.items.push({ x: cx, y: cy, kind: "health", taken: false });
          else if (ch === "a") this.items.push({ x: cx, y: cy, kind: "ammo", taken: false });
          else if (ch === "s") this.items.push({ x: cx, y: cy, kind: "shells", taken: false });
          else if (ch === "S") this.items.push({ x: cx, y: cy, kind: "shotgun", taken: false });
          else if (ch === "B") this.props.push({ x: cx, y: cy, kind: "barrel", alive: true, hp: 25, fuse: -1 });
          else if (ch === "L") {
            this.props.push({ x: cx, y: cy, kind: "lamp", alive: true, hp: 1, fuse: -1 });
            lights.push({ x: cx, y: cy, I: 1.35, R: 7, fl: false });
          } else if (ch === "X") {
            this.exit = { x: cx, y: cy };
            this.floorKind[idx] = 2;
            lights.push({ x: cx, y: cy, I: 0.75, R: 4.2, fl: false });
          }
          // ceiling lamps
          if (x % 3 === 1 && y % 3 === 1 && hash2(x, y, i + 21) < def.lampDensity * 1.7) {
            this.ceilLamp[idx] = 1;
            lights.push({ x: cx, y: cy, I: 1.05, R: 5.6, fl: hash2(x, y, 99) < 0.28 });
          }
        }
      }
    }
    this.buildLightmap(lights);

    // restore / reset player stats
    const s = this.saved;
    const p = this.p;
    p.health = s.health;
    p.bullets = s.bullets;
    p.shells = s.shells;
    p.weapon = s.weapon;
    p.hasShotgun = s.hasShotgun;
    p.fireCd = 0;
    p.fireAnim = 0;
    p.flash = 0;
    p.hurt = 0;
    p.pick = 0;
    p.hit = 0;
    p.deathT = 0;
    p.shake = 0;
    p.kills = 0;
    p.time = 0;
    p.bobT = 0;
    p.bobAmp = 0;
    // face the longest open sightline
    let best = 0;
    let bestA = 0;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const d = this.castDist(p.x, p.y, Math.cos(a), Math.sin(a));
      if (d > best + 0.01) {
        best = d;
        bestA = a;
      }
    }
    p.a = bestA;
    this.message = menu ? "" : def.name;
    this.messageT = menu ? 0 : 3.5;
    if (!menu) this.queueMessage(def.name + " — " + def.briefing, 4);
    this.updateFlow();
    this.emitHud(true);
  }

  queueMessage(m: string, t = 2.2) {
    this.message = m;
    this.messageT = t;
  }

  isSolid(cx: number, cy: number) {
    if (cx < 0 || cy < 0 || cx >= this.mw || cy >= this.mh) return true;
    return this.cells[cy * this.mw + cx] !== 0;
  }

  clearLine(x0: number, y0: number, x1: number, y1: number) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    const n = Math.ceil(d / 0.12);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.isSolid(Math.floor(x0 + dx * t), Math.floor(y0 + dy * t))) return false;
    }
    return true;
  }

  buildLightmap(lights: { x: number; y: number; I: number; R: number; fl: boolean }[]) {
    this.lw = this.mw * LMR;
    this.lh = this.mh * LMR;
    this.lm = new Float32Array(this.lw * this.lh);
    this.lmf = new Float32Array(this.lw * this.lh);
    for (const l of lights) {
      const x0 = Math.max(0, Math.floor((l.x - l.R) * LMR));
      const x1 = Math.min(this.lw - 1, Math.ceil((l.x + l.R) * LMR));
      const y0 = Math.max(0, Math.floor((l.y - l.R) * LMR));
      const y1 = Math.min(this.lh - 1, Math.ceil((l.y + l.R) * LMR));
      const target = l.fl ? this.lmf : this.lm;
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const wx = (px + 0.5) / LMR;
          const wy = (py + 0.5) / LMR;
          const d = Math.hypot(wx - l.x, wy - l.y);
          if (d >= l.R) continue;
          if (this.isSolid(Math.floor(wx), Math.floor(wy))) continue;
          if (!this.clearLine(l.x, l.y, wx, wy)) continue;
          const f = 1 - d / l.R;
          target[py * this.lw + px] += l.I * f * f;
        }
      }
    }
  }

  // ───────────────────────── geometry helpers ─────────────────────────

  /** distance along unit direction to first wall */
  castDist(x: number, y: number, dx: number, dy: number): number {
    let mx = Math.floor(x);
    let my = Math.floor(y);
    const ddx = Math.abs(1 / (dx || 1e-9));
    const ddy = Math.abs(1 / (dy || 1e-9));
    let stepX: number;
    let stepY: number;
    let sdx: number;
    let sdy: number;
    if (dx < 0) {
      stepX = -1;
      sdx = (x - mx) * ddx;
    } else {
      stepX = 1;
      sdx = (mx + 1 - x) * ddx;
    }
    if (dy < 0) {
      stepY = -1;
      sdy = (y - my) * ddy;
    } else {
      stepY = 1;
      sdy = (my + 1 - y) * ddy;
    }
    for (let i = 0; i < 128; i++) {
      if (sdx < sdy) {
        sdx += ddx;
        mx += stepX;
        if (this.isSolid(mx, my)) return sdx - ddx;
      } else {
        sdy += ddy;
        my += stepY;
        if (this.isSolid(mx, my)) return sdy - ddy;
      }
    }
    return 64;
  }

  hasLOS(x0: number, y0: number, x1: number, y1: number) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return true;
    return this.castDist(x0, y0, dx / d, dy / d) >= d - 0.05;
  }

  canMove(x: number, y: number, r: number, ignoreProps = false) {
    if (
      this.isSolid(Math.floor(x - r), Math.floor(y - r)) ||
      this.isSolid(Math.floor(x + r), Math.floor(y - r)) ||
      this.isSolid(Math.floor(x - r), Math.floor(y + r)) ||
      this.isSolid(Math.floor(x + r), Math.floor(y + r))
    )
      return false;
    if (!ignoreProps) {
      for (const pr of this.props) {
        if (!pr.alive) continue;
        const dx = pr.x - x;
        const dy = pr.y - y;
        const rr = r + SOLID_PROP_R;
        if (dx * dx + dy * dy < rr * rr) return false;
      }
    }
    return true;
  }

  tryMove(o: { x: number; y: number }, dx: number, dy: number, r: number) {
    if (this.canMove(o.x + dx, o.y, r)) o.x += dx;
    if (this.canMove(o.x, o.y + dy, r)) o.y += dy;
  }

  updateFlow() {
    const { mw, mh, flow } = this;
    flow.fill(-1);
    const sx = Math.floor(this.p.x);
    const sy = Math.floor(this.p.y);
    const q: number[] = [sy * mw + sx];
    flow[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      const cx = c % mw;
      const cy = (c / mw) | 0;
      const d = flow[c] + 1;
      const nb = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ];
      for (const [nx, ny] of nb) {
        if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
        const ni = ny * mw + nx;
        if (this.cells[ni] !== 0 || flow[ni] !== -1) continue;
        flow[ni] = d;
        q.push(ni);
      }
    }
  }

  // ───────────────────────── effects ─────────────────────────

  sfx(kind: SfxKind, x?: number, y?: number) {
    if (x === undefined || y === undefined) {
      this.sound.play(kind, 0, 0);
      return;
    }
    const dx = x - this.p.x;
    const dy = y - this.p.y;
    const d = Math.hypot(dx, dy);
    const pan = Math.sin(Math.atan2(dy, dx) - this.p.a);
    this.sound.play(kind, d, d < 1 ? 0 : pan * 0.85);
  }

  burst(x: number, y: number, z: number, n: number, col: [number, number, number], spd: number, grav: number, size = 0.025, life = 0.8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * spd;
      this.parts.push({
        x,
        y,
        z,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        vz: (Math.random() - 0.3) * spd,
        life: life * (0.5 + Math.random() * 0.7),
        max: life,
        r: col[0] * (0.7 + Math.random() * 0.5),
        g: col[1] * (0.7 + Math.random() * 0.5),
        b: col[2] * (0.7 + Math.random() * 0.5),
        size: size * (0.6 + Math.random()),
        grav,
      });
    }
  }

  // ───────────────────────── combat ─────────────────────────

  hurtPlayer(dmg: number) {
    const p = this.p;
    if (this.state !== "playing") return;
    p.health -= dmg;
    p.hurt = Math.min(1, p.hurt + 0.5 + dmg / 40);
    p.shake = Math.max(p.shake, Math.min(1, dmg / 25));
    this.sfx("hurt");
    if (p.health <= 0) {
      p.health = 0;
      p.deathT = 0;
      this.releaseHeld();
      this.setState("dead");
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
      this.sound.stopAmbient();
    }
  }

  alertNear(x: number, y: number, r: number) {
    for (const e of this.enemies) {
      if (e.dead || e.alerted) continue;
      if (Math.hypot(e.x - x, e.y - y) < r) e.alerted = true;
    }
  }

  damageEnemy(e: Enemy, dmg: number) {
    if (e.dead) return;
    e.hp -= dmg;
    e.alerted = true;
    this.burst(e.x, e.y, 0.55, 8, [170, 10, 10], 1.6, 3.2, 0.03);
    if (e.hp <= 0) {
      e.dead = true;
      e.deadT = 0;
      this.p.kills++;
      this.sfx("enemyDie", e.x, e.y);
      this.burst(e.x, e.y, 0.5, 18, [150, 8, 8], 2.4, 3.5, 0.035, 1.1);
      // drops
      const r = Math.random();
      if (e.kind === "soldier" && r < 0.5) this.items.push({ x: e.x, y: e.y, kind: "ammo", taken: false });
      else if (e.kind === "heavy") this.items.push({ x: e.x, y: e.y, kind: r < 0.55 ? "shells" : "health", taken: false });
      this.checkExitOpen();
    } else {
      const chance = e.kind === "heavy" ? 0.3 : 0.75;
      if (Math.random() < chance) {
        e.painT = 0.28;
        e.atkT = 0;
        this.sfx("enemyPain", e.x, e.y);
      }
    }
  }

  checkExitOpen() {
    const total = this.enemies.length;
    if (!this.exitOpen && this.p.kills >= total) {
      this.exitOpen = true;
      this.floorKind[Math.floor(this.exit.y) * this.mw + Math.floor(this.exit.x)] = 3;
      this.queueMessage("ALL HOSTILES DOWN — REACH THE EXIT PAD!", 4);
      this.sfx("exit");
    }
  }

  explode(b: Prop) {
    if (!b.alive) return;
    b.alive = false;
    this.sfx("explosion", b.x, b.y);
    this.p.shake = Math.max(this.p.shake, Math.max(0, 1 - Math.hypot(b.x - this.p.x, b.y - this.p.y) / 9));
    this.burst(b.x, b.y, 0.4, 36, [255, 150, 30], 4, 1.5, 0.06, 0.9);
    this.burst(b.x, b.y, 0.4, 24, [255, 230, 120], 5, 2.5, 0.03, 0.6);
    this.burst(b.x, b.y, 0.5, 20, [40, 36, 34], 2.5, -0.5, 0.08, 1.4);
    const R = 3.4;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      if (d < R && this.hasLOS(b.x, b.y, e.x, e.y)) this.damageEnemy(e, 15 + 110 * (1 - d / R));
    }
    const pd = Math.hypot(this.p.x - b.x, this.p.y - b.y);
    if (pd < R && this.hasLOS(b.x, b.y, this.p.x, this.p.y)) this.hurtPlayer(8 + 55 * (1 - pd / R));
    for (const o of this.props) {
      if (o.kind === "barrel" && o.alive && o.fuse < 0 && Math.hypot(o.x - b.x, o.y - b.y) < R) o.fuse = 0.12 + Math.random() * 0.15;
    }
  }

  shoot() {
    const p = this.p;
    const sg = p.weapon === 1;
    if (sg ? p.shells <= 0 : p.bullets <= 0) {
      this.sfx("empty");
      p.fireCd = 0.3;
      if (!sg && p.hasShotgun && p.shells > 0) this.selectWeapon(1);
      else if (sg && p.bullets > 0) this.selectWeapon(0);
      return;
    }
    if (sg) p.shells--;
    else p.bullets--;
    p.fireCd = sg ? 0.95 : 0.3;
    p.fireAnim = 1;
    p.flash = sg ? 1 : 0.75;
    p.shake = Math.max(p.shake, sg ? 0.45 : 0.15);
    this.sfx(sg ? "shotgun" : "pistol");
    this.alertNear(p.x, p.y, 16);
    const pellets = sg ? 9 : 1;
    const spread = sg ? 0.075 : 0.006;
    for (let i = 0; i < pellets; i++) {
      const a = p.a + (Math.random() - 0.5) * 2 * spread;
      this.hitscan(a, sg ? 8 + Math.random() * 5 : 17 + Math.random() * 9);
    }
  }

  hitscan(a: number, dmg: number) {
    const p = this.p;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const wallD = this.castDist(p.x, p.y, dx, dy);
    let bestD = wallD;
    let bestE: Enemy | null = null;
    let bestB: Prop | null = null;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const vx = e.x - p.x;
      const vy = e.y - p.y;
      const along = vx * dx + vy * dy;
      if (along <= 0.1 || along >= bestD) continue;
      const perp = Math.abs(vx * dy - vy * dx);
      if (perp < (e.kind === "heavy" ? 0.36 : 0.27)) {
        bestD = along;
        bestE = e;
        bestB = null;
      }
    }
    for (const b of this.props) {
      if (b.kind !== "barrel" || !b.alive) continue;
      const vx = b.x - p.x;
      const vy = b.y - p.y;
      const along = vx * dx + vy * dy;
      if (along <= 0.1 || along >= bestD) continue;
      const perp = Math.abs(vx * dy - vy * dx);
      if (perp < 0.3) {
        bestD = along;
        bestB = b;
        bestE = null;
      }
    }
    const hx = p.x + dx * bestD;
    const hy = p.y + dy * bestD;
    if (bestE) {
      p.hit = 0.18;
      this.damageEnemy(bestE, dmg);
    } else if (bestB) {
      p.hit = 0.18;
      this.burst(hx, hy, 0.5, 6, [255, 200, 80], 2, 3, 0.02, 0.4);
      bestB.hp -= dmg;
      if (bestB.hp <= 0) this.explode(bestB);
    } else {
      this.burst(hx - dx * 0.05, hy - dy * 0.05, 0.5 + (Math.random() - 0.5) * 0.15, 5, [255, 210, 120], 1.6, 4, 0.02, 0.35);
      this.burst(hx - dx * 0.05, hy - dy * 0.05, 0.5, 3, [90, 90, 90], 0.8, -0.3, 0.04, 0.8);
    }
  }

  enemyAttack(e: Enemy, dist: number) {
    if (e.kind === "soldier") {
      e.atkT = 0.4;
      e.cd = 0.9 + Math.random() * 1.2;
      this.sfx("enemyShot", e.x, e.y);
      const chance = Math.max(0.12, Math.min(0.72, 0.8 - dist * 0.05));
      if (Math.random() < chance) this.hurtPlayer(5 + Math.random() * 7);
    } else {
      e.atkT = 0.55;
      e.cd = 1.8 + Math.random() * 1.2;
      this.sfx("plasma", e.x, e.y);
      const dx = this.p.x - e.x;
      const dy = this.p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = 5.2;
      this.projs.push({ x: e.x, y: e.y, vx: (dx / d) * sp, vy: (dy / d) * sp, life: 5 });
    }
  }

  // ───────────────────────── update ─────────────────────────

  frame(dt: number) {
    if (this.state === "menu") {
      this.menuT += dt;
      this.p.a += dt * 0.12;
      this.p.bobT += dt * 0.5;
      this.flick = 0.9 + Math.sin(this.menuT * 23) * 0.05;
    } else if (this.state === "playing") {
      this.update(dt);
    } else if (this.state === "dead") {
      this.p.deathT += dt;
      this.p.hurt = Math.max(0, this.p.hurt - dt * 0.3);
      this.updateParticles(dt);
      this.updateEnemiesAnim(dt);
    }
    this.render();
    this.hudT += dt;
    if (this.hudT > 0.1) {
      this.hudT = 0;
      this.emitHud(false);
    }
  }

  updateEnemiesAnim(dt: number) {
    for (const e of this.enemies) if (e.dead) e.deadT += dt;
  }

  update(dt: number) {
    const p = this.p;
    p.time += dt;
    this.flick = 0.82 + Math.sin(p.time * 31) * 0.1 + Math.sin(p.time * 13.7) * 0.08 + (Math.random() < 0.04 ? -0.5 : 0);
    if (this.messageT > 0) this.messageT -= dt;

    // turning
    const k = this.keys;
    let turn = 0;
    if (k.ArrowLeft) turn -= 1;
    if (k.ArrowRight) turn += 1;
    p.a += turn * 2.4 * dt + this.lookDX * this.sensitivity;
    this.lookDX = 0;
    p.a = ((p.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    // moving
    let fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + this.moveY;
    let str = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0) + this.moveX;
    const mag = Math.hypot(fwd, str);
    if (mag > 1) {
      fwd /= mag;
      str /= mag;
    }
    const sprint = k.ShiftLeft || k.ShiftRight || Math.hypot(this.moveX, this.moveY) > 0.92;
    const speed = sprint ? 4.8 : 3.3;
    const dx = Math.cos(p.a);
    const dy = Math.sin(p.a);
    const mvx = (dx * fwd - dy * str) * speed * dt;
    const mvy = (dy * fwd + dx * str) * speed * dt;
    this.tryMove(p, mvx, mvy, 0.22);
    const moving = Math.min(1, Math.hypot(fwd, str));
    if (moving > 0.05) {
      p.bobT += dt * (sprint ? 13 : 9.5) * moving;
      p.bobAmp += (1 - p.bobAmp) * Math.min(1, dt * 8);
      const phase = Math.floor(p.bobT / Math.PI);
      if (phase !== p.stepPhase) {
        p.stepPhase = phase;
        this.sfx("step");
      }
    } else {
      p.bobAmp -= p.bobAmp * Math.min(1, dt * 8);
    }

    // timers
    p.fireCd -= dt;
    p.fireAnim = Math.max(0, p.fireAnim - dt / (p.weapon === 1 ? 0.8 : 0.3));
    p.flash = Math.max(0, p.flash - dt * 7);
    p.hurt = Math.max(0, p.hurt - dt * 1.4);
    p.pick = Math.max(0, p.pick - dt * 2.5);
    p.hit = Math.max(0, p.hit - dt);
    p.shake = Math.max(0, p.shake - dt * 2.2);

    if ((this.fireHeld || k.Space || k.ControlLeft || k.KeyF) && p.fireCd <= 0) this.shoot();

    // flow field
    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = 0.25;
      this.updateFlow();
    }

    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.updatePickups();

    // barrel fuses
    for (const b of this.props) {
      if (b.alive && b.fuse >= 0) {
        b.fuse -= dt;
        if (b.fuse < 0) this.explode(b);
      }
    }

    // map reveal
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    for (let yy = cy - 4; yy <= cy + 4; yy++) {
      for (let xx = cx - 4; xx <= cx + 4; xx++) {
        if (xx < 0 || yy < 0 || xx >= this.mw || yy >= this.mh) continue;
        if (Math.hypot(xx - cx, yy - cy) <= 4.2) this.seen[yy * this.mw + xx] = 1;
      }
    }

    // exit
    if (Math.hypot(p.x - this.exit.x, p.y - this.exit.y) < 0.8) {
      if (this.exitOpen) {
        this.sfx("exit");
        this.sound.stopAmbient();
        this.releaseHeld();
        this.setState(this.levelIndex + 1 >= LEVELS.length ? "victory" : "levelDone");
        if (document.pointerLockElement === this.canvas) document.exitPointerLock();
      } else if (p.time - this.lastMsgExit > 2.5) {
        this.lastMsgExit = p.time;
        this.queueMessage(`EXIT LOCKED — ${this.enemies.length - p.kills} HOSTILE(S) REMAIN`, 2.2);
      }
    }
  }

  updateEnemies(dt: number) {
    const p = this.p;
    for (const e of this.enemies) {
      if (e.dead) {
        e.deadT += dt;
        continue;
      }
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy);
      e.moving = false;
      if (e.painT > 0) {
        e.painT -= dt;
        continue;
      }
      const los = dist < 22 && this.hasLOS(e.x, e.y, p.x, p.y);
      if (!e.alerted) {
        if (los && dist < 13) e.alerted = true;
        else continue;
      }
      e.cd -= dt;
      if (e.atkT > 0) e.atkT -= dt;
      const range = e.kind === "heavy" ? 14 : 11;
      if (los && dist < range && e.cd <= 0 && e.atkT <= 0 && this.state === "playing") {
        this.enemyAttack(e, dist);
      }
      if (e.atkT > 0) continue;
      const speed = e.kind === "heavy" ? 1.15 : 1.6;
      const keep = e.kind === "heavy" ? 5.5 : 3.6;
      let mx = 0;
      let my = 0;
      if (los) {
        if (dist > keep) {
          mx = dx / dist;
          my = dy / dist;
        } else if (dist > 1.4) {
          e.strafeT -= dt;
          if (e.strafeT <= 0) {
            e.strafeT = 1 + Math.random() * 1.5;
            e.strafe = -e.strafe;
          }
          mx = (-dy / dist) * e.strafe * 0.7;
          my = (dx / dist) * e.strafe * 0.7;
        }
      } else {
        // follow flow field
        const ex = Math.floor(e.x);
        const ey = Math.floor(e.y);
        const here = this.flow[ey * this.mw + ex];
        let bestV = here < 0 ? 9999 : here;
        let bx = -1;
        let by = -1;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            const nx = ex + ox;
            const ny = ey + oy;
            if (nx < 0 || ny < 0 || nx >= this.mw || ny >= this.mh) continue;
            if (ox && oy && (this.isSolid(ex + ox, ey) || this.isSolid(ex, ey + oy))) continue;
            const v = this.flow[ny * this.mw + nx];
            if (v >= 0 && v < bestV) {
              bestV = v;
              bx = nx;
              by = ny;
            }
          }
        }
        if (bx >= 0) {
          const tx = bx + 0.5 - e.x;
          const ty = by + 0.5 - e.y;
          const d = Math.hypot(tx, ty) || 1;
          mx = tx / d;
          my = ty / d;
        }
      }
      if (mx || my) {
        e.moving = true;
        e.anim += dt;
        this.tryMove(e, mx * speed * dt, my * speed * dt, 0.25);
        // don't walk through the player
        const nd = Math.hypot(p.x - e.x, p.y - e.y);
        if (nd < 0.7) {
          e.x -= (p.x - e.x) * 0.1;
          e.y -= (p.y - e.y) * 0.1;
        }
      }
    }
    // soft separation
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.dead) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.55 && d > 0.001) {
          const push = (0.55 - d) * 0.5;
          this.tryMove(a, (-dx / d) * push, (-dy / d) * push, 0.25);
          this.tryMove(b, (dx / d) * push, (dy / d) * push, 0.25);
        }
      }
    }
  }

  updateProjectiles(dt: number) {
    const p = this.p;
    for (const pr of this.projs) {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      if (this.isSolid(Math.floor(pr.x), Math.floor(pr.y))) {
        pr.life = 0;
        this.burst(pr.x - pr.vx * dt, pr.y - pr.vy * dt, 0.5, 10, [255, 120, 40], 2, 2, 0.03, 0.5);
        continue;
      }
      if (Math.hypot(pr.x - p.x, pr.y - p.y) < 0.4) {
        pr.life = 0;
        this.burst(pr.x, pr.y, 0.5, 14, [255, 140, 50], 2.5, 2, 0.03, 0.5);
        this.hurtPlayer(16 + Math.random() * 6);
      }
      // trail
      if (Math.random() < 0.6) this.burst(pr.x, pr.y, 0.5, 1, [255, 120, 30], 0.3, 0, 0.03, 0.35);
    }
    this.projs = this.projs.filter((q) => q.life > 0);
  }

  updateParticles(dt: number) {
    for (const q of this.parts) {
      q.life -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vz -= q.grav * dt;
      q.z += q.vz * dt;
      if (q.z < 0.02) {
        q.z = 0.02;
        q.vz *= -0.25;
        q.vx *= 0.6;
        q.vy *= 0.6;
      }
      if (q.z > 0.98) {
        q.z = 0.98;
        q.vz *= -0.2;
      }
      if (this.isSolid(Math.floor(q.x), Math.floor(q.y))) {
        q.vx *= -0.3;
        q.vy *= -0.3;
        q.x += q.vx * dt * 2;
        q.y += q.vy * dt * 2;
      }
    }
    this.parts = this.parts.filter((q) => q.life > 0);
    if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
  }

  updatePickups() {
    const p = this.p;
    for (const it of this.items) {
      if (it.taken) continue;
      if (Math.hypot(it.x - p.x, it.y - p.y) > 0.55) continue;
      let ok = false;
      switch (it.kind) {
        case "health":
          if (p.health < 100) {
            p.health = Math.min(100, p.health + 25);
            this.queueMessage("MEDKIT  +25 HEALTH");
            ok = true;
          }
          break;
        case "ammo":
          if (p.bullets < 150) {
            p.bullets = Math.min(150, p.bullets + 18);
            this.queueMessage("BULLETS  +18");
            ok = true;
          }
          break;
        case "shells":
          if (p.shells < 50) {
            p.shells = Math.min(50, p.shells + 8);
            this.queueMessage("SHELLS  +8");
            ok = true;
          }
          break;
        case "shotgun":
          p.hasShotgun = true;
          p.shells = Math.min(50, p.shells + 10);
          p.weapon = 1;
          this.queueMessage("PUMP SHOTGUN ACQUIRED  [2]", 3);
          ok = true;
          break;
        default:
          break;
      }
      if (ok) {
        it.taken = true;
        p.pick = 1;
        this.sfx("pickup");
      }
    }
  }

  emitHud(force: boolean) {
    const p = this.p;
    void force;
    this.cb.onHud({
      health: Math.ceil(p.health),
      bullets: p.bullets,
      shells: p.shells,
      weapon: p.weapon,
      hasShotgun: p.hasShotgun,
      kills: p.kills,
      total: this.enemies.length,
      level: this.levelIndex + 1,
      levelName: this.def.name,
      message: this.messageT > 0 ? this.message : "",
      exitOpen: this.exitOpen,
      time: p.time,
      hurt: p.hurt,
    });
  }

  // ───────────────────────── rendering ─────────────────────────

  lmAt(x: number, y: number): number {
    let ix = (x * LMR) | 0;
    let iy = (y * LMR) | 0;
    if (ix < 0) ix = 0;
    else if (ix >= this.lw) ix = this.lw - 1;
    if (iy < 0) iy = 0;
    else if (iy >= this.lh) iy = this.lh - 1;
    const i = iy * this.lw + ix;
    return this.lm[i] + this.lmf[i] * this.flick;
  }

  render() {
    const { W, H, buf, zbuf, p, mw, cells } = this;
    const flash = p.flash;
    const dirX = Math.cos(p.a);
    const dirY = Math.sin(p.a);
    const planeX = -dirY * this.planeLen;
    const planeY = dirX * this.planeLen;
    const px = p.x;
    const py = p.y;
    const focal = this.focal;
    const dead = this.state === "dead";
    const camH = dead ? Math.max(0.12, 0.5 - p.deathT * 0.6) : 0.5;
    const bobY = Math.sin(p.bobT * 2) * p.bobAmp * (H / 200) * 1.8;
    const hz = Math.round(H / 2 + bobY + (dead ? Math.min(p.deathT, 0.8) * 8 : 0));
    const AMB = this.def.ambient;
    const ambR = AMB * 0.8;
    const ambG = AMB * 0.92;
    const ambB = AMB * 1.18;
    const torchBase = 0.95 + flash * 1.7;
    const tR = torchBase;
    const tG = 0.92 * torchBase * (1 - flash * 0.08);
    const tB = torchBase * (0.84 - flash * 0.3);

    const floors = this.tex.floors;
    const ceils = this.tex.ceils;
    const walls = this.tex.walls;
    const lmW = this.lw;
    const lm = this.lm;
    const lmf = this.lmf;
    const flick = this.flick;

    // ── ceiling ──
    for (let y = 0; y < hz && y < H; y++) {
      const dy = hz - y;
      const rowDist = (focal * (1 - camH)) / dy;
      let fx = px + rowDist * (dirX - planeX);
      let fy = py + rowDist * (dirY - planeY);
      const sx = (rowDist * 2 * planeX) / W;
      const sy = (rowDist * 2 * planeY) / W;
      const att = 1 / (1 + 0.12 * rowDist * rowDist);
      const o0 = y * W;
      for (let x = 0; x < W; x++) {
        const cx = fx | 0;
        const cy = fy | 0;
        if (fx < 0 || fy < 0 || cx >= mw || cy >= this.mh) {
          buf[o0 + x] = 0xff0a0806;
        } else {
          const ci = cy * mw + cx;
          const t = ceils[this.ceilLamp[ci]];
          const ti = (((((fy - cy) * TS) | 0) & 63) * TS + ((((fx - cx) * TS) | 0) & 63)) * 4;
          const li = ((((fy * LMR) | 0) * lmW) + ((fx * LMR) | 0));
          const l = lm[li] + lmf[li] * flick;
          const mr = ((ambR + l + tR * att) * 256) | 0;
          const mg = ((ambG + l * 0.86 + tG * att) * 256) | 0;
          const mb = ((ambB + l * 0.62 + tB * att) * 256) | 0;
          const tr = t[ti];
          const tg = t[ti + 1];
          const tb = t[ti + 2];
          let r = (tr * mr) >> 8;
          let g = (tg * mg) >> 8;
          let b = (tb * mb) >> 8;
          const em = t[ti + 3];
          if (em) {
            const er = (tr * em) / 255;
            const eg = (tg * em) / 255;
            const eb = (tb * em) / 255;
            if (er > r) r = er;
            if (eg > g) g = eg;
            if (eb > b) b = eb;
          }
          buf[o0 + x] = 0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r);
        }
        fx += sx;
        fy += sy;
      }
    }

    // ── floor ──
    for (let y = Math.max(0, hz); y < H; y++) {
      const dy = y - hz;
      if (dy === 0) {
        buf.fill(0xff0a0806, y * W, y * W + W);
        continue;
      }
      const rowDist = (focal * camH) / dy;
      let fx = px + rowDist * (dirX - planeX);
      let fy = py + rowDist * (dirY - planeY);
      const sx = (rowDist * 2 * planeX) / W;
      const sy = (rowDist * 2 * planeY) / W;
      const att = 1 / (1 + 0.12 * rowDist * rowDist);
      const o0 = y * W;
      for (let x = 0; x < W; x++) {
        const cx = fx | 0;
        const cy = fy | 0;
        if (fx < 0 || fy < 0 || cx >= mw || cy >= this.mh) {
          buf[o0 + x] = 0xff0a0806;
        } else {
          const ci = cy * mw + cx;
          const t = floors[this.floorKind[ci]];
          const ti = (((((fy - cy) * TS) | 0) & 63) * TS + ((((fx - cx) * TS) | 0) & 63)) * 4;
          const li = ((((fy * LMR) | 0) * lmW) + ((fx * LMR) | 0));
          const l = lm[li] + lmf[li] * flick;
          const mr = ((ambR + l + tR * att) * 256) | 0;
          const mg = ((ambG + l * 0.86 + tG * att) * 256) | 0;
          const mb = ((ambB + l * 0.62 + tB * att) * 256) | 0;
          const tr = t[ti];
          const tg = t[ti + 1];
          const tb = t[ti + 2];
          let r = (tr * mr) >> 8;
          let g = (tg * mg) >> 8;
          let b = (tb * mb) >> 8;
          const em = t[ti + 3];
          if (em) {
            const pulse = 0.65 + 0.35 * Math.sin(p.time * 4);
            const er = (tr * em * pulse) / 255;
            const eg = (tg * em * pulse) / 255;
            const eb = (tb * em * pulse) / 255;
            if (er > r) r = er;
            if (eg > g) g = eg;
            if (eb > b) b = eb;
          }
          buf[o0 + x] = 0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r);
        }
        fx += sx;
        fy += sy;
      }
    }

    // ── walls ──
    for (let x = 0; x < W; x++) {
      const camX = (2 * x) / W - 1;
      const rdx = dirX + planeX * camX;
      const rdy = dirY + planeY * camX;
      let mx = px | 0;
      let my = py | 0;
      const ddx = Math.abs(1 / (rdx || 1e-9));
      const ddy = Math.abs(1 / (rdy || 1e-9));
      let stepX: number;
      let stepY: number;
      let sdx: number;
      let sdy: number;
      if (rdx < 0) {
        stepX = -1;
        sdx = (px - mx) * ddx;
      } else {
        stepX = 1;
        sdx = (mx + 1 - px) * ddx;
      }
      if (rdy < 0) {
        stepY = -1;
        sdy = (py - my) * ddy;
      } else {
        stepY = 1;
        sdy = (my + 1 - py) * ddy;
      }
      let side = 0;
      let hit = 0;
      for (let i = 0; i < 100; i++) {
        if (sdx < sdy) {
          sdx += ddx;
          mx += stepX;
          side = 0;
        } else {
          sdy += ddy;
          my += stepY;
          side = 1;
        }
        if (mx < 0 || my < 0 || mx >= mw || my >= this.mh) {
          hit = 0;
          break;
        }
        const c = cells[my * mw + mx];
        if (c) {
          hit = c;
          break;
        }
      }
      if (!hit) {
        zbuf[x] = 1e9;
        continue;
      }
      const perp = Math.max(0.05, side === 0 ? sdx - ddx : sdy - ddy);
      zbuf[x] = perp;
      const lineH = focal / perp;
      const top = hz - lineH * (1 - camH);
      let wallX = side === 0 ? py + perp * rdy : px + perp * rdx;
      wallX -= Math.floor(wallX);
      let texX = (wallX * TS) | 0;
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) texX = TS - 1 - texX;
      const tex: Tex = walls[hit - 1];
      // lighting at the hit point
      const hx = px + rdx * (perp - 0.04);
      const hy = py + rdy * (perp - 0.04);
      const l = this.lmAt(hx, hy);
      const att = 1 / (1 + 0.12 * perp * perp);
      const sideK = side === 1 ? 0.8 : 1;
      const mr = ((ambR + l + tR * att) * 256 * sideK) | 0;
      const mg = ((ambG + l * 0.86 + tG * att) * 256 * sideK) | 0;
      const mb = ((ambB + l * 0.62 + tB * att) * 256 * sideK) | 0;
      const y0 = Math.max(0, Math.ceil(top));
      const y1 = Math.min(H - 1, Math.floor(top + lineH));
      const stepT = TS / lineH;
      let texPos = (y0 - top) * stepT;
      const invH = 1 / lineH;
      for (let y = y0; y <= y1; y++) {
        const ty = texPos | 0;
        texPos += stepT;
        const ti = ((ty & 63) * TS + texX) * 4;
        const v = (y - top) * invH * 2 - 1;
        const v3 = v < 0 ? -v * v * v : v * v * v;
        const ao = (256 - 78 * (v3 > 0 ? v3 : -v3)) | 0;
        const tr = tex[ti];
        const tg = tex[ti + 1];
        const tb = tex[ti + 2];
        let r = (tr * mr * ao) >> 16;
        let g = (tg * mg * ao) >> 16;
        let b = (tb * mb * ao) >> 16;
        const em = tex[ti + 3];
        if (em) {
          const er = (tr * em) / 255;
          const eg = (tg * em) / 255;
          const eb = (tb * em) / 255;
          if (er > r) r = er;
          if (eg > g) g = eg;
          if (eb > b) b = eb;
        }
        buf[y * W + x] = 0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r);
      }
    }

    this.renderSprites(dirX, dirY, planeX, planeY, hz, camH, ambR, ambG, ambB, tR, tG, tB);
    this.renderParticles(dirX, dirY, planeX, planeY, hz, camH);

    // ── blit + overlays ──
    const ctx = this.ctx;
    ctx.putImageData(this.img, 0, 0);
    this.drawWeapon(hz);
    this.drawOverlays();
    // CSS shake
    if (p.shake > 0.01) {
      const s = p.shake * 6;
      this.canvas.style.transform = `translate(${((Math.random() - 0.5) * s).toFixed(1)}px,${((Math.random() - 0.5) * s).toFixed(1)}px) scale(1.02)`;
    } else if (this.canvas.style.transform) {
      this.canvas.style.transform = "";
    }
  }

  renderSprites(
    dirX: number,
    dirY: number,
    planeX: number,
    planeY: number,
    hz: number,
    camH: number,
    ambR: number,
    ambG: number,
    ambB: number,
    tR: number,
    tG: number,
    tB: number
  ) {
    const { W, H, buf, zbuf, p, focal } = this;
    const list = this.drawList;
    list.length = 0;
    const push = (x: number, y: number, tex: SprTex, scale: number, lift: number, full: boolean) => {
      const dx = x - p.x;
      const dy = y - p.y;
      list.push({ x, y, tex, scale, lift, full, dist: dx * dx + dy * dy });
    };
    for (const e of this.enemies) {
      let pose: Pose = "stand";
      if (e.dead) pose = e.deadT < 0.28 ? "dead0" : "dead1";
      else if (e.painT > 0) pose = "pain";
      else if (e.atkT > 0) pose = "shoot";
      else if (e.moving) pose = Math.floor(e.anim * 4) % 2 === 0 ? "walk1" : "walk2";
      push(e.x, e.y, this.spr.enemies[e.kind][pose], e.kind === "heavy" ? 0.95 : 0.82, 0, false);
    }
    for (const it of this.items) {
      if (!it.taken) push(it.x, it.y, this.spr.items[it.kind], it.kind === "shotgun" ? 0.5 : 0.42, 0, false);
    }
    for (const pr of this.props) {
      if (!pr.alive) continue;
      if (pr.kind === "barrel") push(pr.x, pr.y, this.spr.items.barrel, 0.6, 0, false);
      else push(pr.x, pr.y, this.spr.items.lamp, 0.85, 0, true);
    }
    for (const q of this.projs) push(q.x, q.y, this.spr.items.plasma, 0.28, 0.35, true);
    list.sort((a, b) => b.dist - a.dist);

    const invDet = 1 / (planeX * dirY - dirX * planeY);
    for (const s of list) {
      const sx = s.x - p.x;
      const sy = s.y - p.y;
      const tX = invDet * (dirY * sx - dirX * sy);
      const tY = invDet * (-planeY * sx + planeX * sy);
      if (tY < 0.15) continue;
      const screenX = (W / 2) * (1 + tX / tY);
      const unit = focal / tY;
      const sh = unit * s.scale;
      const bottom = hz + unit * camH - s.lift * unit;
      const top = bottom - sh;
      const left = screenX - sh / 2;
      const x0 = Math.max(0, Math.floor(left));
      const x1 = Math.min(W - 1, Math.floor(left + sh));
      if (x1 < x0) continue;
      const y0 = Math.max(0, Math.floor(top));
      const y1 = Math.min(H - 1, Math.floor(bottom));
      // lighting
      let mr: number;
      let mg: number;
      let mb: number;
      if (s.full) {
        mr = mg = mb = 300;
      } else {
        const l = this.lmAt(s.x, s.y);
        const att = 1 / (1 + 0.12 * tY * tY);
        mr = ((ambR + l + tR * att) * 256) | 0;
        mg = ((ambG + l * 0.86 + tG * att) * 256) | 0;
        mb = ((ambB + l * 0.62 + tB * att) * 256) | 0;
      }
      const tex = s.tex;
      const invSh = SS / sh;
      for (let x = x0; x <= x1; x++) {
        if (tY >= zbuf[x]) continue;
        const u = (((x - left) * invSh) | 0) & 63;
        for (let y = y0; y <= y1; y++) {
          const v = ((y - top) * invSh) | 0;
          if (v < 0 || v > 63) continue;
          const ti = (v * SS + u) * 4;
          if (tex[ti + 3] === 0) continue;
          let r = (tex[ti] * mr) >> 8;
          let g = (tex[ti + 1] * mg) >> 8;
          let b = (tex[ti + 2] * mb) >> 8;
          if (r > 255) r = 255;
          if (g > 255) g = 255;
          if (b > 255) b = 255;
          buf[y * W + x] = 0xff000000 | (b << 16) | (g << 8) | r;
        }
      }
    }
  }

  renderParticles(dirX: number, dirY: number, planeX: number, planeY: number, hz: number, camH: number) {
    const { W, H, buf, zbuf, p, focal } = this;
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    for (const q of this.parts) {
      const sx = q.x - p.x;
      const sy = q.y - p.y;
      const tX = invDet * (dirY * sx - dirX * sy);
      const tY = invDet * (-planeY * sx + planeX * sy);
      if (tY < 0.15) continue;
      const screenX = Math.round((W / 2) * (1 + tX / tY));
      const screenY = Math.round(hz + ((camH - q.z) * focal) / tY);
      const size = Math.max(1, Math.round((q.size * focal) / tY));
      if (screenX < 0 || screenX >= W) continue;
      if (tY >= zbuf[screenX]) continue;
      const f = Math.min(1, (q.life / q.max) * 1.6);
      const r = Math.min(255, q.r * f);
      const g = Math.min(255, q.g * f);
      const b = Math.min(255, q.b * f);
      const col = 0xff000000 | (b << 16) | (g << 8) | r;
      for (let yy = 0; yy < size; yy++) {
        const y = screenY + yy;
        if (y < 0 || y >= H) continue;
        for (let xx = 0; xx < size; xx++) {
          const x = screenX + xx;
          if (x < 0 || x >= W || tY >= zbuf[x]) continue;
          buf[y * W + x] = col;
        }
      }
    }
  }

  drawWeapon(hz: number) {
    const { ctx, W, H, p } = this;
    if (this.state === "menu" || this.state === "dead") return;
    const s = Math.max(1, H / 200);
    const R = Math.round;
    const bobX = Math.sin(p.bobT) * p.bobAmp * 6 * s;
    const bobY = Math.abs(Math.cos(p.bobT)) * p.bobAmp * 5 * s + (hz - H / 2) * 0.5;
    const cx = R(W / 2 + bobX + (W > H ? 24 * s : 8 * s));
    const sg = p.weapon === 1;
    const anim = p.fireAnim;
    const kick = sg ? Math.sin(Math.min(1, anim * 1.6) * Math.PI) * 22 * s * (anim > 0.4 ? 1 : 0.3) : anim * 14 * s;
    const baseY = R(H + bobY + kick + 6 * s);
    const lit = 0.55 + p.flash * 0.6;
    const shade = (v: number) => {
      const c = Math.min(255, R(v * lit));
      return `rgb(${c},${c},${R(c * 0.95)})`;
    };
    const rect = (col: string, x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = col;
      ctx.fillRect(R(x), R(y), R(w), R(h));
    };
    const steel = (x: number, y: number, w: number, h: number, base: number) => {
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, shade(base * 1.5));
      g.addColorStop(0.3, shade(base * 1.1));
      g.addColorStop(1, shade(base * 0.45));
      ctx.fillStyle = g;
      ctx.fillRect(R(x), R(y), R(w), R(h));
    };

    if (!sg) {
      // sleeve + hand
      rect(shade(60), cx - 34 * s, baseY - 30 * s, 62 * s, 60 * s);
      rect(shade(78), cx - 34 * s, baseY - 30 * s, 12 * s, 60 * s);
      steel(cx - 24 * s, baseY - 54 * s, 38 * s, 34 * s, 70);
      rect(shade(120), cx - 22 * s, baseY - 50 * s, 6 * s, 24 * s);
      // grip
      steel(cx - 12 * s, baseY - 62 * s, 22 * s, 30 * s, 40);
      // slide
      steel(cx - 10 * s, baseY - 104 * s, 20 * s, 54 * s, 85);
      rect(shade(210), cx - 10 * s, baseY - 104 * s, 4 * s, 54 * s);
      rect(shade(25), cx - 2 * s, baseY - 100 * s, 4 * s, 40 * s);
      // barrel tip + sight
      rect(shade(20), cx - 4 * s, baseY - 108 * s, 8 * s, 6 * s);
      rect(shade(230), cx - 1 * s, baseY - 112 * s, 2 * s, 5 * s);
      // fingers
      rect(shade(150), cx - 24 * s, baseY - 46 * s, 14 * s, 8 * s);
      rect(shade(130), cx - 24 * s, baseY - 36 * s, 14 * s, 8 * s);
      if (anim > 0.55) this.muzzle(cx, baseY - 112 * s, 30 * s * anim);
    } else {
      const pump = anim > 0.1 && anim < 0.65 ? Math.sin(((0.65 - anim) / 0.55) * Math.PI) * 26 * s : 0;
      // forearm
      rect(shade(60), cx - 40 * s, baseY - 10 * s, 76 * s, 50 * s);
      rect(shade(78), cx - 40 * s, baseY - 10 * s, 14 * s, 50 * s);
      // barrels
      steel(cx - 13 * s, baseY - 128 * s, 13 * s, 100 * s, 70);
      steel(cx, baseY - 128 * s, 13 * s, 100 * s, 60);
      rect(shade(18), cx - 13 * s, baseY - 130 * s, 26 * s, 4 * s);
      rect(shade(230), cx - 1 * s, baseY - 134 * s, 2 * s, 5 * s);
      // magazine tube
      steel(cx - 8 * s, baseY - 96 * s, 16 * s, 70 * s, 50);
      // wooden pump
      const wood = ctx.createLinearGradient(cx - 18 * s, 0, cx + 18 * s, 0);
      wood.addColorStop(0, shade(150));
      wood.addColorStop(0.5, shade(105));
      wood.addColorStop(1, shade(55));
      ctx.fillStyle = wood;
      ctx.fillRect(R(cx - 18 * s), R(baseY - 74 * s + pump), R(36 * s), R(26 * s));
      for (let i = 0; i < 4; i++) rect(shade(40), cx - 18 * s, baseY - 70 * s + pump + i * 6 * s, 36 * s, 1.5 * s);
      // hand on pump
      rect(shade(120), cx - 22 * s, baseY - 54 * s + pump, 12 * s, 14 * s);
      // receiver
      steel(cx - 16 * s, baseY - 46 * s, 32 * s, 40 * s, 60);
      rect(shade(24), cx - 6 * s, baseY - 40 * s, 12 * s, 3 * s);
      if (anim > 0.6) this.muzzle(cx, baseY - 136 * s, 44 * s * anim);
    }
  }

  muzzle(x: number, y: number, r: number) {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,230,140,0.95)");
    g.addColorStop(0.6, "rgba(255,130,30,0.55)");
    g.addColorStop(1, "rgba(255,60,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(Math.round(x - r), Math.round(y - r), Math.round(r * 2), Math.round(r * 2));
  }

  drawOverlays() {
    const { ctx, W, H, p } = this;
    const s = Math.max(1, H / 200);
    // muzzle flash room tint
    if (p.flash > 0.3) {
      ctx.globalAlpha = (p.flash - 0.3) * 0.12;
      ctx.fillStyle = "#ffb050";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    // pickup flash
    if (p.pick > 0) {
      ctx.globalAlpha = p.pick * 0.18;
      ctx.fillStyle = "#6dff9a";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    // damage vignette
    if (p.hurt > 0.01 || this.state === "dead") {
      const a = this.state === "dead" ? Math.min(0.75, 0.3 + p.deathT * 0.25) : Math.min(0.6, p.hurt * 0.6);
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, "rgba(160,0,0,0)");
      g.addColorStop(1, `rgba(150,0,0,${a * 1.4})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = a * 0.35;
      ctx.fillStyle = "#a00";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (this.state === "menu") return;
    // crosshair
    const hy = Math.round(H / 2);
    const hx = Math.round(W / 2);
    ctx.fillStyle = p.hit > 0 ? "#ff3030" : "rgba(210,255,220,0.85)";
    const c = Math.max(1, Math.round(s));
    const gap = p.hit > 0 ? 4 * c : 3 * c;
    ctx.fillRect(hx - gap - 3 * c, hy, 3 * c, c);
    ctx.fillRect(hx + gap, hy, 3 * c, c);
    ctx.fillRect(hx, hy - gap - 3 * c, c, 3 * c);
    ctx.fillRect(hx, hy + gap, c, 3 * c);

    // minimap
    const ms = Math.max(2, Math.round(2.4 * s));
    const ox = W - this.mw * ms - 6;
    const oy = 6;
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = "#000";
    ctx.fillRect(ox - 2, oy - 2, this.mw * ms + 4, this.mh * ms + 4);
    ctx.globalAlpha = 0.9;
    for (let y = 0; y < this.mh; y++) {
      for (let x = 0; x < this.mw; x++) {
        const i = y * this.mw + x;
        if (!this.seen[i]) continue;
        ctx.fillStyle = this.cells[i] ? "#6e7b86" : "#1d2a22";
        ctx.fillRect(ox + x * ms, oy + y * ms, ms, ms);
      }
    }
    const ex = Math.floor(this.exit.x);
    const ey = Math.floor(this.exit.y);
    if (this.seen[ey * this.mw + ex]) {
      ctx.fillStyle = this.exitOpen ? "#4dff88" : "#ff4a3a";
      ctx.fillRect(ox + ex * ms, oy + ey * ms, ms, ms);
    }
    ctx.globalAlpha = 1;
    const pxm = ox + p.x * ms;
    const pym = oy + p.y * ms;
    ctx.fillStyle = "#ffe14a";
    ctx.fillRect(Math.round(pxm - 1), Math.round(pym - 1), 3, 3);
    ctx.strokeStyle = "#ffe14a";
    ctx.beginPath();
    ctx.moveTo(pxm, pym);
    ctx.lineTo(pxm + Math.cos(p.a) * ms * 2.4, pym + Math.sin(p.a) * ms * 2.4);
    ctx.stroke();
  }
}
