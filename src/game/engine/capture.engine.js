/**
 * Capture Engine
 *
 * Determines if a token landing on a cell captures opponent tokens.
 */

const { isSafeCell, isHomeLane } = require('./board.config');

/**
 * Check for captures after a token of `color` lands on `newPosition`.
 *
 * Returns array of captured token descriptors:
 *   [{ color, tokenId }]
 *
 * Rules:
 *  - Can only capture on main track (not home lane, not home base).
 *  - Cannot capture on safe cells.
 *  - Cannot capture own color.
 *  - If 2+ tokens of same opponent color are on the cell, they form a block — no capture.
 */
const checkCaptures = (newPosition, movedColor, allPlayerStates) => {
  // No captures in home lane or home base
  if (isHomeLane(newPosition) || newPosition === -1) return [];

  // No captures on safe cells
  if (isSafeCell(newPosition)) return [];

  const captured = [];

  for (const playerState of allPlayerStates) {
    if (playerState.color === movedColor) continue;

    const tokensOnCell = playerState.tokens.filter(
      (t) => t.position === newPosition && t.state === 'active'
    );

    if (tokensOnCell.length === 0) continue;

    // A block of 2+ same-color tokens cannot be captured
    if (tokensOnCell.length >= 2) continue;

    // Single token — capture it
    captured.push({ color: playerState.color, tokenId: tokensOnCell[0].id });
  }

  return captured;
};

module.exports = { checkCaptures };
