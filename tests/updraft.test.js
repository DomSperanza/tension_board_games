import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BOARD, getBoard } from '../src/js/layout.js';
import {
  createUpdraft,
  stepUpdraft,
  renderUpdraft,
  wallPositions,
  flap,
  birdRow,
  UPDRAFT_DIFFICULTIES,
  WALL_COLOR,
  BIRD_COLOR,
} from '../src/js/updraft.js';

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

test('walls form at the right edge and drift left one column per step', () => {
  const game = createUpdraft({ wallSpacing: 8 }, seeded());
  stepUpdraft(game);
  assert.equal(game.walls.length, 1);
  assert.equal(game.walls[0].col, DEFAULT_BOARD.cols - 1);
  for (let t = 0; t < 7; t++) stepUpdraft(game);
  assert.equal(game.walls.length, 1);
  assert.equal(game.walls[0].col, DEFAULT_BOARD.cols - 8);
  stepUpdraft(game);
  assert.equal(game.walls.length, 2, 'next wall eight columns behind');
});

test('a wall scores when it leaves the left edge', () => {
  const game = createUpdraft({ wallSpacing: 100 }, seeded());
  stepUpdraft(game);
  let steps = 0;
  while (!stepUpdraft(game).scored) steps += 1;
  assert.equal(steps, DEFAULT_BOARD.cols); // its right column leaves one step after its left
  assert.equal(game.score, 1);
  assert.equal(game.walls.length, 0);
});

test('a wall lights everything in its two columns except the gap', () => {
  const game = createUpdraft({ gapHeight: 6 }, seeded());
  const wall = { col: 4, gapTop: 5 };
  const lit = new Set(wallPositions(wall, game));
  const { gridPosition } = DEFAULT_BOARD;
  for (let row = 0; row < DEFAULT_BOARD.rows; row++) {
    const inGap = row >= 5 && row < 11;
    for (const col of [4, 5]) {
      const pos = gridPosition(col, row);
      if (pos !== undefined) assert.equal(lit.has(pos), !inGap, `col ${col} row ${row}`);
    }
    assert.ok(!lit.has(gridPosition(3, row)) && !lit.has(gridPosition(6, row)), 'only its own columns');
  }
});

test('solo: gaps never jump further than maxShift and the bird stays in them', () => {
  for (const [mode, { settings }] of Object.entries(UPDRAFT_DIFFICULTIES)) {
    const game = createUpdraft(settings, seeded(mode.length));
    const tops = new Set();
    let last = null;
    for (let t = 0; t < 1000; t++) {
      stepUpdraft(game);
      if (game.stepsSinceSpawn !== 0) continue;
      const { gapTop } = game.walls.at(-1);
      const { gapHeight, maxShift } = game.settings;
      if (last !== null) assert.ok(Math.abs(gapTop - last) <= maxShift, `${mode}: gap jumped`);
      assert.ok(gapTop >= 0 && gapTop + gapHeight <= game.board.rows, `${mode}: gap off board`);
      assert.ok(birdRow(game) >= gapTop && birdRow(game) < gapTop + gapHeight, `${mode}: bird outside its gap`);
      tops.add(gapTop);
      last = gapTop;
    }
    assert.ok(tops.size >= 4, `${mode}: gaps hardly move`);
    assert.ok(game.score > 50, `${mode}: only ${game.score} walls`);
    assert.ok(game.speedLevel === 4, `${mode}: never reached top speed`);
    assert.equal(game.rowSeconds, game.settings.minRowSeconds);
  }
});

test('co-op: a flap lifts the bird, gravity brings it down, and the gap follows it', () => {
  const game = createUpdraft({ coop: true, wallSpacing: 100 }, seeded());
  stepUpdraft(game);
  const start = game.birdY;
  flap(game);
  stepUpdraft(game);
  assert.ok(game.birdY < start, 'flap lifts');
  for (let t = 0; t < 30; t++) stepUpdraft(game);
  assert.equal(birdRow(game), game.board.rows - 1, 'sinks to the bottom without flaps');
  game.stepsSinceSpawn = 100;
  stepUpdraft(game);
  const wall = game.walls.at(-1);
  assert.equal(wall.gapTop + game.settings.gapHeight, game.board.rows, 'gap at the bottom, where the bird is');
  for (let t = 0; t < 40; t++) {
    flap(game);
    stepUpdraft(game);
  }
  assert.equal(birdRow(game), 0, 'flapping hard takes it to the top, not off the board');
});

test('the bird is drawn over the walls in its own color', () => {
  const game = createUpdraft({}, seeded());
  for (let t = 0; t < 12; t++) stepUpdraft(game);
  const frame = renderUpdraft(game);
  const bird = DEFAULT_BOARD.gridPosition(DEFAULT_BOARD.cols - 1, birdRow(game));
  assert.deepEqual(frame.get(bird), BIRD_COLOR);
  assert.ok([...frame.values()].filter((c) => c === WALL_COLOR).length > 20);
});

test('gaps shrink to fit short boards', () => {
  const board = getBoard(5);
  const game = createUpdraft({ gapHeight: 30 }, seeded(), board);
  assert.equal(game.settings.gapHeight, board.rows - 4);
});
