import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BOARD, getBoard } from '../src/js/layout.js';
import { createSerpent, stepSerpent, renderSerpent, steerSerpent, DIRECTIONS, SERPENT_DIFFICULTIES, APPLE_COLOR, HEAD_COLOR } from '../src/js/serpent.js';

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const key = ({ col, row }) => `${col},${row}`;

function assertHealthy(game, label) {
  const { cols, rows } = game.board;
  const cells = game.body.map(key);
  assert.equal(new Set(cells).size, cells.length, `${label}: snake overlaps itself`);
  for (const c of game.body) assert.ok(c.col >= 0 && c.col < cols && c.row >= 0 && c.row < rows, `${label}: off board`);
  for (let i = 1; i < game.body.length; i++) {
    const [a, b] = [game.body[i - 1], game.body[i]];
    assert.equal(Math.abs(a.col - b.col) + Math.abs(a.row - b.row), 1, `${label}: body broken`);
  }
  if (game.apple) assert.ok(!cells.includes(key(game.apple)), `${label}: apple under the snake`);
}

test('the snake starts along the top, heading right', () => {
  const game = createSerpent({ startLength: 5 }, seeded());
  assert.equal(game.body.length, 5);
  assert.ok(game.body.every((c) => c.row === 1));
  assert.equal(game.dir, DIRECTIONS.right);
});

test('steering itself, the snake eats apples, grows and never crashes', () => {
  for (const [mode, { settings }] of Object.entries(SERPENT_DIFFICULTIES)) {
    for (const id of [6, 5]) {
      const game = createSerpent(settings, seeded(id + mode.length), getBoard(id));
      for (let t = 0; t < 1500; t++) {
        stepSerpent(game);
        assertHealthy(game, `${mode}/${id} step ${t}`);
      }
      assert.ok(game.score >= 5, `${mode}/${id}: only ate ${game.score} apples`);
      assert.ok(game.body.length <= game.maxLength, `${mode}/${id}: too long`);
    }
  }
});

test('eating an apple scores and grows the snake by growBy', () => {
  const game = createSerpent({ startLength: 3, growBy: 2 }, seeded());
  const head = game.body[0];
  game.apple = { col: head.col + 1, row: head.row };
  game.wanted = null;
  assert.equal(stepSerpent(game).scored, true);
  assert.equal(game.score, 1);
  for (let t = 0; t < 3; t++) {
    game.apple = { col: 0, row: game.board.rows - 1 }; // far away so it doesn't eat again
    stepSerpent(game);
  }
  assert.equal(game.body.length, 5);
});

test('co-op: the snake follows the phone player, but refuses to crash', () => {
  const game = createSerpent({ coop: true, startLength: 4 }, seeded());
  steerSerpent(game, 'down');
  stepSerpent(game);
  assert.equal(game.dir, DIRECTIONS.down);
  stepSerpent(game);
  assert.equal(game.dir, DIRECTIONS.down, 'keeps going until told otherwise');
  steerSerpent(game, 'up'); // straight back into its own neck
  stepSerpent(game);
  assert.notEqual(game.dir, DIRECTIONS.up);
  steerSerpent(game, 'left');
  let reachedWall = false;
  for (let t = 0; t < 40; t++) {
    stepSerpent(game);
    assertHealthy(game, `co-op step ${t}`);
    reachedWall ||= game.body[0].col === 0;
  }
  assert.ok(reachedWall, 'went left all the way to the wall, then turned instead of crashing');
});

test('render: bright head, body band including the offset holds between cells, apple', () => {
  const game = createSerpent({ startLength: 4 }, seeded());
  const frame = renderSerpent(game);
  const b = DEFAULT_BOARD;
  assert.deepEqual(frame.get(b.gridPosition(game.body[0].col, game.body[0].row)), HEAD_COLOR);
  assert.deepEqual(frame.get(b.gridPosition(game.apple.col, game.apple.row)), APPLE_COLOR);
  // 4 main holds + 2 offset holds per joint (3 joints) + the apple.
  assert.equal(frame.size, 4 + 3 * 2 + 1);
});

test('speed steps up with apples to top speed and holds there', () => {
  const game = createSerpent(SERPENT_DIFFICULTIES.intermediate.settings, seeded(9));
  while (game.score < 20) stepSerpent(game);
  assert.equal(game.speedLevel, 4);
  assert.equal(game.rowSeconds, SERPENT_DIFFICULTIES.intermediate.settings.minRowSeconds);
});
