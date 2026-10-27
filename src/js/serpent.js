// Serpent game state. Pure logic: no timers, DOM or Bluetooth here.
//
// A snake slithers around the wall hunting apples and grows every time it eats one.
// The snake is lava: keep every hand and foot off it. Apples are safe to touch. Each apple eaten scores a point.
// Solo: the snake steers itself. Co-op: a second player steers it from the phone, hunting the climber;
// it still won't crash into a wall or itself. Everything speeds up in steps to top speed at level 5.

import { DEFAULT_BOARD } from './layout.js';
import { rampValue, levelUp } from './ramp.js';

export const SERPENT_DEFAULTS = {
  rowSeconds: 0.5, // time per move at the start
  minRowSeconds: 0.3, // ...and at top speed (level 5)
  speedUpEvery: 2, // apples between speed-ups (0 = never)
  startLength: 5,
  growBy: 2, // holds added per apple
  maxLength: 0.25, // longest the snake gets, as a share of the main-grid holds
  coop: false, // a second player steers from the phone
};

export const SERPENT_DIFFICULTIES = {
  beginner: {
    label: 'Beginner',
    settings: { rowSeconds: 0.7, minRowSeconds: 0.45, speedUpEvery: 2, startLength: 4, growBy: 1, maxLength: 0.2 },
  },
  intermediate: {
    label: 'Intermediate',
    settings: { rowSeconds: 0.5, minRowSeconds: 0.3, speedUpEvery: 2, startLength: 5, growBy: 2, maxLength: 0.25 },
  },
  hard: { label: 'Hard', settings: { rowSeconds: 0.4, minRowSeconds: 0.22, speedUpEvery: 2, startLength: 6, growBy: 2, maxLength: 0.3 } },
  impossible: {
    label: 'Impossible',
    settings: { rowSeconds: 0.3, minRowSeconds: 0.16, speedUpEvery: 1, startLength: 7, growBy: 3, maxLength: 0.35 },
  },
};

export const HEAD_COLOR = [190, 255, 0];
export const BODY_COLOR = [0, 220, 60];
export const APPLE_COLOR = [255, 60, 0];

export const DIRECTIONS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const key = ({ col, row }) => `${col},${row}`;

export function createSerpent(settings = SERPENT_DEFAULTS, random = Math.random, board = DEFAULT_BOARD) {
  const s = { ...SERPENT_DEFAULTS, ...settings };
  s.minRowSeconds = Math.min(s.minRowSeconds, s.rowSeconds); // custom mode can set these in any order
  s.startLength = Math.max(2, Math.min(board.cols - 1, Math.round(s.startLength)));
  const head = Math.floor(board.cols / 2);
  // Start along the top, heading right, so the climber starts well clear of it.
  const body = Array.from({ length: s.startLength }, (_, i) => ({ col: head - i, row: 1 })).filter((c) => c.col >= 0);
  const game = {
    settings: s,
    board,
    random,
    score: 0,
    speedLevel: 0,
    rowSeconds: s.rowSeconds,
    body, // head first
    dir: DIRECTIONS.right,
    wanted: null, // co-op: the direction the phone player last chose
    grow: 0,
    maxLength: Math.max(s.startLength, Math.floor(s.maxLength * board.cols * board.rows)),
    apple: null,
  };
  game.apple = placeApple(game);
  return game;
}

const inBounds = (game, { col, row }) => col >= 0 && row >= 0 && col < game.board.cols && row < game.board.rows;

// Cells the head can't move into: the body, minus the tail tip when it's about to move away.
function blocked(game) {
  const cells = game.grow > 0 ? game.body : game.body.slice(0, -1);
  return new Set(cells.map(key));
}

