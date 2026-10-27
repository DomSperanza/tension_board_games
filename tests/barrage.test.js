import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BOARD } from '../src/js/layout.js';
import {
  createBarrage,
  stepBarrage,
  renderBarrage,
  moveCannon,
  fireCannon,
  aliveAliens,
  alienCol,
  BARRAGE_DIFFICULTIES,
  BOLT_COLOR,
  ALIEN_COLOR,
  CANNON_COLOR,
} from '../src/js/barrage.js';

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const { cols: COLS, rows: ROWS } = DEFAULT_BOARD;
const quiet = { fireChance: 0, volleyEvery: 0 };

test('the formation marches back and forth along the top without leaving the board', () => {
  const game = createBarrage({ ...quiet, marchEvery: 1, alienRows: 2 }, seeded());
  const seen = new Set();
  for (let t = 0; t < 60; t++) {
    stepBarrage(game);
    for (const a of game.aliens) {
      const col = alienCol(game, a);
      assert.ok(col >= 0 && col < COLS, `alien off board at ${col}`);
      assert.ok(a.row <= 2);
    }
    seen.add(game.formationCol);
  }
  assert.ok(seen.has(0) && seen.has(game.marchRange), 'reaches both ends');
});

test('bolts fall a row per step and score when they leave the bottom', () => {
  const game = createBarrage({ ...quiet, speedUpEvery: 0 }, seeded());
  game.bolts.push({ col: 3, row: 2 });
  let steps = 0;
  while (game.score === 0) {
    stepBarrage(game);
    steps++;
  }
  assert.equal(steps, ROWS - 1, 'from row 2 the top of the bolt leaves after ROWS - 1 drops');
  assert.equal(game.bolts.length, 0);
});

test('a bolt lights its column over two rows plus the offset holds beside it', () => {
  const game = createBarrage(quiet, seeded());
  game.aliens = [];
  game.bolts = [{ col: 8, row: 9 }];
  const frame = renderBarrage(game);
  assert.equal(frame.size, 4);
  for (const color of frame.values()) assert.deepEqual(color, BOLT_COLOR);
  assert.ok(frame.has(DEFAULT_BOARD.gridPosition(8, 9)) && frame.has(DEFAULT_BOARD.gridPosition(8, 8)));
});

test('solo mode never shows a cannon or shots; aliens are a hold plus two legs', () => {
  const game = createBarrage(quiet, seeded());
  const frame = renderBarrage(game);
  const aliens = aliveAliens(game);
  // Three holds each, except a leg falls off the edge for an alien in the first column.
  assert.equal(frame.size, aliens.length * 3 - aliens.filter((a) => alienCol(game, a) === 0).length);
  for (const a of aliens) assert.ok(frame.has(DEFAULT_BOARD.gridPosition(alienCol(game, a), a.row)));
  for (const color of frame.values()) assert.deepEqual(color, ALIEN_COLOR);
  assert.equal(fireCannon(game), true, 'controls are harmless in solo, the app just hides them');
});

test('aliens fire, and volleys fire from every alien at once', () => {
  const game = createBarrage({ fireChance: 0, volleyEvery: 5, marchEvery: 99 }, seeded());
  for (let t = 0; t < 5; t++) stepBarrage(game);
  assert.equal(game.bolts.length, aliveAliens(game).length);
  const chatty = createBarrage({ fireChance: 1, volleyEvery: 0 }, seeded());
  for (let t = 0; t < 10; t++) stepBarrage(chatty);
  assert.ok(chatty.bolts.length > 0);
});

test('co-op: the cannon moves within the board and fires at most two shots at a time', () => {
  const game = createBarrage({ ...quiet, coop: true }, seeded());
  for (let i = 0; i < 40; i++) moveCannon(game, -1);
  assert.equal(game.cannon, 0);
  for (let i = 0; i < 40; i++) moveCannon(game, 1);
  assert.equal(game.cannon, COLS - 1);
  assert.equal(fireCannon(game), true);
  assert.equal(fireCannon(game), true);
  assert.equal(fireCannon(game), false);
  const frame = renderBarrage(game);
  assert.deepEqual(frame.get(DEFAULT_BOARD.gridPosition(COLS - 1, ROWS - 1)), CANNON_COLOR);
});

test('co-op: a shot knocks out the bolt it meets, even when they would pass between steps', () => {
  for (const startRow of [5, 6, 7, 8]) {
    const game = createBarrage({ ...quiet, coop: true, marchEvery: 99 }, seeded());
    game.cannon = 1; // between the aliens' columns, so only the bolt is in the way
    game.bolts = [{ col: 1, row: startRow }];
    fireCannon(game);
    for (let t = 0; t < ROWS && (game.bolts.length || game.shots.length); t++) stepBarrage(game);
    assert.equal(game.bolts.length, 0, `bolt from row ${startRow} survived`);
    assert.equal(game.shots.length, 0);
    assert.equal(game.score, 0, 'stopping a bolt is not a dodge');
  }
});

test('co-op: shots destroy aliens for a point, and a cleared wave brings the next one', () => {
  const game = createBarrage({ ...quiet, coop: true, marchEvery: 99, speedUpEvery: 0 }, seeded());
  const targets = aliveAliens(game).length;
  for (const alien of [...game.aliens]) {
    game.cannon = alienCol(game, alien);
    fireCannon(game);
    while (game.shots.length) stepBarrage(game);
    assert.equal(alien.alive, false);
  }
  assert.equal(game.kills, targets);
  assert.equal(game.score, targets);
  assert.equal(game.wave, 2);
  assert.equal(aliveAliens(game).length, targets);
});

test('speed steps up to top speed and holds there', () => {
  for (const { settings } of Object.values(BARRAGE_DIFFICULTIES)) {
    const game = createBarrage(settings, seeded(3));
    for (let t = 0; t < 3000; t++) stepBarrage(game);
    assert.equal(game.speedLevel, 4);
    assert.ok(Math.abs(game.rowSeconds - settings.minRowSeconds) < 1e-9);
  }
});
