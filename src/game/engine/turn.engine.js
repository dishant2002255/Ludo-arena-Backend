/**
 * Turn Engine
 *
 * Manages turn order and transition logic.
 */

/**
 * Get the color of the next player after `currentColor` in the turn order.
 * Skips players who have already finished all tokens.
 */
const getNextTurn = (currentColor, turnOrder, finishedPlayers) => {
  const activePlayers = turnOrder.filter((c) => !finishedPlayers.includes(c));
  if (activePlayers.length === 0) return null;
  const idx = activePlayers.indexOf(currentColor);
  return activePlayers[(idx + 1) % activePlayers.length];
};

/**
 * Check if the current player should roll again (extra turn).
 */
const shouldRollAgain = (diceValue, captured, rules) => {
  if (rules.bonusTurnOnSix && diceValue === 6) return true;
  if (rules.bonusTurnOnCapture && captured.length > 0) return true;
  return false;
};

/**
 * Check if too many consecutive sixes were rolled (forfeit turn).
 */
const isConsecutiveSixForfeit = (consecutiveSixes, rules) => {
  return consecutiveSixes >= rules.maxConsecutiveSixes;
};

module.exports = { getNextTurn, shouldRollAgain, isConsecutiveSixForfeit };