// Free cells reachable from `start`, counted up to `limit`. Keeps the snake out of dead ends.
function room(game, start, taken, limit) {
  const seen = new Set([key(start)]);
  const queue = [start];
  while (queue.length && seen.size < limit) {
    const cell = queue.shift();
    for (const [dc, dr] of Object.values(DIRECTIONS)) {
      const next = { col: cell.col + dc, row: cell.row + dr };
      if (!inBounds(game, next) || taken.has(key(next)) || seen.has(key(next))) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return seen.size;
}

function safeMoves(game) {
  const taken = blocked(game);
  const head = game.body[0];
  return Object.values(DIRECTIONS)
    .map((dir) => ({ dir, cell: { col: head.col + dir[0], row: head.row + dir[1] } }))
    .filter(({ cell }) => inBounds(game, cell) && !taken.has(key(cell)));
}

// Head for the apple, but never into a pocket too small for the snake.
function autoMove(game, moves) {
  const taken = blocked(game);
  const need = game.body.length + 1;
  let best = null;
  for (const move of moves) {
    const toApple = Math.abs(move.cell.col - game.apple.col) + Math.abs(move.cell.row - game.apple.row);
    const cramped = room(game, move.cell, taken, need) < need ? 100 : 0;
    const cost = toApple + cramped + game.random() * 0.9;
    if (!best || cost < best.cost) best = { ...move, cost };
  }
  return best;
}

function chooseMove(game) {
  const moves = safeMoves(game);
  if (game.settings.coop) {
    // The phone player steers; the snake keeps going straight until told otherwise.
    for (const dir of [game.wanted, game.dir]) {
      const move = moves.find((m) => m.dir === dir);
      if (move) return move;
    }
  }
  return moves.length ? autoMove(game, moves) : null;
}

function placeApple(game) {
  const taken = new Set(game.body.map(key));
  const head = game.body[0];
  const free = [];
  for (let row = 0; row < game.board.rows; row++) {
    for (let col = 0; col < game.board.cols; col++) {
      const far = Math.abs(col - head.col) + Math.abs(row - head.row) >= 3;
      if (far && !taken.has(`${col},${row}`)) free.push({ col, row });
    }
  }
  return free.length ? free[Math.floor(game.random() * free.length)] : null;
}

// Move one cell. Returns { scored } when the snake ate an apple.
export function stepSerpent(game) {
  let move = chooseMove(game);
  if (!move) {
    // Boxed in: turn around and leave tail first.
    game.body.reverse();
    const [a, b] = game.body;
    game.dir = Object.values(DIRECTIONS).find(([dc, dr]) => dc === a.col - b.col && dr === a.row - b.row) ?? game.dir;
    move = chooseMove(game);
    if (!move) return { scored: false };
  }
  game.dir = move.dir;
  game.body.unshift(move.cell);

  let scored = false;
  if (game.apple && key(move.cell) === key(game.apple)) {
    scored = true;
    game.score += 1;
    game.grow += game.settings.growBy;
    const { speedUpEvery, rowSeconds, minRowSeconds } = game.settings;
    if (levelUp(game, speedUpEvery)) game.rowSeconds = rampValue(rowSeconds, minRowSeconds, game.speedLevel);
  }
  if (game.grow > 0 && game.body.length <= game.maxLength) game.grow -= 1;
  else game.body.pop();
  if (scored || !game.apple) game.apple = placeApple(game);
  return { scored };
}

// Co-op control.
export function steerSerpent(game, name) {
  game.wanted = DIRECTIONS[name] ?? game.wanted;
}

// The body lights the offset holds between neighbouring cells too, so it reads as one thick band.
export function renderSerpent(game) {
  const { board } = game;
  const frame = new Map();
  const light = (x, y, color) => {
    const pos = board.holeAt(x, y);
    if (pos !== undefined) frame.set(pos, color);
  };
  if (game.apple) light(board.colToX(game.apple.col), board.rowToY(game.apple.row), APPLE_COLOR);
  game.body.forEach((cell, i) => {
    const x = board.colToX(cell.col);
    const y = board.rowToY(cell.row);
    const next = game.body[i + 1];
    if (next) {
      const mx = (x + board.colToX(next.col)) / 2;
      const my = (y + board.rowToY(next.row)) / 2;
      if (next.row === cell.row) {
        light(mx, my + 4, BODY_COLOR);
        light(mx, my - 4, BODY_COLOR);
      } else {
        light(mx + 4, my, BODY_COLOR);
        light(mx - 4, my, BODY_COLOR);
      }
    }
    light(x, y, i === 0 ? HEAD_COLOR : BODY_COLOR);
  });
  return frame;
}

export const serpentMessage = (game) => `Length ${game.body.length}`;
