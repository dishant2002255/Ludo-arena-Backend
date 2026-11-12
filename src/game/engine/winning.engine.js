/**
 * Winning Engine
 *
 * Determines if a player has won or if the game is over.
 */

/**
 * Check if a player has won (all 4 tokens are in the finished state).
 */
const hasPlayerWon = (playerState) => {
  return playerState.tokens.every((t) => t.state === 'finished');
};

/**
 * Return the winning player state, or null.
 */
const getWinner = (allPlayerStates) => {
  return allPlayerStates.find(hasPlayerWon) || null;
};

/**
 * Count how many players have finished all tokens (for ranking).
 */
const countFinishedPlayers = (allPlayerStates) => {
  return allPlayerStates.filter(hasPlayerWon).length;
};

module.exports = { hasPlayerWon, getWinner, countFinishedPlayers };
