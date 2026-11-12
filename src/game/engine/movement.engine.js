/**
 * Movement Engine
 *
 * Computes new token positions given current position, dice value, and color.
 * Does NOT mutate state — returns a new position value.
 */

const {
  BOARD_CONFIG,
  toRelativePosition,
  toAbsolutePosition,
  isHomeLane,
  isFinished,
} = require('./board.config');

/**
 * Calculate the resulting position after moving `steps` from `currentPosition`
 * for the given `color`.
 *
 * Returns:
 *   { newPosition, isFinished, isValid }
 *
 * - If the token cannot legally make the move (would overshoot home), returns isValid: false.
 * - isFinished: true means the token has reached the final home cell.
 */
const calculateNewPosition = (currentPosition, steps, color) => {
  const homeLaneBase = BOARD_CONFIG.HOME_LANE_BASE[color];
  const homeLaneEntry = BOARD_CONFIG.HOME_LANE_ENTRY[color];

  // Token is in home base (not yet on board)
  if (currentPosition === -1) {
    // Only a 6 can take it out; the caller is responsible for checking this
    // If steps === 6, place on start cell
    if (steps === 6) {
      const startPos = BOARD_CONFIG.COLOR_START_POSITION[color];
      return { newPosition: startPos, finished: false, valid: true };
    }
    return { newPosition: -1, finished: false, valid: false };
  }

  // Token is in home lane
  if (isHomeLane(currentPosition)) {
    const laneIndex = currentPosition - homeLaneBase; // 0-5
    const newLaneIndex = laneIndex + steps;
    if (newLaneIndex > 5) {
      // Overshoot — invalid move
      return { newPosition: currentPosition, finished: false, valid: false };
    }
    if (newLaneIndex === 5) {
      return { newPosition: homeLaneBase + 5, finished: true, valid: true };
    }
    return { newPosition: homeLaneBase + newLaneIndex, finished: false, valid: true };
  }

  // Token is on main track
  const relativePos = toRelativePosition(currentPosition, color);
  const newRelativePos = relativePos + steps;

  if (newRelativePos === 51) {
    // Just reached the home lane entry cell, move into home lane start (index 0)
    return { newPosition: homeLaneBase + 0, finished: false, valid: true };
  }

  if (newRelativePos > 51) {
    // Has to pass through home lane entry
    const overshoot = newRelativePos - 51;
    const newLaneIndex = overshoot - 1; // 0-based lane index
    if (newLaneIndex > 5) {
      return { newPosition: currentPosition, finished: false, valid: false };
    }
    if (newLaneIndex === 5) {
      return { newPosition: homeLaneBase + 5, finished: true, valid: true };
    }
    return { newPosition: homeLaneBase + newLaneIndex, finished: false, valid: true };
  }

  // Normal main-track movement
  const newAbsolutePos = toAbsolutePosition(newRelativePos, color);
  return { newPosition: newAbsolutePos, finished: false, valid: true };
};

module.exports = { calculateNewPosition };
