import { useRef, useState } from "react";
import type { Game } from "../game/engine";

const STICK_R = 54;

interface Props {
  game: Game;
  hasShotgun: boolean;
  weapon: 0 | 1;
}

export default function TouchControls({ game, hasShotgun, weapon }: Props) {
  const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const stickId = useRef<number | null>(null);
  const lookId = useRef<number | null>(null);
  const lastX = useRef(0);
  const [firing, setFiring] = useState(false);

  const stickDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stickId.current !== null) return;
    stickId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setStick({ ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
  };
  const stickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== stickId.current || !stick) return;
    let dx = e.clientX - stick.ox;
    let dy = e.clientY - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      dx = (dx / d) * STICK_R;
      dy = (dy / d) * STICK_R;
    }
    setStick({ ...stick, x: stick.ox + dx, y: stick.oy + dy });
    const dead = 0.12;
    let nx = dx / STICK_R;
    let ny = -dy / STICK_R;
    if (Math.hypot(nx, ny) < dead) {
      nx = 0;
      ny = 0;
    }
    game.setAnalog(nx, ny);
  };
  const stickUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== stickId.current) return;
    stickId.current = null;
    setStick(null);
    game.setAnalog(0, 0);
  };

  const lookDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookId.current !== null) return;
    lookId.current = e.pointerId;
    lastX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const lookMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== lookId.current) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    game.addLook(dx);
  };
  const lookUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== lookId.current) return;
    lookId.current = null;
  };

  const fireDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setFiring(true);
    game.setFire(true);
  };
  const fireUp = () => {
    setFiring(false);
    game.setFire(false);
  };

  return (
    <div className="absolute inset-0 z-20 select-none" style={{ touchAction: "none", WebkitUserSelect: "none" }}>
      {/* look zone (right) */}
      <div
        className="absolute right-0 top-0 h-full w-1/2"
        style={{ touchAction: "none" }}
        onPointerDown={lookDown}
        onPointerMove={lookMove}
        onPointerUp={lookUp}
        onPointerCancel={lookUp}
      />
      {/* stick zone (left-bottom) */}
      <div
        className="absolute bottom-0 left-0 h-[62%] w-1/2"
        style={{ touchAction: "none" }}
        onPointerDown={stickDown}
        onPointerMove={stickMove}
        onPointerUp={stickUp}
        onPointerCancel={stickUp}
      >
        {!stick && (
          <div
            className="pointer-events-none absolute rounded-full border-2 border-emerald-300/30 bg-emerald-300/5"
            style={{ left: 28, bottom: 28, width: 108, height: 108 }}
          >
            <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-300/40 bg-emerald-300/10" />
          </div>
        )}
      </div>
      {stick && (
        <>
          <div
            className="pointer-events-none fixed rounded-full border-2 border-emerald-300/50 bg-emerald-300/10"
            style={{ left: stick.ox - STICK_R - 8, top: stick.oy - STICK_R - 8, width: (STICK_R + 8) * 2, height: (STICK_R + 8) * 2 }}
          />
          <div
            className="pointer-events-none fixed rounded-full border-2 border-emerald-200/80 bg-emerald-300/40"
            style={{ left: stick.x - 24, top: stick.y - 24, width: 48, height: 48 }}
          />
        </>
      )}

      {/* buttons */}
      <button
        aria-label="Fire"
        onPointerDown={fireDown}
        onPointerUp={fireUp}
        onPointerCancel={fireUp}
        onContextMenu={(e) => e.preventDefault()}
        className={`absolute flex h-[88px] w-[88px] items-center justify-center rounded-full border-4 font-bold tracking-wider transition-transform ${
          firing ? "scale-90 border-red-300 bg-red-500/70" : "border-red-400/70 bg-red-600/40"
        }`}
        style={{ right: "max(22px, env(safe-area-inset-right))", bottom: "max(26px, env(safe-area-inset-bottom))", touchAction: "none", fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: "#ffe" }}
      >
        FIRE
      </button>
      <button
        aria-label="Switch weapon"
        onPointerDown={(e) => {
          e.preventDefault();
          game.cycleWeapon();
        }}
        className={`absolute flex h-[58px] w-[58px] items-center justify-center rounded-full border-2 ${
          hasShotgun ? "border-amber-300/70 bg-amber-500/30" : "border-white/20 bg-white/5 opacity-50"
        }`}
        style={{ right: "max(34px, env(safe-area-inset-right))", bottom: "calc(max(26px, env(safe-area-inset-bottom)) + 104px)", touchAction: "none", fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: "#ffe" }}
      >
        {weapon === 0 ? "PST" : "SHG"}
      </button>
      <button
        aria-label="Pause"
        onPointerDown={(e) => {
          e.preventDefault();
          game.pause();
        }}
        className="absolute left-1/2 top-2 -translate-x-1/2 rounded border border-white/30 bg-black/40 px-3 py-2"
        style={{ touchAction: "none", fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: "#cfe" }}
      >
        II
      </button>
    </div>
  );
}
