// Rally game state. Pure logic: no timers, DOM or Bluetooth here.
//
// Two paddles guard the left and right edges of the wall and knock a red ball back and forth
// across it, bouncing off the top and bottom. The ball is lava: dodge it as it crosses.
// Every return scores a point. Solo: both paddles play themselves and never miss.
// Co-op: a second player moves the left paddle from the phone and aims with it. Where the ball
// hits the paddle sets its angle, so they can hunt the climber. A miss just serves a new ball.
// Everything speeds up in steps to top speed at level 5.

import { DEFAULT_BOARD, STEP } from './layout.js';
import { rampValue, levelUp } from './ramp.js';

export const RALLY_DEFAULTS = {
  rowSeconds: 0.35, // time per step (the ball moves one column) at the start
  minRowSeconds: 0.22, // ...and at top speed (level 5)
  speedUpEvery: 4, // returns between speed-ups (0 = never)
  balls: 1,
  maxSlope: 1, // most rows the ball climbs or drops per column
  paddleRows: 4,
  coop: false, // a second player moves the left paddle from the phone
};

export const RALLY_DIFFICULTIES = {
  beginner: {
    label: 'Beginner',
    settings: { rowSeconds: 0.45, minRowSeconds: 0.3, speedUpEvery: 4, balls: 1, maxSlope: 1, paddleRows: 5 },
  },
  intermediate: {
    label: 'Intermediate',
    settings: { rowSeconds: 0.35, minRowSeconds: 0.22, speedUpEvery: 4, balls: 1, maxSlope: 1, paddleRows: 4 },
  },
  hard: { label: 'Hard', settings: { rowSeconds: 0.3, minRowSeconds: 0.18, speedUpEvery: 4, balls: 2, maxSlope: 2, paddleRows: 4 } },
  impossible: {
    label: 'Impossible',
    settings: { rowSeconds: 0.25, minRowSeconds: 0.15, speedUpEvery: 3, balls: 2, maxSlope: 2, paddleRows: 3 },
  },
};

export const BALL_COLOR = [255, 0, 0];
export const PADDLE_COLOR = [0, 200, 255];

const AI_SPEED = 2; // rows a self-playing paddle moves per step
const PLAYER_MOVE = 2; // rows the co-op paddle moves per press

