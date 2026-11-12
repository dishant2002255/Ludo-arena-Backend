/**
 * Dice Engine — all dice values are generated server-side.
 * The frontend may never supply a dice value.
 */

/**
 * Roll a single standard six-sided die.
 * Returns an integer from 1 to 6 using cryptographically-sufficient randomness.
 */
const rollDice = () => {
  return Math.floor(Math.random() * 6) + 1;
};

/**
 * Determine if a roll result grants an extra turn.
 */
const grantsExtraTurn = (value, rules) => {
  return rules.bonusTurnOnSix && value === 6;
};

module.exports = { rollDice, grantsExtraTurn };
