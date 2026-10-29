// Maze game state. Pure logic: no timers, DOM or Bluetooth here.
//
// Each round lights a freshly generated maze: red walls are lava, the dark holds are its corridors.
// Start on the green holds and climb through the corridors to the blue finish before time runs out
// (it turns yellow, then flashes). Hands stay in the corridors: no reaching over a wall. Honor system.
// Every maze finished scores a point and the next one starts where you are, so mazes alternate
// bottom-to-top and top-to-bottom. Time per maze scales with its path, and shrinks in steps to level 5.
// Co-op: no timer. A partner taps Made it! when the climber reaches the finish.

import { DEFAULT_BOARD, STEP } from './layout.js';
import { rampValue, levelUp } from './ramp.js';

export const MAZE_DEFAULTS = {
  corridor: 2, // holds wide
  loops: 0.1, // share of leftover walls knocked out, so there's more than one way through
  secondsPerHold: 2, // time allowed per hold along the shortest path, at the start
  minSecondsPerHold: 1.2, // ...and at level 5
  speedUpEvery: 1, // mazes between speed-ups (0 = never)
  coop: false, // a partner says when the climber made it, instead of a timer
};

export const MAZE_DIFFICULTIES = {
  beginner: {
    label: 'Beginner',
    settings: { corridor: 2, loops: 0.25, secondsPerHold: 2.5, minSecondsPerHold: 1.6, speedUpEvery: 1 },
  },
  intermediate: {
    label: 'Intermediate',
    settings: { corridor: 2, loops: 0.1, secondsPerHold: 2, minSecondsPerHold: 1.2, speedUpEvery: 1 },
  },
  hard: { label: 'Hard', settings: { corridor: 1, loops: 0.1, secondsPerHold: 1.6, minSecondsPerHold: 1, speedUpEvery: 1 } },
  impossible: {
    label: 'Impossible',
    settings: { corridor: 1, loops: 0, secondsPerHold: 1.2, minSecondsPerHold: 0.8, speedUpEvery: 1 },
  },
};

export const WALL_COLOR = [255, 0, 0];
export const START_COLOR = [0, 255, 0];
export const FINISH_COLOR = [0, 80, 255];
export const HURRY_COLOR = [255, 200, 0];

const BASE_SECONDS = 5; // on top of the per-hold time, to get set
const HURRY_AT = 0.35; // share of the time left when the finish turns yellow...
const FLASH_AT = 0.15; // ...and starts flashing

const key = (col, row) => `${col},${row}`;

export function createMaze(settings = MAZE_DEFAULTS, random = Math.random, board = DEFAULT_BOARD) {
  const s = { ...MAZE_DEFAULTS, ...settings };
  s.minSecondsPerHold = Math.min(s.minSecondsPerHold, s.secondsPerHold); // custom mode can set these in any order
  s.corridor = Math.max(1, Math.min(2, Math.round(s.corridor)));
  // Small boards: drop to one-hold corridors rather than a maze only two cells across.
  if (Math.floor((Math.min(board.cols, board.rows) + 1) / (s.corridor + 1)) < 3) s.corridor = 1;
  const game = {
    settings: s,
    board,
    random,
    score: 0,
    speedLevel: 0,
    secondsPerHold: s.secondsPerHold,
    elapsed: 0,
    upwards: true, // this maze runs bottom to top
    path: new Set(), // main-grid holds that are corridor
    start: [], // [col, row] holds
    finish: [],
    finishCell: null, // maze cell column the finish sits in
    pathLength: 0,
    timeLimit: 0,
    timeLeft: 0,
  };
  buildMaze(game, null);
  return game;
}

// The maze lives on a coarse grid of cells, `corridor` holds square, with one-hold walls between them.
function geometry(game) {
  const { cols, rows } = game.board;
  const pitch = game.settings.corridor + 1;
  const nx = Math.floor((cols + 1) / pitch);
  const ny = Math.floor((rows + 1) / pitch);
  // Spare columns split between the sides; spare rows go at the top so the maze reaches the floor.
  return { pitch, nx, ny, ox: Math.floor((cols - (nx * pitch - 1)) / 2), oy: rows - (ny * pitch - 1) };
}

