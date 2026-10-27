import test from 'node:test';
import assert from 'node:assert/strict';
import { rampValue, levelUp, TOP_LEVEL } from '../src/js/ramp.js';

test('ramp goes from start to top in TOP_LEVEL - 1 even steps, then holds', () => {
  assert.equal(TOP_LEVEL, 5);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map((l) => rampValue(10, 2, l)), [10, 8, 6, 4, 2, 2, 2]);
});

test('levelUp fires every N points and stops at the top level', () => {
  const game = { score: 0, speedLevel: 0 };
  const ups = [];
  for (let i = 1; i <= 20; i++) {
    game.score = i;
    if (levelUp(game, 3)) ups.push(i);
  }
  assert.deepEqual(ups, [3, 6, 9, 12]);
  assert.equal(game.speedLevel, TOP_LEVEL - 1);
  assert.equal(levelUp({ score: 4, speedLevel: 0 }, 0), false, '0 = never');
});
