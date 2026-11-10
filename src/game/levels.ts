/*
 Legend
   #  primary wall      M metal wall    C concrete wall    T tech wall
   .  floor             P player start  X  exit pad
   e  soldier           H heavy trooper
   h  medkit            a bullets       s  shells        S shotgun
   B  explosive barrel  L standing lamp
*/

export interface LevelDef {
  name: string;
  briefing: string;
  map: string[];
  primary: number; // texture index for '#'
  secondary: number; // patch texture
  ambient: number;
  lampDensity: number; // 0..1 chance for ceiling lamps
}

export const LEVELS: LevelDef[] = [
  {
    name: "SECTOR 1 — WAREHOUSE",
    briefing: "Clear the hostiles, then reach the exit pad.",
    primary: 0,
    secondary: 1,
    ambient: 0.1,
    lampDensity: 0.5,
    map: [
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
      "#..B...C...e...C...S...#",
      "#......................#",
      "#..h...#...L...#...e..X#",
      "#......#.......#.......#",
      "########################",
    ],
  },
  {
    name: "SECTOR 2 — BUNKER",
    briefing: "Heavy troopers ahead. Watch for plasma. Use the barrels.",
    primary: 2,
    secondary: 3,
    ambient: 0.08,
    lampDensity: 0.35,
    map: [
      "########################",
      "#P.....#.......#...h...#",
      "#......#...e...#.......#",
      "#..L.......B.......e...#",
      "#......#.......#...L...#",
      "####.#####.#####.#######",
      "#......#.......#.......#",
      "#..e...#...H...#...a...#",
      "#......#.......#...e...#",
      "#..B.......L.......B...#",
      "#......#.......#.......#",
      "####.#####.###########.#",
      "#......#.......#.......#",
      "#..a...#...e...#...e...#",
      "#..s........H........h.#",
      "#..e...#...L...#.......#",
      "#......#.......#......X#",
      "########################",
    ],
  },
  {
    name: "SECTOR 3 — REACTOR CORE",
    briefing: "Final sector. Purge the reactor and escape.",
    primary: 1,
    secondary: 3,
    ambient: 0.07,
    lampDensity: 0.28,
    map: [
      "########################",
      "#P.....#.......#.......#",
      "#......#...H...#...e...#",
      "#..s...#.......#...h...#",
      "#..........L...........#",
      "####.####.....#####.####",
      "#......#.......#.......#",
      "#..B...#...e...#...H...#",
      "#..a.......B.......a...#",
      "#......#...e...#.......#",
      "#......#.......#.......#",
      "####.####.....#####.####",
      "#......................#",
      "#..e.TT....L.....TT.e..#",
      "#....TT...........TT...#",
      "#..h.......H.......s...#",
      "#..e.TT....L.....TT....#",
      "#....TT.........TT....X#",
      "########################",
    ],
  },
];