function buildMaze(game, entryCell) {
  const { corridor, loops } = game.settings;
  const { pitch, nx, ny, ox, oy } = geometry(game);
  const rand = (n) => Math.floor(game.random() * n);
  const cellHolds = (i, j) => {
    const holds = [];
    for (let dr = 0; dr < corridor; dr++) for (let dc = 0; dc < corridor; dc++) holds.push([ox + i * pitch + dc, oy + j * pitch + dr]);
    return holds;
  };
  const path = new Set();
  const open = (holds) => holds.forEach(([c, r]) => path.add(key(c, r)));
  // The holds in the wall between a cell and its right or lower neighbour.
  const doorway = (i, j, right) =>
    Array.from({ length: corridor }, (_, d) =>
      right ? [ox + i * pitch + corridor, oy + j * pitch + d] : [ox + i * pitch + d, oy + j * pitch + corridor],
    );

  // Depth-first carve (recursive backtracker): long, winding corridors.
  const visited = new Set([key(0, 0)]);
  const stack = [[0, 0]];
  const walls = new Set(); // walls still standing, as "i,j,right|down"
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      open(cellHolds(i, j));
      if (i + 1 < nx) walls.add(`${i},${j},right`);
      if (j + 1 < ny) walls.add(`${i},${j},down`);
    }
  }
  const knock = (wall) => {
    walls.delete(wall);
    const [i, j, side] = wall.split(',');
    open(doorway(Number(i), Number(j), side === 'right'));
  };
  while (stack.length) {
    const [i, j] = stack.at(-1);
    const next = [
      [i + 1, j, `${i},${j},right`],
      [i - 1, j, `${i - 1},${j},right`],
      [i, j + 1, `${i},${j},down`],
      [i, j - 1, `${i},${j - 1},down`],
    ].filter(([a, b]) => a >= 0 && b >= 0 && a < nx && b < ny && !visited.has(key(a, b)));
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [a, b, wall] = next[rand(next.length)];
    knock(wall);
    visited.add(key(a, b));
    stack.push([a, b]);
  }
  for (const wall of [...walls]) if (game.random() < loops) knock(wall);

  // Start where the last maze finished; finish on the far edge, well across from the start.
  const startRow = game.upwards ? ny - 1 : 0;
  const finishRow = game.upwards ? 0 : ny - 1;
  const startCell = entryCell ?? rand(nx);
  const far = Array.from({ length: nx }, (_, i) => i).filter((i) => Math.abs(i - startCell) >= Math.floor(nx / 2));
  const finishCell = far[rand(far.length)];

  game.path = path;
  game.start = cellHolds(startCell, startRow);
  game.finish = cellHolds(finishCell, finishRow);
  game.finishCell = finishCell;
  game.pathLength = shortestPath(game, game.start[0], game.finish[0]);
  game.timeLimit = BASE_SECONDS + game.pathLength * game.secondsPerHold;
  game.timeLeft = game.timeLimit;
  game.elapsed = 0;
}

// Holds along the shortest corridor route between two holds (breadth-first search).
function shortestPath(game, [c0, r0], [c1, r1]) {
  const dist = new Map([[key(c0, r0), 1]]);
  const queue = [[c0, r0]];
  while (queue.length) {
    const [c, r] = queue.shift();
    if (c === c1 && r === r1) return dist.get(key(c, r));
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(c + dc, r + dr);
      if (!game.path.has(k) || dist.has(k)) continue;
      dist.set(k, dist.get(key(c, r)) + 1);
      queue.push([c + dc, r + dr]);
    }
  }
  return 0;
}

// Finished a maze: score, speed up, and build the next one from where the climber is.
function completeMaze(game) {
  game.score += 1;
  const { speedUpEvery, secondsPerHold, minSecondsPerHold } = game.settings;
  if (levelUp(game, speedUpEvery)) game.secondsPerHold = rampValue(secondsPerHold, minSecondsPerHold, game.speedLevel);
  game.upwards = !game.upwards;
  buildMaze(game, game.finishCell);
}

// Advance the clock by dt seconds. Returns { scored } when the time is up on a maze (solo).
export function advanceMaze(game, dt) {
  game.elapsed += dt;
  if (game.settings.coop) return { scored: false };
  game.timeLeft -= dt;
  if (game.timeLeft > 0) return { scored: false };
  completeMaze(game);
  return { scored: true };
}

// Co-op control.
export function madeIt(game) {
  completeMaze(game);
}

export function finishColor(game) {
  if (game.settings.coop) return FINISH_COLOR;
  const share = game.timeLeft / game.timeLimit;
  if (share > HURRY_AT) return FINISH_COLOR;
  if (share > FLASH_AT || Math.floor(game.timeLeft * 2) % 2 === 0) return HURRY_COLOR;
  return null; // flashing: off this half-second
}

// Walls light every hold inside the maze's area that isn't corridor. An offset hold counts as corridor
// when nearly all the grid holds around it do, so walls read as solid and corridors stay climbable.
export function renderMaze(game) {
  const { board } = game;
  const frame = new Map();
  const x0 = board.colToX(0);
  const y0 = board.rowToY(0);
  for (const h of board.holes) {
    const c = (h.x - x0) / STEP;
    const r = (y0 - h.y) / STEP;
    if (c < 0 || r < 0 || c > board.cols - 1 || r > board.rows - 1) continue; // kickboard and edges stay dark
    const around = [];
    for (const cc of new Set([Math.floor(c), Math.ceil(c)])) for (const rr of new Set([Math.floor(r), Math.ceil(r)])) around.push(key(cc, rr));
    const open = around.filter((k) => game.path.has(k)).length;
    if (open < Math.ceil(around.length * 0.75)) frame.set(h.position, WALL_COLOR);
  }
  const light = (holds, color) => {
    for (const [c, r] of holds) {
      const pos = board.gridPosition(c, r);
      if (pos !== undefined) frame.set(pos, color);
    }
  };
  light(game.start, START_COLOR);
  const color = finishColor(game);
  if (color) light(game.finish, color);
  return frame;
}

export const mazeMessage = (game) => `${Math.ceil(game.settings.coop ? game.elapsed : game.timeLeft)}s`;
