#!/usr/bin/env python3
"""
IRON BUNKER 3D  -  Python / pygame edition
==========================================
A compact retro raycaster in pure Python (pygame only, no numpy).
It is a desktop port of the browser game in /src - same level, same idea:
kill every hostile, then step on the green exit pad.

    pip install pygame
    python python/retro_raycaster.py

Controls
    W A S D / arrows ... move / turn      mouse ......... look
    SPACE / left click . fire             SHIFT ......... sprint
    R .................. restart          ESC ........... quit

Works on Windows, macOS, Linux (and in the browser via `pygbag`).
"""
import math
import random
import sys

import pygame

W, H = 320, 200            # internal "retro" resolution (scaled up by pygame)
FOV_PLANE = 0.8            # camera plane length  (~78 degree FOV)
SHADES = 24                # pre-computed brightness levels for distance fog
MAX_DIST = 14.0

LEVEL = [
    "########################",
    "#P.....#.......#.......#",
    "#......#...e...#...h...#",
    "#..L...#.......#.......#",
    "#......................#",
    "####.#######.#####.#####",
    "#......#.......#.......#",
    "#..e...#...B...#...e...#",
    "#......#...e...#...L...#",
    "#..a...................#",
    "#......#.......#.......#",
    "####.#####.#####.#######",
    "#......#.......#.......#",
    "#..B...C...e...C...a...#",
    "#......................#",
    "#..h...#...L...#...e..X#",
    "#......#.......#.......#",
    "########################",
]


