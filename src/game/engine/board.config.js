/**
 * Ludo Board Configuration
 *
 * Standard 15x15 grid with:
 * - 52-cell main track (positions 0-51)
 * - 4 home lanes (positions 100-105 per color, stored as colorOffset+lane)
 * - 4 base areas
 * - Safe cells
 *
 * Starting positions on main track (position 0 = index in 52-cell array):
 *   red:    position 0  (enters at 0)
 *   green:  position 13 (enters at 13)
 *   yellow: position 26 (enters at 26)
 *   blue:   position 39 (enters at 39)
 *
 * Home lane entry (the cell BEFORE entering home lane, 1-indexed from start):
 *   red:    position 51 -> home lane 100-105
 *   green:  position 12 -> home lane 200-205
 *   yellow: position 25 -> home lane 300-305
 *   blue:   position 38 -> home lane 400-405
 */

const BOARD_CONFIG = {
  MAIN_TRACK_LENGTH: 52,
  HOME_LANE_LENGTH: 6,

  // Starting cell on the main 52-cell track where each color enters
  COLOR_START_POSITION: {
    red: 0,
    green: 13,
    yellow: 26,
    blue: 39,
  },

  // The main-track position just before entering the home lane
  HOME_LANE_ENTRY: {
    red: 51,
    green: 12,
    yellow: 25,
    blue: 38,
  },

  // Home lane position base (avoid collision with main track 0-51)
  HOME_LANE_BASE: {
    red: 100,
    green: 200,
    yellow: 300,
    blue: 400,
  },

  // Safe cells on the main 52-cell track (0-indexed)
  SAFE_CELLS: new Set([0, 8, 13, 21, 26, 34, 39, 47]),

  // Star cells (special safe cells in many variants; overlaps with SAFE_CELLS here)
  STAR_CELLS: new Set([8, 21, 34, 47]),
};

/**
 * Convert a main-track absolute position to a color-relative position.
 * Color-relative: 0 = start cell for that color.
 */
const toRelativePosition = (absolutePos, color) => {
  const start = BOARD_CONFIG.COLOR_START_POSITION[color];
  return (absolutePos - start + BOARD_CONFIG.MAIN_TRACK_LENGTH) % BOARD_CONFIG.MAIN_TRACK_LENGTH;
};

/**
 * Convert a color-relative position back to an absolute main-track position.
 */
const toAbsolutePosition = (relativePos, color) => {
  const start = BOARD_CONFIG.COLOR_START_POSITION[color];
  return (start + relativePos) % BOARD_CONFIG.MAIN_TRACK_LENGTH;
};

/**
 * Check if a position is safe.
 */
const isSafeCell = (position) => {
  return BOARD_CONFIG.SAFE_CELLS.has(position);
};

/**
 * Check if a position is in the home lane (>= 100).
 */
const isHomeLane = (position) => position >= 100;

/**
 * Check if a token is at the final home (home lane position 5, 0-indexed from home lane base).
 */
const isFinished = (position, color) => {
  const base = BOARD_CONFIG.HOME_LANE_BASE[color];
  return position === base + 5; // index 5 = final cell
};

module.exports = {
  BOARD_CONFIG,
  toRelativePosition,
  toAbsolutePosition,
  isSafeCell,
  isHomeLane,
  isFinished,
};
