import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BOARD, getBoard } from '../src/js/layout.js';
import { createRally, stepRally, renderRally, movePaddle, RALLY_DIFFICULTIES, BALL_COLOR, PADDLE_COLOR } from '../src/js/rally.js';

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

test('solo: the paddles never miss, the ball bounces off the top and bottom, and the rally speeds up', () => {
  for (const [mode, { settings }] of Object.entries(RALLY_DIFFICULTIES)) {
    for (const id of [6, 5, 10]) {
      const board = getBoard(id);
      const game = createRally(settings, seeded(id + mode.length), board);
      const rows = new Set();
      for (let t = 0; t < 2000; t++) {
        stepRally(game);
        for (const b of game.balls) {
          assert.ok(b.col >= 1 && b.col <= board.cols - 2, `${mode}/${id}: ball reached a paddle column`);
          rows.add(b.row);
        }
      }
      const crossings = (2000 * game.balls.length) / (board.cols - 3);
      assert.ok(game.score >= crossings * 0.9, `${mode}/${id}: only ${game.score} returns in ~${Math.round(crossings)} crossings`);
      assert.ok(rows.has(0) && rows.has(board.rows - 1), `${mode}/${id}: ball never used the full height`);
      assert.equal(game.rowSeconds, game.settings.minRowSeconds);
    }
  }
});

test('a return scores; a miss serves a new ball from the paddle that missed', () => {
  const game = createRally({ balls: 1, paddleRows: 4 }, seeded());
  const ball = game.balls[0];
  Object.assign(ball, { col: 1, row: 3, dc: -1, dr: 0 });
  game.paddles.left = 2;
  game.paddles.right = 0;
  game.settings.coop = true; // keep the left paddle still
  assert.equal(stepRally(game).scored, true);
  assert.equal(game.balls[0].dc, 1);
  assert.equal(game.balls[0].col, 2);

  Object.assign(game.balls[0], { col: 1, row: 12, dc: -1, dr: 0 });
  assert.equal(stepRally(game).scored, false);
  assert.equal(game.score, 1);
  assert.equal(game.balls[0].dc, 1, 'served away from the left');
  assert.ok(game.balls[0].row >= game.paddles.left && game.balls[0].row < game.paddles.left + 4);
});

test('co-op: the paddle moves two rows a press, stays on the board, and aims with its ends', () => {
  const game = createRally({ coop: true, paddleRows: 4, maxSlope: 1 }, seeded());
  game.paddles.left = 6;
  movePaddle(game, -1);
  assert.equal(game.paddles.left, 4);
  for (let i = 0; i < 20; i++) movePaddle(game, -1);
  assert.equal(game.paddles.left, 0);
  for (let i = 0; i < 20; i++) movePaddle(game, 1);
  assert.equal(game.paddles.left, DEFAULT_BOARD.rows - 4);

  const hitAt = (row) => {
    game.paddles.left = 6;
    game.balls = [{ col: 1, row, dc: -1, dr: 0 }];
    stepRally(game);
    return game.balls[0].dr;
  };
  assert.equal(hitAt(6), -1, 'top of the paddle sends it up');
  assert.equal(hitAt(9), 1, 'bottom sends it down');
});

test('the ball is drawn over the paddles as a five-hold cross', () => {
  const game = createRally({}, seeded());
  game.balls = [{ col: 5, row: 5, dc: 1, dr: 1 }];
  const frame = renderRally(game);
  assert.equal([...frame.values()].filter((c) => c === BALL_COLOR).length, 5);
  assert.equal([...frame.values()].filter((c) => c === PADDLE_COLOR).length, 2 * game.settings.paddleRows);
});
