// Barrage game state. Pure logic: no timers, DOM or Bluetooth here.
//
// A formation of aliens marches back and forth along the top of the wall, dropping red bolts.
// Bolts are lava: traverse out of their way. Every bolt that falls off the bottom scores a point.
// Co-op: a second player on the phone steers a cannon along the bottom row and fires upwards.
// A shot destroys the first alien or bolt it meets (a point per alien); clear the wave and a new one arrives.
// Everything speeds up in steps to top speed at level 5. Honor system: touched a bolt = out.

import { DEFAULT_BOARD } from './layout.js';
import { rampValue, levelUp } from './ramp.js';

export const BARRAGE_DEFAULTS = {
  rowSeconds: 0.45, // time per step (bolts fall one row) at the start
  minRowSeconds: 0.28, // ...and at top speed (level 5)
  speedUpEvery: 6, // points between speed-ups (0 = never)
  fireChance: 0.2, // chance an alien fires on each step
  volleyEvery: 30, // steps between the whole formation firing at once (0 = never)
  alienRows: 1,
  marchEvery: 2, // steps between formation moves
  coop: false, // a second player fires back from the phone
};

export const BARRAGE_DIFFICULTIES = {
  beginner: {
    label: 'Beginner',
    settings: { rowSeconds: 0.6, minRowSeconds: 0.4, speedUpEvery: 6, fireChance: 0.12, volleyEvery: 0, alienRows: 1, marchEvery: 3 },
  },
  intermediate: {
    label: 'Intermediate',
    settings: { rowSeconds: 0.45, minRowSeconds: 0.28, speedUpEvery: 6, fireChance: 0.2, volleyEvery: 30, alienRows: 1, marchEvery: 2 },
  },
  hard: {
    label: 'Hard',
    settings: { rowSeconds: 0.35, minRowSeconds: 0.22, speedUpEvery: 5, fireChance: 0.28, volleyEvery: 24, alienRows: 2, marchEvery: 2 },
  },
  impossible: {
    label: 'Impossible',
    settings: { rowSeconds: 0.28, minRowSeconds: 0.16, speedUpEvery: 5, fireChance: 0.38, volleyEvery: 18, alienRows: 2, marchEvery: 1 },
  },
};

export const ALIEN_COLOR = [170, 0, 255];
export const BOLT_COLOR = [255, 0, 0];
export const CANNON_COLOR = [0, 200, 255];
export const SHOT_COLOR = [255, 255, 255];

const ALIEN_SPACING = 3; // columns between aliens in a row; the second row sits one column over
const SHOT_SPEED = 2; // rows a co-op shot climbs per step
const MAX_SHOTS = 2;

export function createBarrage(settings = BARRAGE_DEFAULTS, random = Math.random, board = DEFAULT_BOARD) {
  const s = { ...BARRAGE_DEFAULTS, ...settings };
  s.minRowSeconds = Math.min(s.minRowSeconds, s.rowSeconds); // custom mode can set these in any order
  s.alienRows = Math.max(1, Math.min(2, Math.round(s.alienRows)));
  s.marchEvery = Math.max(1, Math.round(s.marchEvery));
  const game = {
    settings: s,
    board,
    random,
    score: 0,
    kills: 0,
    wave: 1,
    speedLevel: 0,
    rowSeconds: s.rowSeconds,
    steps: 0,
    aliens: [],
    formationCol: 0,
    marchDir: 1,
    marchRange: 0,
    bolts: [], // { col, row }: a bolt covers rows row - 1 and row, falling
    shots: [], // { col, row }: co-op shots, climbing
    cannon: Math.floor(board.cols / 2),
  };
  spawnWave(game);
  return game;
}

// Aliens fill the board minus a margin they march across.
function spawnWave(game) {
  const { cols } = game.board;
  game.marchRange = Math.max(1, Math.floor(cols / 4));
  const width = cols - game.marchRange;
  game.aliens = [];
  for (let r = 0; r < game.settings.alienRows; r++) {
    for (let c = r; c < width; c += ALIEN_SPACING) game.aliens.push({ col: c, row: r * 2, alive: true });
  }
  game.formationCol = 0;
  game.marchDir = 1;
}

export const alienCol = (game, alien) => game.formationCol + alien.col;
export const aliveAliens = (game) => game.aliens.filter((a) => a.alive);

