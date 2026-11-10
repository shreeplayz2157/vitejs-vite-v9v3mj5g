import { useCallback, useEffect, useRef, useState } from "react";
import { Game, type GameState, type Hud } from "./game/engine";
import { LEVELS } from "./game/levels";
import TouchControls from "./components/TouchControls";

const EMPTY_HUD: Hud = {
  health: 100,
  bullets: 60,
  shells: 0,
  weapon: 0,
  hasShotgun: false,
  kills: 0,
  total: 0,
  level: 1,
  levelName: "",
  message: "",
  exitOpen: false,
  time: 0,
  hurt: 0,
};

const QUALITY_LABELS = ["CHUNKY", "RETRO", "CRISP"];

function detectTouch() {
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function App() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [gstate, setGstate] = useState<GameState>("menu");
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [quality, setQuality] = useState(1);
  const [muted, setMuted] = useState(false);
  const [crt, setCrt] = useState(true);
  const [touch, setTouch] = useState(detectTouch);
  const [ready, setReady] = useState(false);
  const [canFs, setCanFs] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const game = new Game(canvas, { onHud: setHud, onState: setGstate });
    game.isTouch = detectTouch();
    gameRef.current = game;
    game.attach();
    const fit = () => game.resize(wrap.clientWidth, wrap.clientHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    window.addEventListener("orientationchange", fit);
    setCanFs(!!document.documentElement.requestFullscreen);
    setReady(true);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", fit);
      game.detach();
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (gameRef.current) gameRef.current.isTouch = touch;
  }, [touch, ready]);

  const g = () => gameRef.current!;

  const changeQuality = useCallback((q: number) => {
    setQuality(q);
    gameRef.current?.setQuality(q);
  }, []);

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    gameRef.current?.setMuted(m);
  };

  const fullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => undefined);
  };

  const playing = gstate === "playing";
  const showHud = gstate !== "menu" && gstate !== "victory";
  const healthPct = Math.max(0, Math.min(100, hud.health));
  const healthColor = healthPct > 60 ? "#4dff88" : healthPct > 30 ? "#ffd23a" : "#ff4a3a";

  const settings = (
    <div className="flex flex-wrap items-center justify-center gap-2 text-[9px] sm:text-[10px]">
      <button className="retro-btn !px-3 !py-2 !text-[9px]" onClick={() => changeQuality((quality + 1) % 3)}>
        GFX: {QUALITY_LABELS[quality]}
      </button>
      <button className="retro-btn !px-3 !py-2 !text-[9px]" onClick={toggleMute}>
        SOUND: {muted ? "OFF" : "ON"}
      </button>
      <button className="retro-btn !px-3 !py-2 !text-[9px]" onClick={() => setCrt(!crt)}>
        CRT: {crt ? "ON" : "OFF"}
      </button>
      <button className="retro-btn !px-3 !py-2 !text-[9px]" onClick={() => setTouch(!touch)}>
        TOUCH UI: {touch ? "ON" : "OFF"}
      </button>
      {canFs && (
        <button className="retro-btn !px-3 !py-2 !text-[9px]" onClick={fullscreen}>
          FULLSCREEN
        </button>
      )}
    </div>
  );

  return (
    <div ref={wrapRef} className="font-retro fixed inset-0 overflow-hidden bg-black text-white">
      <canvas
        ref={canvasRef}
        className="game-canvas absolute inset-0 block h-full w-full"
        onContextMenu={(e) => e.preventDefault()}
      />
      {crt && <div className="crt-overlay pointer-events-none absolute inset-0 z-10" />}

      {/* ───────── HUD ───────── */}
      {showHud && (
        <>
          <div
            className="hud-panel pointer-events-none absolute z-10 w-[170px] px-2 py-2 text-[8px] leading-[1.9] sm:w-[220px] sm:px-3 sm:py-3 sm:text-[10px]"
            style={{ left: "max(8px, env(safe-area-inset-left))", top: "max(8px, env(safe-area-inset-top))" }}
          >
            <div className="flex items-center justify-between">
              <span>HEALTH</span>
              <span style={{ color: healthColor }}>{hud.health}</span>
            </div>
            <div className="mb-1 h-[7px] w-full border border-emerald-300/50 bg-black/60">
              <div className="h-full" style={{ width: `${healthPct}%`, background: healthColor, boxShadow: `0 0 8px ${healthColor}` }} />
            </div>
            <div className={`flex justify-between ${hud.weapon === 0 ? "text-amber-300" : "opacity-60"}`}>
              <span>{hud.weapon === 0 ? "▶" : " "} PISTOL</span>
              <span>{hud.bullets}</span>
            </div>
            {hud.hasShotgun && (
              <div className={`flex justify-between ${hud.weapon === 1 ? "text-amber-300" : "opacity-60"}`}>
                <span>{hud.weapon === 1 ? "▶" : " "} SHOTGUN</span>
                <span>{hud.shells}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>HOSTILES</span>
              <span>
                {hud.kills}/{hud.total}
              </span>
            </div>
            <div className="flex justify-between opacity-70">
              <span>SECTOR {hud.level}</span>
              <span>{fmtTime(hud.time)}</span>
            </div>
            {hud.exitOpen && <div className="animate-pulse text-center text-emerald-200">EXIT OPEN</div>}
          </div>

          {hud.message && playing && (
            <div className="pointer-events-none absolute left-1/2 top-[18%] z-10 w-[92%] max-w-xl -translate-x-1/2 text-center">
              <div
                key={hud.message}
                className="msg-pop inline-block bg-black/60 px-3 py-2 text-[9px] leading-relaxed text-amber-200 sm:text-[11px]"
                style={{ textShadow: "0 0 8px rgba(255,170,40,0.8)" }}
              >
                {hud.message}
              </div>
            </div>
          )}
        </>
      )}

      {/* ───────── touch controls ───────── */}
      {playing && touch && ready && gameRef.current && <TouchControls game={gameRef.current} hasShotgun={hud.hasShotgun} weapon={hud.weapon} />}

      {/* ───────── MENU ───────── */}
      {gstate === "menu" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-gradient-to-b from-black/70 via-black/35 to-black/80 p-4">
          <div className="overlay-in my-auto flex w-full max-w-2xl flex-col items-center gap-4 text-center sm:gap-6">
            <div>
              <div className="mb-2 text-[9px] tracking-[0.35em] text-red-400 sm:text-xs">— 1993 STYLE · 2026 ENGINE —</div>
              <h1 className="title-glow text-3xl leading-tight sm:text-6xl">
                IRON
                <br />
                BUNKER 3D
              </h1>
              <p className="mt-3 text-[9px] leading-relaxed text-emerald-200/90 sm:text-[11px]">
                A real-time raycast shooter with dynamic lighting,
                <br className="hidden sm:block" /> procedural textures &amp; explosive barrels.
              </p>
            </div>

            <button className="retro-btn primary !px-8 !py-4 !text-sm" onClick={() => g().start()} disabled={!ready}>
              ▶ START MISSION
            </button>

            <div className="hud-panel w-full max-w-lg p-3 text-left text-[8px] leading-[2] sm:p-4 sm:text-[10px]">
              {touch ? (
                <>
                  <div className="text-amber-300">TOUCH CONTROLS</div>
                  <div>LEFT THUMB &nbsp;· move (push far = sprint)</div>
                  <div>RIGHT DRAG &nbsp;· look around</div>
                  <div>FIRE BUTTON · shoot / hold to auto-fire</div>
                  <div>PST/SHG &nbsp;&nbsp;&nbsp;· swap weapon</div>
                </>
              ) : (
                <>
                  <div className="text-amber-300">KEYBOARD + MOUSE</div>
                  <div>W A S D &nbsp;&nbsp;· move &nbsp; ◄ ► turn</div>
                  <div>MOUSE &nbsp;&nbsp;&nbsp;&nbsp;· look / click to fire</div>
                  <div>SHIFT &nbsp;&nbsp;&nbsp;&nbsp;· sprint &nbsp; SPACE fire</div>
                  <div>1 / 2 / Q &nbsp;· weapons &nbsp; P / ESC pause</div>
                </>
              )}
              <div className="mt-1 text-emerald-200/80">Kill every hostile, then step on the green exit pad. Shoot the red barrels!</div>
            </div>
            {settings}
          </div>
        </div>
      )}

      {/* ───────── PAUSED ───────── */}
      {gstate === "paused" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
          <div className="overlay-in flex flex-col items-center gap-4 text-center">
            <h2 className="title-glow text-2xl sm:text-4xl">PAUSED</h2>
            <button className="retro-btn primary" onClick={() => g().resume()}>
              ▶ RESUME
            </button>
            <button className="retro-btn" onClick={() => g().restartLevel()}>
              ↻ RESTART SECTOR
            </button>
            <button className="retro-btn" onClick={() => g().toMenu()}>
              ⌂ MAIN MENU
            </button>
            {settings}
          </div>
        </div>
      )}

      {/* ───────── DEAD ───────── */}
      {gstate === "dead" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-red-950/55 p-4">
          <div className="overlay-in flex flex-col items-center gap-5 text-center">
            <h2 className="text-3xl text-red-500 sm:text-6xl" style={{ textShadow: "0 0 18px #f00, 4px 4px 0 #000" }}>
              YOU DIED
            </h2>
            <div className="text-[9px] text-red-200 sm:text-[11px]">
              Hostiles eliminated: {hud.kills}/{hud.total}
            </div>
            <button className="retro-btn primary" onClick={() => g().restartLevel()}>
              ↻ TRY AGAIN
            </button>
            <button className="retro-btn" onClick={() => g().toMenu()}>
              ⌂ MAIN MENU
            </button>
          </div>
        </div>
      )}

      {/* ───────── LEVEL DONE ───────── */}
      {gstate === "levelDone" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
          <div className="overlay-in flex flex-col items-center gap-5 text-center">
            <h2 className="title-glow text-xl sm:text-4xl">SECTOR CLEARED</h2>
            <div className="hud-panel p-4 text-left text-[9px] leading-[2.2] sm:text-[11px]">
              <div>{LEVELS[hud.level - 1]?.name}</div>
              <div>
                HOSTILES &nbsp;{hud.kills}/{hud.total}
              </div>
              <div>TIME &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{fmtTime(hud.time)}</div>
              <div>HEALTH &nbsp;&nbsp;&nbsp;{hud.health}%</div>
            </div>
            <button className="retro-btn primary" onClick={() => g().nextLevel()}>
              ▶ NEXT SECTOR
            </button>
          </div>
        </div>
      )}

      {/* ───────── VICTORY ───────── */}
      {gstate === "victory" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-gradient-to-b from-black/80 to-emerald-950/80 p-4">
          <div className="overlay-in flex flex-col items-center gap-5 text-center">
            <h2 className="title-glow text-2xl leading-tight sm:text-5xl">
              BUNKER
              <br />
              DESTROYED
            </h2>
            <p className="max-w-md text-[9px] leading-relaxed text-emerald-200 sm:text-[11px]">
              The reactor is offline and the bunker is silent. You made it out alive, soldier. Final time {fmtTime(hud.time)} in the last sector.
            </p>
            <button className="retro-btn primary" onClick={() => g().start()}>
              ↻ PLAY AGAIN
            </button>
            <button className="retro-btn" onClick={() => g().toMenu()}>
              ⌂ MAIN MENU
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
