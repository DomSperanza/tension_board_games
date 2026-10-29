// Updraft game state. Pure logic: no timers, DOM or Bluetooth here.
//
// A bird flaps up and down the right edge of the wall. Every few steps a wall of lit holds forms
// around it, with a gap where the bird is, and drifts left across the board.
// Walls are lava: climb up or down so your hands and feet sit in each gap as the wall passes.
// Every wall that leaves the left edge scores a point. Solo: the bird flies itself.
// Co-op: a second player taps Flap on the phone to fly it, and the climber follows its path.
// Everything speeds up in steps to top speed at level 5.

import { DEFAULT_BOARD, STEP } from './layout.js';
import { rampValue, levelUp } from './ramp.js';

export const UPDRAFT_DEFAULTS = {
  rowSeconds: 0.55, // time per step (walls move one column) at the start
  minRowSeconds: 0.35, // ...and at top speed (level 5)
  speedUpEvery: 2, // walls between speed-ups (0 = never)
  gapHeight: 7, // rows
  wallSpacing: 8, // columns from one wall to the next
  maxShift: 3, // solo: most rows a gap moves from the last one
  coop: false, // a second player flies the bird from the phone
};

export const UPDRAFT_DIFFICULTIES = {
  beginner: {
    label: 'Beginner',
    settings: { rowSeconds: 0.75, minRowSeconds: 0.5, speedUpEvery: 2, gapHeight: 8, wallSpacing: 9, maxShift: 2 },
  },
  intermediate: {
    label: 'Intermediate',
    settings: { rowSeconds: 0.55, minRowSeconds: 0.35, speedUpEvery: 2, gapHeight: 7, wallSpacing: 8, maxShift: 3 },
  },
  hard: { label: 'Hard', settings: { rowSeconds: 0.45, minRowSeconds: 0.28, speedUpEvery: 2, gapHeight: 6, wallSpacing: 7, maxShift: 4 } },
  impossible: {
    label: 'Impossible',
    settings: { rowSeconds: 0.35, minRowSeconds: 0.22, speedUpEvery: 1, gapHeight: 5, wallSpacing: 6, maxShift: 5 },
  },
};

export const WALL_COLOR = [255, 0, 0];
export const BIRD_COLOR = [255, 200, 0];

const WALL_THICKNESS = 2; // main columns, plus the offset holds between them
// Bird physics, in rows and steps: a flap lifts it about three and a half rows, then it sinks.
const GRAVITY = 0.4;
const FLAP = -1.5;
const MAX_FALL = 1;

export function createUpdraft(settings = UPDRAFT_DEFAULTS, random = Math.random, board = DEFAULT_BOARD) {
  const s = { ...UPDRAFT_DEFAULTS, ...settings };
  s.minRowSeconds = Math.min(s.minRowSeconds, s.rowSeconds); // custom mode can set these in any order
  // Short boards: keep at least four rows of wall so there's something to dodge.
  s.gapHeight = Math.max(3, Math.min(board.rows - 4, Math.round(s.gapHeight)));
  s.wallSpacing = Math.max(WALL_THICKNESS + 2, Math.round(s.wallSpacing));
  const middle = Math.floor((board.rows - s.gapHeight) / 2);
  const game = {
    settings: s,
    board,
    random,
    score: 0,
    speedLevel: 0,
    rowSeconds: s.rowSeconds,
    walls: [], // { col, gapTop }: col is the wall's left column
    birdY: middle + (s.gapHeight - 1) / 2, // row, fractional
    birdVy: 0,
    target: middle, // solo: the gap top the bird is flying towards
    lastGapTop: middle,
    stepsSinceSpawn: Infinity,
  };
  return game;
}

const maxGapTop = (game) => game.board.rows - game.settings.gapHeight;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// The gap the bird is in: centred on it, kept on the board.
const gapAround = (game, y) => clamp(Math.round(y - (game.settings.gapHeight - 1) / 2), 0, maxGapTop(game));

