// Recall game state. Pure logic: no timers, DOM or Bluetooth here.
//
// A problem that grows by one hold every round, and you have to climb it from memory.
// Each round: get on the start hold (lit yellow), watch the problem flash one hold at a time
// (start green, hands blue, finish pink), then the board goes dark and you climb it before the clock runs out.
// Survive the round and the problem gets one more hold. Honor system: wrong hold, fall or forget = out.

import { DEFAULT_BOARD } from './layout.js';

export const RECALL_DEFAULTS = {
  startLength: 3, // holds in the first round, start hold included
  showSeconds: 1.0, // how long each hold takes to play back
  restSeconds: 5, // time to get back on the start hold between rounds
  climbSeconds: 4, // base climbing time per round...
  perHoldSeconds: 2.5, // ...plus this much for every hold in the problem
  minReach: 2, // grid distance between consecutive holds
  maxReach: 3.5,
  bottomMargin: 3, // keep holds this many rows above the bottom so they're hand holds
};

export const RECALL_DIFFICULTIES = {
  beginner: {
    label: 'Beginner',
    settings: { startLength: 2, showSeconds: 1.4, restSeconds: 6, perHoldSeconds: 3, minReach: 1.5, maxReach: 2.5 },
  },
  intermediate: {
    label: 'Intermediate',
    settings: { startLength: 3, showSeconds: 1.0, restSeconds: 5, perHoldSeconds: 2.5, minReach: 2, maxReach: 3.5 },
  },
  hard: { label: 'Hard', settings: { startLength: 4, showSeconds: 0.7, restSeconds: 4, perHoldSeconds: 2, minReach: 2.5, maxReach: 4 } },
  impossible: {
    label: 'Impossible',
    settings: { startLength: 5, showSeconds: 0.5, restSeconds: 3, perHoldSeconds: 1.5, minReach: 3, maxReach: 5 },
  },
};

const YELLOW = [255, 255, 0];
const GREEN = [0, 255, 0];
const BLUE = [0, 80, 255];
const PINK = [255, 0, 160];

const UPWARD_BIAS = 0.6; // chance the next move goes up when it can
const LIT_FRACTION = 0.75; // during playback each hold is lit for this part of its slot, then dark

export function createRecall(settings = RECALL_DEFAULTS, random = Math.random, board = DEFAULT_BOARD) {
  const s = { ...RECALL_DEFAULTS, ...settings };
  s.minReach = Math.min(s.minReach, s.maxReach); // custom mode can set these in any order
  s.bottomMargin = Math.max(0, Math.min(s.bottomMargin, board.rows - 1));
  const game = { settings: s, board, random, score: 0, sequence: [], phase: 'rest', step: 0, timeLeft: s.restSeconds };
  game.sequence.push(startHold(game));
  while (game.sequence.length < s.startLength) game.sequence.push(nextHold(game));
  return game;
}

const lowestRow = (game) => game.board.rows - 1 - game.settings.bottomMargin;

// Start low and somewhere in the middle half, so the problem has room to wander either way.
function startHold(game) {
  const { cols } = game.board;
  const col = Math.floor(cols / 4) + Math.floor(game.random() * Math.ceil(cols / 2));
  return { col, row: lowestRow(game) };
}

// A random unused hold within reach of the last one, usually upwards.
function nextHold(game) {
  const { minReach, maxReach } = game.settings;
  const last = game.sequence.at(-1);
  const used = new Set(game.sequence.map((h) => `${h.col},${h.row}`));
  const free = [];
  for (let row = 0; row <= lowestRow(game); row++) {
    for (let col = 0; col < game.board.cols; col++) {
      if (!used.has(`${col},${row}`)) free.push({ col, row, d: Math.hypot(col - last.col, row - last.row) });
    }
  }
  const inReach = free.filter((h) => h.d >= minReach - 1e-9 && h.d <= maxReach + 1e-9);
  const upward = inReach.filter((h) => h.row < last.row);
  let pool = upward.length && game.random() < UPWARD_BIAS ? upward : inReach;
  if (!pool.length) pool = free.sort((a, b) => a.d - b.d).slice(0, 5); // boxed in: take one of the nearest
  const { col, row } = pool[Math.floor(game.random() * pool.length)];
  return { col, row };
}

export const climbTime = (game) => game.settings.climbSeconds + game.settings.perHoldSeconds * game.sequence.length;

// Advance time by dt seconds: rest -> show (one slot per hold) -> climb -> next round.
// Returns { scored } when a round is survived and the problem grows.
export function advanceRecall(game, dt) {
  game.timeLeft -= dt;
  if (game.timeLeft > 1e-9) return { scored: false };

  const s = game.settings;
  if (game.phase === 'rest') {
    game.phase = 'show';
    game.step = 0;
    game.timeLeft = s.showSeconds;
  } else if (game.phase === 'show' && game.step + 1 < game.sequence.length) {
    game.step += 1;
    game.timeLeft = s.showSeconds;
  } else if (game.phase === 'show') {
    game.phase = 'climb';
    game.timeLeft = climbTime(game);
  } else {
    game.score += 1;
    game.sequence.push(nextHold(game));
    game.phase = 'rest';
    game.timeLeft = s.restSeconds;
    return { scored: true };
  }
  return { scored: false };
}

export function holdColor(index, length) {
  if (index === 0) return GREEN;
  return index === length - 1 ? PINK : BLUE;
}

// Rest: the start hold glows yellow. Show: the current hold, with a short dark beat between holds. Climb: dark.
export function renderRecall(game) {
  const frame = new Map();
  const light = ({ col, row }, color) => {
    const pos = game.board.gridPosition(col, row);
    if (pos !== undefined) frame.set(pos, color);
  };
  if (game.phase === 'rest') light(game.sequence[0], YELLOW);
  if (game.phase === 'show' && game.timeLeft > game.settings.showSeconds * (1 - LIT_FRACTION)) {
    light(game.sequence[game.step], holdColor(game.step, game.sequence.length));
  }
  return frame;
}

export function recallMessage(game) {
  if (game.phase === 'rest') return `Start hold · ${Math.ceil(game.timeLeft)}`;
  if (game.phase === 'show') return `Watch ${game.step + 1}/${game.sequence.length}`;
  return game.timeLeft.toFixed(1);
}