function addPoint(game) {
  game.score += 1;
  const { speedUpEvery, rowSeconds, minRowSeconds } = game.settings;
  if (levelUp(game, speedUpEvery)) game.rowSeconds = rampValue(rowSeconds, minRowSeconds, game.speedLevel);
}

// A shot meeting a bolt knocks both out; a shot reaching an alien destroys it.
function collide(game) {
  game.shots = game.shots.filter((shot) => {
    const bolt = game.bolts.findIndex((b) => b.col === shot.col && shot.row >= b.row - 1 && shot.row <= b.row);
    if (bolt >= 0) {
      game.bolts.splice(bolt, 1);
      return false;
    }
    const alien = game.aliens.find((a) => a.alive && a.row === shot.row && alienCol(game, a) === shot.col);
    if (!alien) return true;
    alien.alive = false;
    game.kills += 1;
    addPoint(game);
    return false;
  });
}

function fire(game, alien) {
  const col = alienCol(game, alien);
  if (game.bolts.some((b) => b.col === col && b.row < alien.row + 4)) return; // one bolt at a time per barrel
  game.bolts.push({ col, row: alien.row + 2 });
}

// One step: bolts fall, shots climb, the formation marches and fires. Returns { scored }.
export function stepBarrage(game) {
  const s = game.settings;
  const scoreBefore = game.score;
  game.steps += 1;

  for (const b of game.bolts) b.row += 1;
  collide(game);
  const before = game.bolts.length;
  game.bolts = game.bolts.filter((b) => b.row - 1 < game.board.rows);
  for (let i = before - game.bolts.length; i > 0; i--) addPoint(game);

  // Climb one row at a time so a shot can't skip past a bolt or alien.
  for (let i = 0; i < SHOT_SPEED && game.shots.length; i++) {
    for (const shot of game.shots) shot.row -= 1;
    collide(game);
  }
  game.shots = game.shots.filter((shot) => shot.row >= 0);

  if (game.steps % s.marchEvery === 0) {
    const next = game.formationCol + game.marchDir;
    if (next < 0 || next > game.marchRange) game.marchDir = -game.marchDir;
    else game.formationCol = next;
    collide(game);
  }

  const alive = aliveAliens(game);
  if (alive.length === 0) {
    game.wave += 1;
    spawnWave(game);
  } else if (s.volleyEvery > 0 && game.steps % s.volleyEvery === 0) {
    for (const alien of alive) fire(game, alien);
  } else if (game.random() < s.fireChance) {
    fire(game, alive[Math.floor(game.random() * alive.length)]);
  }
  return { scored: game.score > scoreBefore };
}

// Co-op controls.
export function moveCannon(game, dir) {
  game.cannon = Math.max(0, Math.min(game.board.cols - 1, game.cannon + dir));
}

export function fireCannon(game) {
  if (game.shots.length >= MAX_SHOTS) return false;
  game.shots.push({ col: game.cannon, row: game.board.rows - 2 });
  collide(game);
  return true;
}

// Bolts go on last so they're never hidden: they're the lava.
export function renderBarrage(game) {
  const { board } = game;
  const frame = new Map();
  const light = (x, y, color) => {
    const pos = board.holeAt(x, y);
    if (pos !== undefined) frame.set(pos, color);
  };
  for (const alien of aliveAliens(game)) {
    const x = board.colToX(alienCol(game, alien));
    const y = board.rowToY(alien.row);
    light(x, y, ALIEN_COLOR);
    light(x - 4, y - 4, ALIEN_COLOR); // legs on the offset holds below
    light(x + 4, y - 4, ALIEN_COLOR);
  }
  if (game.settings.coop) {
    const x = board.colToX(game.cannon);
    const y = board.rowToY(board.rows - 1);
    light(x, y, CANNON_COLOR);
    light(x - 4, y + 4, CANNON_COLOR);
    light(x + 4, y + 4, CANNON_COLOR);
    for (const shot of game.shots) light(board.colToX(shot.col), board.rowToY(shot.row), SHOT_COLOR);
  }
  for (const bolt of game.bolts) {
    const x = board.colToX(bolt.col);
    const yHead = board.rowToY(bolt.row);
    light(x, yHead, BOLT_COLOR);
    light(x, yHead + 8, BOLT_COLOR);
    light(x - 4, yHead + 4, BOLT_COLOR); // the offset holds either side make it a bolt, not a dot
    light(x + 4, yHead + 4, BOLT_COLOR);
  }
  return frame;
}

export const barrageMessage = (game) => (game.settings.coop ? `Wave ${game.wave}` : 'Dodge!');