// Solo: aim for the next gap and flap whenever the bird sinks below it.
function autopilot(game) {
  const centre = game.target + (game.settings.gapHeight - 1) / 2;
  if (game.birdY > centre + 0.5 && game.birdVy >= 0) flap(game);
}

function moveBird(game) {
  game.birdVy = Math.min(MAX_FALL, game.birdVy + GRAVITY);
  game.birdY += game.birdVy;
  const bottom = game.board.rows - 1;
  if (game.birdY < 0 || game.birdY > bottom) {
    game.birdY = clamp(game.birdY, 0, bottom);
    game.birdVy = 0;
  }
}

function spawnWall(game) {
  let gapTop = gapAround(game, game.birdY);
  if (!game.settings.coop) {
    // Solo stays climbable: the gap never jumps further than maxShift. Co-op is up to the pilot.
    const { maxShift } = game.settings;
    gapTop = clamp(gapTop, game.lastGapTop - maxShift, game.lastGapTop + maxShift);
    const shift = Math.floor(game.random() * (2 * maxShift + 1)) - maxShift;
    game.target = clamp(gapTop + shift, 0, maxGapTop(game));
  }
  game.walls.push({ col: game.board.cols - 1, gapTop });
  game.lastGapTop = gapTop;
  game.stepsSinceSpawn = 0;
}

// One step: walls drift a column left, the bird flies, and a new wall forms when it's time. Returns { scored }.
export function stepUpdraft(game) {
  const scoreBefore = game.score;
  for (const wall of game.walls) wall.col -= 1;
  const before = game.walls.length;
  game.walls = game.walls.filter((w) => w.col + WALL_THICKNESS > 0);
  for (let i = before - game.walls.length; i > 0; i--) {
    game.score += 1;
    const { speedUpEvery, rowSeconds, minRowSeconds } = game.settings;
    if (levelUp(game, speedUpEvery)) game.rowSeconds = rampValue(rowSeconds, minRowSeconds, game.speedLevel);
  }

  if (!game.settings.coop) autopilot(game);
  moveBird(game);

  game.stepsSinceSpawn += 1;
  if (game.stepsSinceSpawn >= game.settings.wallSpacing) spawnWall(game);
  return { scored: game.score > scoreBefore };
}

// Co-op control.
export function flap(game) {
  game.birdVy = FLAP;
}

export const birdRow = (game) => clamp(Math.round(game.birdY), 0, game.board.rows - 1);

// LED positions lit by one wall: every hole across its columns, minus the gap.
// Offset holds half a row outside the gap count as part of it, as in Gap Drop.
export function wallPositions(wall, game) {
  const { board, settings } = game;
  const left = board.colToX(wall.col);
  const right = board.colToX(wall.col + WALL_THICKNESS - 1);
  const gapTopY = board.rowToY(wall.gapTop) + STEP;
  const gapBottomY = board.rowToY(wall.gapTop + settings.gapHeight - 1) - STEP;
  return board.holes
    .filter((h) => h.x >= left && h.x <= right && !(h.y < gapTopY && h.y > gapBottomY))
    .map((h) => h.position);
}

// The bird goes on last: a body on the right edge with wings trailing on the offset holds.
export function renderUpdraft(game) {
  const { board } = game;
  const frame = new Map();
  for (const wall of game.walls) for (const pos of wallPositions(wall, game)) frame.set(pos, WALL_COLOR);
  const x = board.colToX(board.cols - 1);
  const y = board.rowToY(birdRow(game));
  for (const [dx, dy] of [
    [0, 0],
    [-STEP / 2, STEP / 2],
    [-STEP / 2, -STEP / 2],
  ]) {
    const pos = board.holeAt(x + dx, y + dy);
    if (pos !== undefined) frame.set(pos, BIRD_COLOR);
  }
  return frame;
}

export const updraftMessage = (game) => (game.settings.coop ? 'Flap!' : 'Fly!');