export function createRally(settings = RALLY_DEFAULTS, random = Math.random, board = DEFAULT_BOARD) {
  const s = { ...RALLY_DEFAULTS, ...settings };
  s.minRowSeconds = Math.min(s.minRowSeconds, s.rowSeconds); // custom mode can set these in any order
  s.balls = Math.max(1, Math.min(3, Math.round(s.balls)));
  s.maxSlope = Math.max(1, Math.min(2, Math.round(s.maxSlope)));
  s.paddleRows = Math.max(2, Math.min(board.rows - 2, Math.round(s.paddleRows)));
  const middle = Math.floor((board.rows - s.paddleRows) / 2);
  const game = {
    settings: s,
    board,
    random,
    score: 0,
    speedLevel: 0,
    rowSeconds: s.rowSeconds,
    paddles: { left: middle, right: middle }, // top row of each paddle
    balls: [],
  };
  // Serve one ball from each side in turn, a few rows apart.
  for (let i = 0; i < s.balls; i++) game.balls.push(serve(game, i % 2 ? 'left' : 'right', i));
  return game;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const randomSlope = (game) => Math.floor(game.random() * (2 * game.settings.maxSlope + 1)) - game.settings.maxSlope;
const paddleCol = (game, side) => (side === 'left' ? 0 : game.board.cols - 1);
const covers = (game, side, row) => row >= game.paddles[side] && row < game.paddles[side] + game.settings.paddleRows;

// A new ball leaves a paddle, heading for the other side.
function serve(game, side, offset = 0) {
  const row = clamp(game.paddles[side] + Math.floor(game.settings.paddleRows / 2) + offset * 3, 0, game.board.rows - 1);
  return { col: side === 'left' ? 1 : game.board.cols - 2, row, dc: side === 'left' ? 1 : -1, dr: randomSlope(game) || 1 };
}

// Row after moving `dr`, bouncing off the top and bottom.
function bounce(game, row, dr) {
  const bottom = game.board.rows - 1;
  let next = row + dr;
  if (next < 0) return { row: -next, dr: -dr };
  if (next > bottom) return { row: 2 * bottom - next, dr: -dr };
  return { row: next, dr };
}

// Where a ball will cross the column next to a paddle (followed through bounces).
function intercept(game, ball) {
  const target = ball.dc < 0 ? 1 : game.board.cols - 2;
  let { row, dr } = ball;
  for (let col = ball.col; col !== target; col += ball.dc) ({ row, dr } = bounce(game, row, dr));
  return { row, steps: Math.abs(target - ball.col) };
}

// A self-playing paddle lines up with the next ball coming its way.
function autoPaddle(game, side) {
  const incoming = game.balls.filter((b) => (side === 'left' ? b.dc < 0 : b.dc > 0)).map((b) => intercept(game, b));
  if (!incoming.length) return;
  const { row } = incoming.reduce((a, b) => (b.steps < a.steps ? b : a));
  const top = clamp(row - Math.floor(game.settings.paddleRows / 2), 0, game.board.rows - game.settings.paddleRows);
  game.paddles[side] += clamp(top - game.paddles[side], -AI_SPEED, AI_SPEED);
}

// One step: paddles move, each ball moves a column, bouncing off walls and paddles. Returns { scored }.
export function stepRally(game) {
  const scoreBefore = game.score;
  if (!game.settings.coop) autoPaddle(game, 'left');
  autoPaddle(game, 'right');

  game.balls = game.balls.map((ball) => {
    const side = ball.dc < 0 ? 'left' : 'right';
    const atPaddle = ball.col + ball.dc === paddleCol(game, side);
    if (atPaddle && covers(game, side, ball.row)) {
      ball.dc = -ball.dc;
      ball.dr = returnSlope(game, side, ball);
      game.score += 1;
      const { speedUpEvery, rowSeconds, minRowSeconds } = game.settings;
      if (levelUp(game, speedUpEvery)) game.rowSeconds = rampValue(rowSeconds, minRowSeconds, game.speedLevel);
    } else if (atPaddle) {
      return serve(game, side); // missed: that paddle serves a new ball
    }
    ball.col += ball.dc;
    ({ row: ball.row, dr: ball.dr } = bounce(game, ball.row, ball.dr));
    return ball;
  });
  return { scored: game.score > scoreBefore };
}

// The co-op player aims: the top of the paddle sends the ball up, the bottom sends it down.
// Self-playing paddles aim anywhere.
function returnSlope(game, side, ball) {
  if (!(game.settings.coop && side === 'left')) return randomSlope(game);
  const { paddleRows, maxSlope } = game.settings;
  const offset = (ball.row - game.paddles.left - (paddleRows - 1) / 2) / (paddleRows / 2); // -1..1
  return clamp(Math.round(offset * maxSlope * 1.5), -maxSlope, maxSlope);
}

// Co-op control.
export function movePaddle(game, dir) {
  game.paddles.left = clamp(game.paddles.left + dir * PLAYER_MOVE, 0, game.board.rows - game.settings.paddleRows);
}

// Paddles light their edge column; each ball is a hold plus the four offset holds around it.
// Balls go on last so they're never hidden: they're the lava.
export function renderRally(game) {
  const { board } = game;
  const frame = new Map();
  const light = (x, y, color) => {
    const pos = board.holeAt(x, y);
    if (pos !== undefined) frame.set(pos, color);
  };
  for (const side of ['left', 'right']) {
    const x = board.colToX(paddleCol(game, side));
    for (let r = 0; r < game.settings.paddleRows; r++) light(x, board.rowToY(game.paddles[side] + r), PADDLE_COLOR);
  }
  const h = STEP / 2;
  for (const ball of game.balls) {
    const x = board.colToX(ball.col);
    const y = board.rowToY(ball.row);
    for (const [dx, dy] of [[0, 0], [-h, -h], [h, -h], [-h, h], [h, h]]) light(x + dx, y + dy, BALL_COLOR);
  }
  return frame;
}

export const rallyMessage = (game) => (game.settings.coop ? `Rally ${game.score}` : 'Dodge!');
