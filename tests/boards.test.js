import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_LIST, getBoard } from '../src/js/layout.js';
import { createGame, tick, renderFrame, DIFFICULTIES } from '../src/js/game.js';
import { createReach, advanceReach, renderReach, REACH_DIFFICULTIES } from '../src/js/reach.js';
import { BIG, goBitmap, numberBitmap } from '../src/js/font.js';
import { createBarrage, stepBarrage, renderBarrage, fireCannon, moveCannon, alienCol, BARRAGE_DIFFICULTIES } from '../src/js/barrage.js';
import { createUpdraft, stepUpdraft, renderUpdraft, flap, birdRow, UPDRAFT_DIFFICULTIES } from '../src/js/updraft.js';
import { createRally, stepRally, renderRally, movePaddle, RALLY_DIFFICULTIES } from '../src/js/rally.js';
import { createMaze, advanceMaze, renderMaze, madeIt, MAZE_DIFFICULTIES, WALL_COLOR as MAZE_WALL } from '../src/js/maze.js';
import { createSerpent, stepSerpent, renderSerpent, steerSerpent, SERPENT_DIFFICULTIES } from '../src/js/serpent.js';

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const lit = (bitmap) => bitmap.join('').split('').filter((ch) => ch === '#').length;
const boards = BOARD_LIST.map((b) => getBoard(b.id));

test('every Tension Board 1 and 2 size and the Kilter Original and Homewall sizes are available', () => {
  assert.equal(boards.filter((b) => b.family === 'tb1').length, 5);
  assert.equal(boards.filter((b) => b.family === 'tb2').length, 5);
  assert.equal(boards.filter((b) => b.family === 'kilter-original').length, 6);
  assert.equal(boards.filter((b) => b.family === 'kilter-homewall').length, 10);
  assert.equal(getBoard('tension-1').holes.length, 389);
  assert.equal(getBoard('tension-10').holes.length, 788);
  assert.equal(getBoard('kilter-10').holes.length, 476);
  assert.equal(getBoard(10).id, 'tension-10', 'bare numbers saved by older versions are Tension boards');
  assert.equal(getBoard(999).id, 'tension-6', 'unknown ids fall back to the default board');
});

test('Kilter boards use the Mainline (bolt-on) holds as the grid, except Auxiliary-only kits', () => {
  const mainX = (id) => {
    const board = getBoard(id);
    return ((board.colToX(0) % 8) + 8) % 8;
  };
  for (const id of ['kilter-10', 'kilter-21', 'kilter-25', 'kilter-26']) assert.equal(mainX(id), 0, id);
  for (const id of ['kilter-19', 'kilter-29']) assert.equal(mainX(id), 4, id);
});

for (const board of boards) {
  test(`${board.name}: grid is a sensible size and mostly filled`, () => {
    assert.ok(board.cols >= 8 && board.cols <= 23, `cols ${board.cols}`);
    assert.ok(board.rows >= 14 && board.rows <= 22, `rows ${board.rows}`);
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

  test(`${board.name}: Updraft walls and the bird stay on the board, solo and co-op`, () => {
    for (const [mode, { settings }] of Object.entries(UPDRAFT_DIFFICULTIES)) {
      for (const coop of [false, true]) {
        const game = createUpdraft({ ...settings, coop }, seeded(19), board);
        for (let t = 0; t < 300; t++) {
          if (coop && t % 4 === 0) flap(game);
          stepUpdraft(game);
          for (const w of game.walls) assert.ok(w.gapTop >= 0 && w.gapTop + game.settings.gapHeight <= board.rows, `${mode}: gap off board`);
          assert.ok(birdRow(game) >= 0 && birdRow(game) < board.rows);
        }
        assert.ok(game.score > 10, `${mode}/${coop}: only ${game.score} walls`);
        assert.ok(renderUpdraft(game).size > 10, `${mode}/${coop}: barely lit`);
      }
    }
  });

  test(`${board.name}: Rally balls and paddles stay on the board, solo and co-op`, () => {
    for (const [mode, { settings }] of Object.entries(RALLY_DIFFICULTIES)) {
      for (const coop of [false, true]) {
        const game = createRally({ ...settings, coop }, seeded(23), board);
        for (let t = 0; t < 300; t++) {
          if (coop && t % 3 === 0) movePaddle(game, t % 2 ? 1 : -1);
          stepRally(game);
          for (const b of game.balls) assert.ok(b.col > 0 && b.col < board.cols - 1 && b.row >= 0 && b.row < board.rows, `${mode}: ball off board`);
          for (const top of Object.values(game.paddles)) assert.ok(top >= 0 && top + game.settings.paddleRows <= board.rows);
        }
        assert.ok(game.score > (coop ? 4 : 10), `${mode}/${coop}: only ${game.score} returns`); // a co-op player waving at random misses a lot
        assert.ok(renderRally(game).size >= game.settings.paddleRows * 2 + game.balls.length);
      }
    }
  });

  test(`${board.name}: every Maze is solvable, with start and finish on opposite edges`, () => {
    for (const [mode, { settings }] of Object.entries(MAZE_DIFFICULTIES)) {
      for (const coop of [false, true]) {
        const game = createMaze({ ...settings, coop }, seeded(29), board);
        for (let n = 0; n < 4; n++) {
          assert.ok(game.pathLength > 0, `${mode}: no way through`);
          const rows = (holds) => holds.map(([, r]) => r);
          assert.ok(Math.abs(Math.min(...rows(game.start)) - Math.min(...rows(game.finish))) > board.rows / 2, `${mode}: start and finish too close`);
          const frame = renderMaze(game);
          for (const [c, r] of [...game.start, ...game.finish]) assert.notDeepEqual(frame.get(board.gridPosition(c, r)), MAZE_WALL);
          assert.ok([...frame.values()].filter((v) => v === MAZE_WALL).length > board.cols * 2, `${mode}: hardly any walls`);
          if (coop) madeIt(game);
          else while (!advanceMaze(game, 1).scored);
        }
        assert.equal(game.score, 4);
      }
    }
  });
}