# --------------------------------------------------------------------------
# procedural textures
# --------------------------------------------------------------------------
def make_brick():
    s = pygame.Surface((64, 64))
    rnd = random.Random(7)
    for y in range(64):
        row = y // 8
        off = (row % 2) * 8
        for x in range(64):
            bx, by = (x + off) % 16, y % 8
            if bx == 0 or by == 0:
                v = 90 + rnd.randint(-12, 12)
                s.set_at((x, y), (v, v - 3, v - 8))
                continue
            seed = ((x + off) // 16) + row * 4
            k = random.Random(seed).random()
            r, g, b = 130 + k * 55, 52 + k * 22, 38 + k * 16
            if by == 1 or bx == 1:
                r, g, b = r * 1.2, g * 1.2, b * 1.2
            if by == 7 or bx == 15:
                r, g, b = r * 0.7, g * 0.7, b * 0.7
            n = 0.82 + rnd.random() * 0.3
            s.set_at((x, y), (min(255, int(r * n)), min(255, int(g * n)), min(255, int(b * n))))
    return s


def make_metal():
    s = pygame.Surface((64, 64))
    rnd = random.Random(3)
    for y in range(64):
        base_row = rnd.randint(-8, 8)
        for x in range(64):
            v = 100 + base_row + rnd.randint(-6, 6)
            r, g, b = v * 0.86, v * 0.93, v * 1.06
            px, py = x % 32, y % 32
            if px == 0 or py == 0:
                r, g, b = r * 0.35, g * 0.35, b * 0.4
            for cx, cy in ((4, 4), (27, 4), (4, 27), (27, 27)):
                if math.hypot(px - cx, py - cy) < 2:
                    r, g, b = r * 1.5, g * 1.5, b * 1.5
            if 54 <= y < 61:  # hazard stripe
                r, g, b = ((225, 180, 20) if ((x + y) >> 3) & 1 else (28, 28, 26))
            s.set_at((x, y), (min(255, int(r)), min(255, int(g)), min(255, int(b))))
    return s


def shade_levels(tex):
    """Pre-multiply a texture by SHADES brightness steps (fast fog, no per-pixel work)."""
    out = []
    for i in range(SHADES):
        k = i / (SHADES - 1)
        t = tex.copy()
        t.fill((int(255 * k), int(255 * k * 0.96), int(255 * k * 0.9)), special_flags=pygame.BLEND_MULT)
        out.append(t)
    return out


def make_sprite(kind):
    s = pygame.Surface((64, 64), pygame.SRCALPHA)
    if kind == "enemy":
        pygame.draw.rect(s, (40, 40, 30), (22, 42, 8, 18))
        pygame.draw.rect(s, (40, 40, 30), (34, 42, 8, 18))
        pygame.draw.rect(s, (15, 15, 15), (20, 55, 11, 6))
        pygame.draw.rect(s, (15, 15, 15), (33, 55, 11, 6))
        pygame.draw.rect(s, (79, 108, 60), (22, 20, 20, 24))
        pygame.draw.rect(s, (120, 153, 90), (24, 22, 16, 9))
        pygame.draw.rect(s, (44, 64, 35), (22, 38, 20, 3))
        pygame.draw.rect(s, (208, 164, 42), (30, 38, 4, 3))
        pygame.draw.rect(s, (79, 108, 60), (14, 23, 6, 16))
        pygame.draw.rect(s, (79, 108, 60), (44, 23, 6, 12))
        pygame.draw.rect(s, (27, 27, 29), (44, 30, 7, 14))
        pygame.draw.circle(s, (200, 143, 108), (32, 13), 7)
        pygame.draw.circle(s, (79, 108, 60), (32, 11), 9)
        pygame.draw.rect(s, (12, 19, 25), (26, 13, 12, 4))
    elif kind == "health":
        pygame.draw.rect(s, (220, 222, 224), (18, 42, 28, 18))
        pygame.draw.rect(s, (196, 18, 28), (29, 46, 6, 12))
        pygame.draw.rect(s, (196, 18, 28), (26, 49, 12, 6))
    elif kind == "ammo":
        pygame.draw.rect(s, (74, 91, 44), (16, 44, 32, 16))
        for i in range(5):
            pygame.draw.rect(s, (224, 176, 48), (19 + i * 6, 46, 3, 8))
    elif kind == "barrel":
        pygame.draw.rect(s, (190, 60, 44), (20, 22, 24, 38))
        pygame.draw.rect(s, (230, 90, 70), (22, 22, 6, 38))
        pygame.draw.rect(s, (42, 18, 16), (20, 30, 24, 2))
        pygame.draw.rect(s, (42, 18, 16), (20, 48, 24, 2))
        pygame.draw.rect(s, (230, 192, 32), (26, 34, 12, 11))
    elif kind == "lamp":
        pygame.draw.rect(s, (90, 94, 102), (31, 14, 3, 44))
        pygame.draw.rect(s, (44, 46, 51), (26, 57, 12, 4))
        pygame.draw.circle(s, (255, 240, 170), (32, 10), 8)
        pygame.draw.circle(s, (255, 255, 255), (32, 10), 4)
    return s


# --------------------------------------------------------------------------
# game
# --------------------------------------------------------------------------
class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("IRON BUNKER 3D - Python edition")
        flags = pygame.SCALED | pygame.RESIZABLE
        self.screen = pygame.display.set_mode((W, H), flags)
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont("couriernew,monospace", 12, bold=True)
        self.big = pygame.font.SysFont("couriernew,monospace", 26, bold=True)
        self.walls = {"#": shade_levels(make_brick()), "C": shade_levels(make_metal())}
        self.sprites = {k: make_sprite(k) for k in ("enemy", "health", "ammo", "barrel", "lamp")}
        self.floor_cols = [(int(60 * k), int(58 * k), int(56 * k)) for k in self.ramp(H // 2)]
        self.ceil_cols = [(int(34 * k), int(36 * k), int(40 * k)) for k in self.ramp(H // 2)]
        pygame.event.set_grab(True)
        pygame.mouse.set_visible(False)
        self.reset()

    @staticmethod
    def ramp(n):
        # 0 at the horizon, 1 at the screen edge
        return [min(1.6, 0.15 + 1.6 * (i / max(1, n - 1)) ** 1.3) for i in range(n)]

    def reset(self):
        self.grid = []
        self.enemies, self.items, self.props = [], [], []
        self.exit = (0, 0)
        for y, row in enumerate(LEVEL):
            line = []
            for x, ch in enumerate(row):
                c = (x + 0.5, y + 0.5)
                line.append(ch if ch in "#C" else ".")
                if ch == "P":
                    self.px, self.py = c
                elif ch == "e":
                    self.enemies.append({"x": c[0], "y": c[1], "hp": 45, "alive": True, "cd": 1.0, "awake": False, "pain": 0.0})
                elif ch in "ha":
                    self.items.append({"x": c[0], "y": c[1], "kind": "health" if ch == "h" else "ammo", "taken": False})
                elif ch == "B":
                    self.props.append({"x": c[0], "y": c[1], "kind": "barrel", "hp": 25, "alive": True})
                elif ch == "L":
                    self.props.append({"x": c[0], "y": c[1], "kind": "lamp", "hp": 1, "alive": True})
                elif ch == "X":
                    self.exit = c
            self.grid.append(line)
        self.ang = 0.7
        self.hp, self.ammo = 100, 60
        self.fire_cd = 0.0
        self.recoil = 0.0
        self.hurt = 0.0
        self.bob = 0.0
        self.state = "play"
        self.kills = 0
        self.msg, self.msg_t = "KILL ALL HOSTILES, THEN REACH THE EXIT", 4.0

    # ------------------------------------------------------------- helpers
    def solid(self, x, y):
        xi, yi = int(x), int(y)
        if yi < 0 or yi >= len(self.grid) or xi < 0 or xi >= len(self.grid[0]):
            return True
        return self.grid[yi][xi] != "."

    def blocked(self, x, y, r=0.22):
        for dx in (-r, r):
            for dy in (-r, r):
                if self.solid(x + dx, y + dy):
                    return True
        for p in self.props:
            if p["alive"] and math.hypot(p["x"] - x, p["y"] - y) < r + 0.3:
                return True
        return False

    def cast(self, x, y, dx, dy):
        """DDA: returns (distance, side, map_x, map_y, wall_x)."""
        mx, my = int(x), int(y)
        ddx = abs(1 / dx) if dx else 1e9
        ddy = abs(1 / dy) if dy else 1e9
        sx, sdx = (-1, (x - mx) * ddx) if dx < 0 else (1, (mx + 1 - x) * ddx)
        sy, sdy = (-1, (y - my) * ddy) if dy < 0 else (1, (my + 1 - y) * ddy)
        side = 0
        for _ in range(64):
            if sdx < sdy:
                sdx += ddx
                mx += sx
                side = 0
            else:
                sdy += ddy
                my += sy
                side = 1
            if self.solid(mx, my):
                break
        d = (sdx - ddx) if side == 0 else (sdy - ddy)
        d = max(d, 0.01)
        wx = (y + d * dy) if side == 0 else (x + d * dx)
        return d, side, mx, my, wx - math.floor(wx)

    def los(self, ax, ay, bx, by):
        d = math.hypot(bx - ax, by - ay)
        return d < 0.01 or self.cast(ax, ay, (bx - ax) / d, (by - ay) / d)[0] >= d - 0.05

    # -------------------------------------------------------------- update
    def shoot(self):
        if self.ammo <= 0:
            self.fire_cd = 0.3
            return
        self.ammo -= 1
        self.fire_cd = 0.3
        self.recoil = 1.0
        dx, dy = math.cos(self.ang), math.sin(self.ang)
        wall = self.cast(self.px, self.py, dx, dy)[0]
        best, target = wall, None
        for e in self.enemies:
            e["awake"] = e["awake"] or math.hypot(e["x"] - self.px, e["y"] - self.py) < 14
            if not e["alive"]:
                continue
            vx, vy = e["x"] - self.px, e["y"] - self.py
            along = vx * dx + vy * dy
            if 0.1 < along < best and abs(vx * dy - vy * dx) < 0.28:
                best, target = along, e
        for p in self.props:
            if p["kind"] == "barrel" and p["alive"]:
                vx, vy = p["x"] - self.px, p["y"] - self.py
                along = vx * dx + vy * dy
                if 0.1 < along < best and abs(vx * dy - vy * dx) < 0.3:
                    best, target = along, p
        if target is not None:
            dmg = random.randint(17, 26)
            target["hp"] -= dmg
            if "kind" in target:
                if target["hp"] <= 0:
                    self.explode(target)
            else:
                target["awake"] = True
                target["pain"] = 0.25
                if target["hp"] <= 0:
                    target["alive"] = False
                    self.kills += 1

    def explode(self, b):
        b["alive"] = False
        self.hurt = max(self.hurt, 0.3)
        for e in self.enemies:
            d = math.hypot(e["x"] - b["x"], e["y"] - b["y"])
            if e["alive"] and d < 3.4:
                e["hp"] -= 110 * (1 - d / 3.4) + 15
                if e["hp"] <= 0:
                    e["alive"] = False
                    self.kills += 1
        d = math.hypot(self.px - b["x"], self.py - b["y"])
        if d < 3.4:
            self.damage(8 + 55 * (1 - d / 3.4))
        for o in self.props:
            if o is not b and o["kind"] == "barrel" and o["alive"] and math.hypot(o["x"] - b["x"], o["y"] - b["y"]) < 3.4:
                self.explode(o)

    def damage(self, n):
        self.hp -= n
        self.hurt = 1.0
        if self.hp <= 0:
            self.hp = 0
            self.state = "dead"

    def update(self, dt):
        keys = pygame.key.get_pressed()
        mdx, _ = pygame.mouse.get_rel()
        self.ang += mdx * 0.0025 + ((keys[pygame.K_RIGHT]) - (keys[pygame.K_LEFT])) * 2.4 * dt
        fwd = (keys[pygame.K_w] or keys[pygame.K_UP]) - (keys[pygame.K_s] or keys[pygame.K_DOWN])
        strafe = keys[pygame.K_d] - keys[pygame.K_a]
        speed = (4.8 if keys[pygame.K_LSHIFT] else 3.3) * dt
        n = math.hypot(fwd, strafe) or 1
        mx = (math.cos(self.ang) * fwd - math.sin(self.ang) * strafe) / n * speed
        my = (math.sin(self.ang) * fwd + math.cos(self.ang) * strafe) / n * speed
        if not self.blocked(self.px + mx, self.py):
            self.px += mx
        if not self.blocked(self.px, self.py + my):
            self.py += my
        if fwd or strafe:
            self.bob += dt * 10
        self.fire_cd -= dt
        self.recoil = max(0.0, self.recoil - dt * 4)
        self.hurt = max(0.0, self.hurt - dt * 1.5)
        self.msg_t -= dt
        if (keys[pygame.K_SPACE] or pygame.mouse.get_pressed()[0]) and self.fire_cd <= 0:
            self.shoot()

        for e in self.enemies:
            if not e["alive"]:
                continue
            dx, dy = self.px - e["x"], self.py - e["y"]
            d = math.hypot(dx, dy)
            seen = d < 20 and self.los(e["x"], e["y"], self.px, self.py)
            if not e["awake"]:
                e["awake"] = seen and d < 12
                continue
            e["pain"] = max(0.0, e["pain"] - dt)
            e["cd"] -= dt
            if seen and d < 11 and e["cd"] <= 0:
                e["cd"] = random.uniform(0.9, 2.0)
                if random.random() < max(0.12, min(0.7, 0.8 - d * 0.05)):
                    self.damage(random.uniform(5, 12))
            if e["pain"] <= 0 and d > 3.2:
                sx, sy = dx / d * 1.6 * dt, dy / d * 1.6 * dt
                if not self.blocked(e["x"] + sx, e["y"], 0.25):
                    e["x"] += sx
                if not self.blocked(e["x"], e["y"] + sy, 0.25):
                    e["y"] += sy

        for it in self.items:
            if not it["taken"] and math.hypot(it["x"] - self.px, it["y"] - self.py) < 0.55:
                if it["kind"] == "health" and self.hp < 100:
                    self.hp = min(100, self.hp + 25)
                    it["taken"] = True
                elif it["kind"] == "ammo":
                    self.ammo = min(150, self.ammo + 18)
                    it["taken"] = True

        if math.hypot(self.px - self.exit[0], self.py - self.exit[1]) < 0.8:
            left = sum(e["alive"] for e in self.enemies)
            if left == 0:
                self.state = "won"
            elif self.msg_t < 0:
                self.msg, self.msg_t = f"EXIT LOCKED - {left} HOSTILE(S) LEFT", 2.0

    # -------------------------------------------------------------- render
    def render(self):
        scr = self.screen
        hz = H // 2 + int(math.sin(self.bob * 2) * 1.5)
        # floor / ceiling gradients
        for i in range(H // 2):
            pygame.draw.line(scr, self.ceil_cols[H // 2 - 1 - i], (0, i), (W, i))
            pygame.draw.line(scr, self.floor_cols[i], (0, H // 2 + i), (W, H // 2 + i))

        dx, dy = math.cos(self.ang), math.sin(self.ang)
        plx, ply = -dy * FOV_PLANE, dx * FOV_PLANE
        focal = W / (2 * FOV_PLANE)
        zbuf = [1e9] * W
        for x in range(W):
            cam = 2 * x / W - 1
            rdx, rdy = dx + plx * cam, dy + ply * cam
            norm = math.hypot(rdx, rdy)
            dist, side, mx, my, wx = self.cast(self.px, self.py, rdx / norm, rdy / norm)
            perp = dist * (dx * rdx / norm + dy * rdy / norm)  # fisheye fix
            perp = max(perp, 0.05)
            zbuf[x] = perp
            line_h = int(focal / perp)
            tx = int(wx * 64)
            if (side == 0 and rdx > 0) or (side == 1 and rdy < 0):
                tx = 63 - tx
            light = max(0.05, 1.0 / (1.0 + 0.13 * perp * perp)) * (0.78 if side else 1.0)
            tex = self.walls[self.grid[my][mx] if 0 <= my < len(self.grid) and 0 <= mx < len(self.grid[0]) else "#"]
            surf = tex[min(SHADES - 1, int(light * (SHADES - 1)))]
            if line_h > 4 * H:  # clip absurdly tall strips
                line_h = 4 * H
            strip = pygame.transform.scale(surf.subsurface((tx, 0, 1, 64)), (1, max(1, line_h)))
            scr.blit(strip, (x, hz - line_h // 2))

        self.render_sprites(dx, dy, plx, ply, hz, focal, zbuf)
        self.render_weapon()
        self.render_hud()

    def render_sprites(self, dx, dy, plx, ply, hz, focal, zbuf):
        draw = []
        for e in self.enemies:
            draw.append((e["x"], e["y"], "enemy" if e["alive"] else None, 0.82, e["pain"] > 0))
        for it in self.items:
            if not it["taken"]:
                draw.append((it["x"], it["y"], it["kind"], 0.42, False))
        for p in self.props:
            if p["alive"]:
                draw.append((p["x"], p["y"], p["kind"], 0.6 if p["kind"] == "barrel" else 0.85, False))
        draw.sort(key=lambda s: -((s[0] - self.px) ** 2 + (s[1] - self.py) ** 2))
        inv = 1.0 / (plx * dy - dx * ply)
        for sx, sy, kind, scale, pain in draw:
            if kind is None:  # corpse: flat red smear
                kind = "corpse"
            rx, ry = sx - self.px, sy - self.py
            tx = inv * (dy * rx - dx * ry)
            ty = inv * (-ply * rx + plx * ry)
            if ty < 0.2:
                continue
            screen_x = int((W / 2) * (1 + tx / ty))
            size = int(focal / ty * scale)
            if size < 2 or size > 3 * H:
                continue
            top = hz + int(focal / ty * 0.5) - size
            light = max(0.12, 1.0 / (1.0 + 0.13 * ty * ty))
            if kind == "corpse":
                pygame.draw.ellipse(self.screen, (120, 10, 10), (screen_x - size // 2, top + size - size // 8, size, size // 6))
                continue
            img = pygame.transform.scale(self.sprites[kind], (size, size))
            if kind != "lamp":
                k = int(255 * min(1.0, light + 0.15))
                img.fill((k, k, k, 255), special_flags=pygame.BLEND_RGBA_MULT)
            if pain:
                img.fill((120, 0, 0, 0), special_flags=pygame.BLEND_RGB_ADD)
            left = screen_x - size // 2
            for i in range(size):
                cx = left + i
                if 0 <= cx < W and ty < zbuf[cx]:
                    self.screen.blit(img, (cx, top), (i, 0, 1, size))

    def render_weapon(self):
        s = self.screen
        bx = W // 2 + 22 + int(math.sin(self.bob) * 4)
        by = H + int(abs(math.cos(self.bob)) * 3) + int(self.recoil * 10)
        pygame.draw.rect(s, (60, 70, 50), (bx - 30, by - 28, 56, 40))
        pygame.draw.rect(s, (40, 40, 44), (bx - 12, by - 56, 22, 30))
        pygame.draw.rect(s, (84, 88, 96), (bx - 10, by - 100, 20, 48))
        pygame.draw.rect(s, (190, 196, 205), (bx - 10, by - 100, 4, 48))
        pygame.draw.rect(s, (20, 20, 22), (bx - 2, by - 96, 4, 36))
        if self.recoil > 0.55:
            r = int(26 * self.recoil)
            pygame.draw.circle(s, (255, 150, 40), (bx, by - 104), r)
            pygame.draw.circle(s, (255, 240, 170), (bx, by - 104), r // 2)

    def render_hud(self):
        s = self.screen
        if self.hurt > 0.01:
            ov = pygame.Surface((W, H), pygame.SRCALPHA)
            ov.fill((170, 0, 0, int(110 * self.hurt)))
            s.blit(ov, (0, 0))
        pygame.draw.line(s, (220, 255, 230), (W // 2 - 6, H // 2), (W // 2 - 2, H // 2))
        pygame.draw.line(s, (220, 255, 230), (W // 2 + 2, H // 2), (W // 2 + 6, H // 2))
        left = sum(e["alive"] for e in self.enemies)
        txt = f"HP {int(self.hp):3d}   AMMO {self.ammo:3d}   HOSTILES {left}"
        s.blit(self.font.render(txt, False, (0, 0, 0)), (7, 7))
        s.blit(self.font.render(txt, False, (140, 255, 180)), (6, 6))
        if self.msg_t > 0:
            m = self.font.render(self.msg, False, (255, 215, 130))
            s.blit(m, (W // 2 - m.get_width() // 2, 24))
        if self.state != "play":
            ov = pygame.Surface((W, H), pygame.SRCALPHA)
            ov.fill((0, 0, 0, 150))
            s.blit(ov, (0, 0))
            title, col = ("YOU DIED", (255, 60, 50)) if self.state == "dead" else ("SECTOR CLEARED", (110, 255, 150))
            t = self.big.render(title, False, col)
            s.blit(t, (W // 2 - t.get_width() // 2, H // 2 - 28))
            t2 = self.font.render("press R to play again - ESC to quit", False, (255, 220, 150))
            s.blit(t2, (W // 2 - t2.get_width() // 2, H // 2 + 8))

    # ---------------------------------------------------------------- loop
    def run(self, max_frames=None):
        frames = 0
        while True:
            dt = min(0.05, self.clock.tick(60) / 1000)
            for ev in pygame.event.get():
                if ev.type == pygame.QUIT or (ev.type == pygame.KEYDOWN and ev.key == pygame.K_ESCAPE):
                    return
                if ev.type == pygame.KEYDOWN and ev.key == pygame.K_r:
                    self.reset()
            if self.state == "play":
                self.update(dt)
            self.render()
            pygame.display.flip()
            frames += 1
            if max_frames and frames >= max_frames:
                return


if __name__ == "__main__":
    Game().run(max_frames=int(sys.argv[1]) if len(sys.argv) > 1 else None)
    pygame.quit()
