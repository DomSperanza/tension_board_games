// The speed-up every game shares: it starts at its start value, steps evenly towards its top value
// as the climber scores, reaches the top at level TOP_LEVEL and stays there until the climber is out.
// Levels count from 0 internally and are shown as 1..TOP_LEVEL.

export const TOP_LEVEL = 5;

export function rampValue(start, top, level) {
  return start + (top - start) * (Math.min(level, TOP_LEVEL - 1) / (TOP_LEVEL - 1));
}

// Call after the score goes up by one. Returns true when the level went up.
export function levelUp(game, every) {
  if (every <= 0 || game.score % every !== 0 || game.speedLevel >= TOP_LEVEL - 1) return false;
  game.speedLevel += 1;
  return true;
}
