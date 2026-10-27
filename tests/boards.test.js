import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_LIST, getBoard } from '../src/js/layout.js';
import { createGame, tick, renderFrame, DIFFICULTIES } from '../src/js/game.js';
import { createReach, advanceReach, renderReach, REACH_DIFFICULTIES } from '../src/js/reach.js';
import { BIG, goBitmap, numberBitmap } from '../src/js/font.js';
import { createBarrage, stepBarrage, renderBarrage, fireCannon, moveCannon, alienCol, BARRAGE_DIFFICULTIES } from '../src/js/barrage.js';
import { createSerpent, stepSerpent, renderSerpent, steerSerpent, SERPENT_DIFFICULTIES } from '../src/js/serpent.js';

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const lit = (bitmap) => bitmap.join('').split('').filter((ch) => ch === '#').length;
const boards = BOARD_LIST.map((b) => getBoard(b.id));

test('every Tension Board 1 and 2 size is available', () => {
  assert.equal(boards.filter((b) => b.family === 'tb1').length, 5);
  assert.equal(boards.filter((b) => b.family === 'tb2').length, 5);
  assert.equal(getBoard(1).holes.length, 389);
  assert.equal(getBoard(10).holes.length, 788);
  assert.equal(getBoard(999).id, 6, 'unknown ids fall back to the default board');
});

for (const board of boards) {
  test(`${board.name}: grid is a sensible size and mostly filled`, () => {
    assert.ok(board.cols >= 8 && board.cols <= 23, `cols ${board.cols}`);
    assert.ok(board.rows >= 14 && board.rows <= 19, `rows ${board.rows}`);
    let filled = 0;
    for (let r = 0; r < board.rows; r++) for (let c = 0; c < board.cols; c++) if (board.gridPosition(c, r) !== undefined) filled++;
    assert.ok(filled / (board.cols * board.rows) > 0.9, `only ${filled} of ${board.cols * board.rows} grid holds`);
    assert.equal(new Set(board.holes.map((h) => h.position)).size, board.holes.length);
  });

  test(`${board.name}: countdown, GO and scores fit`, () => {
    for (const bitmap of [BIG[3], BIG[2], BIG[1], goBitmap(board.cols), numberBitmap(42, board.cols)]) {
      assert.equal(board.bitmapPositions(bitmap).length, lit(bitmap));
    }
  });

  test(`${board.name}: Gap Drop plays with gaps on alternating sides that never overlap`, () => {
    for (const [mode, { settings }] of Object.entries(DIFFICULTIES)) {
      const game = createGame(settings, seeded(3), board);
      const { gapWidth } = game.settings;
      assert.ok(gapWidth * 2 <= board.cols, `${mode}: gap too wide`);
      let prev = null;
      for (let t = 0; t < 300; t++) {
        tick(game);
        if (game.ticksSinceSpawn !== 0) continue;
        const g = game.lastGapStart;
        assert.ok(g >= 0 && g + gapWidth <= board.cols, `${mode}: gap off board`);
        if (prev !== null) assert.ok(Math.abs(g - prev) >= gapWidth, `${mode}: gaps overlap`);
        prev = g;
      }
      assert.ok(game.score > 0, `${mode}: never scored`);
      for (const bar of game.bars) if (bar.row >= 0) assert.ok(renderFrame(game).size > 0);
    }
  });

  test(`${board.name}: Reach clusters land on the board`, () => {
    for (const [mode, { settings }] of Object.entries(REACH_DIFFICULTIES)) {
      const game = createReach(settings, seeded(5), board);
      for (let i = 0; i < 50; i++) {
        const size = game.settings.clusterSize;
        const { col, row } = game.target;
        assert.ok(col >= 0 && col + size <= board.cols && row >= 0 && row + size <= board.rows, `${mode}: off board`);
        assert.ok(renderReach(game).size >= size, `${mode}: cluster barely lit`);
        while (!advanceReach(game, 0.5).scored);
      }
    }
  });

  test(`${board.name}: Barrage aliens and bolts stay on the board, solo and co-op`, () => {
    for (const [mode, { settings }] of Object.entries(BARRAGE_DIFFICULTIES)) {
      for (const coop of [false, true]) {
        const game = createBarrage({ ...settings, coop }, seeded(13), board);
        assert.ok(game.aliens.length >= 2, `${mode}: only ${game.aliens.length} aliens`);
        for (let t = 0; t < 200; t++) {
          if (coop && t % 3 === 0) {
            moveCannon(game, t % 2 ? 1 : -1);
            fireCannon(game);
          }
          stepBarrage(game);
          for (const a of game.aliens) assert.ok(alienCol(game, a) >= 0 && alienCol(game, a) < board.cols, `${mode}: alien off board`);
          for (const b of game.bolts) assert.ok(b.col >= 0 && b.col < board.cols);
          renderBarrage(game);
        }
        assert.ok(game.score > 0, `${mode}/${coop}: never scored`);
      }
    }
  });

  test(`${board.name}: Serpent roams without crashing, solo and co-op`, () => {
    for (const [mode, { settings }] of Object.entries(SERPENT_DIFFICULTIES)) {
      for (const coop of [false, true]) {
        const game = createSerpent({ ...settings, coop }, seeded(17), board);
        for (let t = 0; t < 400; t++) {
          if (coop && t % 5 === 0) steerSerpent(game, ['up', 'left', 'down', 'right'][Math.floor(t / 5) % 4]);
          stepSerpent(game);
          const cells = new Set(game.body.map((c) => `${c.col},${c.row}`));
          assert.equal(cells.size, game.body.length, `${mode}/${coop}: overlaps itself`);
          for (const c of game.body) assert.ok(c.col >= 0 && c.col < board.cols && c.row >= 0 && c.row < board.rows);
        }
        assert.ok(renderSerpent(game).size > game.body.length);
      }
    }
  });
}
