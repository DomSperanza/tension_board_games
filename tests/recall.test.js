import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BOARD } from '../src/js/layout.js';
import { createRecall, advanceRecall, renderRecall, recallMessage, climbTime, holdColor, RECALL_DIFFICULTIES } from '../src/js/recall.js';

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const DT = 0.1;
// Step until the phase changes; returns the seconds it took.
const runPhase = (game) => {
  const phase = game.phase;
  let t = 0;
  while (game.phase === phase) {
    advanceRecall(game, DT);
    t += DT;
  }
  return t;
};

test('the first problem starts low and has startLength distinct holds within reach', () => {
  for (const [mode, { settings }] of Object.entries(RECALL_DIFFICULTIES)) {
    const game = createRecall(settings, seeded(2));
    const { startLength, minReach, maxReach, bottomMargin } = game.settings;
    assert.equal(game.sequence.length, startLength, mode);
    assert.equal(game.sequence[0].row, DEFAULT_BOARD.rows - 1 - bottomMargin, `${mode}: start hold is on the lowest hand row`);
    for (let i = 1; i < game.sequence.length; i++) {
      const [a, b] = [game.sequence[i - 1], game.sequence[i]];
      const d = Math.hypot(a.col - b.col, a.row - b.row);
      assert.ok(d >= minReach - 1e-9 && d <= maxReach + 1e-9, `${mode}: move ${i} is ${d.toFixed(2)}`);
    }
  }
});

test('a round goes rest -> show one hold at a time -> climb, then grows by one hold', () => {
  const game = createRecall({ startLength: 3, restSeconds: 2, showSeconds: 1, climbSeconds: 1, perHoldSeconds: 2 }, seeded(4));
  const first = game.sequence.map((h) => ({ ...h }));
  assert.equal(game.phase, 'rest');
  assert.ok(Math.abs(runPhase(game) - 2) < 1e-6);

  assert.equal(game.phase, 'show');
  for (let i = 0; i < 3; i++) {
    assert.equal(game.step, i);
    const pos = DEFAULT_BOARD.gridPosition(game.sequence[i].col, game.sequence[i].row);
    assert.deepEqual([...renderRecall(game).keys()], [pos], `hold ${i} lit on its own`);
    for (let t = 0; t < 10; t++) advanceRecall(game, DT);
  }

  assert.equal(game.phase, 'climb');
  assert.equal(renderRecall(game).size, 0, 'board is dark while you climb');
  assert.equal(climbTime(game), 1 + 2 * 3);
  let scored = false;
  while (!scored) scored = advanceRecall(game, DT).scored;
  assert.equal(game.score, 1);
  assert.equal(game.phase, 'rest');
  assert.equal(game.sequence.length, 4);
  assert.deepEqual(game.sequence.slice(0, 3), first, 'the problem keeps its holds and adds one');
});

test('playback leaves a dark beat between holds', () => {
  const game = createRecall({ restSeconds: 0.1, showSeconds: 1 }, seeded(5));
  advanceRecall(game, DT);
  assert.equal(game.phase, 'show');
  advanceRecall(game, 0.5);
  assert.equal(renderRecall(game).size, 1);
  advanceRecall(game, 0.3);
  assert.equal(renderRecall(game).size, 0);
});

test('colors: start green, finish pink, the rest blue; start hold yellow while resting', () => {
  assert.deepEqual(holdColor(0, 4), [0, 255, 0]);
  assert.deepEqual(holdColor(1, 4), [0, 80, 255]);
  assert.deepEqual(holdColor(3, 4), [255, 0, 160]);
  const game = createRecall({}, seeded(6));
  const pos = DEFAULT_BOARD.gridPosition(game.sequence[0].col, game.sequence[0].row);
  assert.deepEqual([...renderRecall(game)], [[pos, [255, 255, 0]]]);
});

test('messages follow the phase', () => {
  const game = createRecall({ restSeconds: 3 }, seeded(7));
  assert.equal(recallMessage(game), 'Start hold · 3');
  runPhase(game);
  assert.equal(recallMessage(game), `Watch 1/${game.sequence.length}`);
  while (game.phase === 'show') advanceRecall(game, DT);
  assert.match(recallMessage(game), /^\d+\.\d$/);
});

test('long games keep finding new holds', () => {
  const game = createRecall(RECALL_DIFFICULTIES.impossible.settings, seeded(8));
  while (game.sequence.length < 60) advanceRecall(game, 1);
  assert.equal(new Set(game.sequence.map((h) => `${h.col},${h.row}`)).size, 60);
});
