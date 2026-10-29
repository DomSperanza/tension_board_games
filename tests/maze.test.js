import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BOARD } from '../src/js/layout.js';
import { createMaze, advanceMaze, renderMaze, madeIt, finishColor, MAZE_DIFFICULTIES, FINISH_COLOR, HURRY_COLOR, START_COLOR } from '../src/js/maze.js';

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

// Every corridor hold can be reached from the start: no sealed-off pockets.
function reachable(game) {
  const [c0, r0] = game.start[0];
  const seen = new Set([`${c0},${r0}`]);
  const queue = [[c0, r0]];
  while (queue.length) {
    const [c, r] = queue.shift();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${c + dc},${r + dr}`;
      if (game.path.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push([c + dc, r + dr]);
      }
    }
  }
  return seen.size;
}

test('the whole maze is connected, without loops when none are asked for', () => {
  for (const corridor of [1, 2]) {
    const game = createMaze({ corridor, loops: 0 }, seeded(corridor));
    assert.equal(reachable(game), game.path.size);
    // A perfect maze on an nx × ny cell grid knocks out exactly nx·ny − 1 walls.
    const pitch = corridor + 1;
    const nx = Math.floor((DEFAULT_BOARD.cols + 1) / pitch);
    const ny = Math.floor((DEFAULT_BOARD.rows + 1) / pitch);
    assert.equal(game.path.size, nx * ny * corridor * corridor + (nx * ny - 1) * corridor);
  }
});

test('the first maze climbs from the bottom; the next starts at its finish and climbs down', () => {
  const game = createMaze({ corridor: 2 }, seeded(3));
  const rows = (holds) => holds.map(([, r]) => r);
  assert.equal(Math.max(...rows(game.start)), DEFAULT_BOARD.rows - 1);
  assert.ok(Math.min(...rows(game.finish)) <= 2);
  const finish = game.finish.map(([c]) => c);
  madeIt(game);
  assert.deepEqual(game.start.map(([c]) => c), finish, 'starts where the climber is');
  assert.ok(Math.min(...rows(game.start)) <= 2);
  assert.equal(Math.max(...rows(game.finish)), DEFAULT_BOARD.rows - 1);
});

test('time follows the path length and shrinks to the level-5 rate', () => {
  const game = createMaze({ secondsPerHold: 2, minSecondsPerHold: 1, speedUpEvery: 1 }, seeded(5));
  assert.equal(game.timeLimit, 5 + game.pathLength * 2);
  for (let i = 0; i < 6; i++) madeIt(game);
  assert.equal(game.secondsPerHold, 1);
  assert.equal(game.timeLimit, 5 + game.pathLength);
});

test('solo: the finish turns yellow, flashes, then the maze is scored when time runs out', () => {
  const game = createMaze({}, seeded(7));
  assert.deepEqual(finishColor(game), FINISH_COLOR);
  game.timeLeft = game.timeLimit * 0.3;
  assert.deepEqual(finishColor(game), HURRY_COLOR);
  game.timeLeft = game.timeLimit * 0.1;
  const flashes = [0, 0.5, 1, 1.5].map((t) => finishColor({ ...game, timeLeft: Math.floor(game.timeLeft) + t }));
  assert.ok(flashes.includes(null) && flashes.some((c) => c === HURRY_COLOR), 'flashes on and off');
  game.timeLeft = 0.2;
  assert.equal(advanceMaze(game, 0.25).scored, true);
  assert.equal(game.score, 1);
});

test('co-op: no timer, the partner scores the maze', () => {
  const game = createMaze({ coop: true }, seeded(9));
  for (let t = 0; t < 1000; t++) assert.equal(advanceMaze(game, 1).scored, false);
  assert.deepEqual(finishColor(game), FINISH_COLOR);
  madeIt(game);
  assert.equal(game.score, 1);
});

test('start and finish are lit and corridors stay dark', () => {
  const game = createMaze({ corridor: 2 }, seeded(11));
  const frame = renderMaze(game);
  for (const [c, r] of game.start) assert.deepEqual(frame.get(DEFAULT_BOARD.gridPosition(c, r)), START_COLOR);
  for (const k of game.path) {
    const [c, r] = k.split(',').map(Number);
    const isEnd = [...game.start, ...game.finish].some(([a, b]) => a === c && b === r);
    if (!isEnd) assert.equal(frame.has(DEFAULT_BOARD.gridPosition(c, r)), false, `corridor ${k} lit`);
  }
});
