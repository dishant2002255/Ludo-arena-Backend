/**
 * Game Engine — Main Orchestrator
 *
 * Ties together dice, movement, capture, turn, and winning engines.
 * All public methods return { success, newState, events, error }.
 */

const { rollDice, grantsExtraTurn } = require('./dice.engine');
const { calculateNewPosition } = require('./movement.engine');
const { checkCaptures } = require('./capture.engine');
const { getNextTurn, shouldRollAgain, isConsecutiveSixForfeit } = require('./turn.engine');
const { getWinner } = require('./winning.engine');
const { BOARD_CONFIG } = require('./board.config');

/**
 * Deep-clone a game state object (plain JS object, not Mongoose doc).
 */
const cloneState = (state) => JSON.parse(JSON.stringify(state));

/**
 * Get movable tokens for a player given the dice value.
 */
const getMovableTokens = (playerState, diceValue, rules) => {
  return playerState.tokens.filter((token) => {
    if (token.state === 'finished') return false;

    // Token in home base — only a 6 can move it out
    if (token.state === 'home') {
      return diceValue === 6 && rules.requireSixToStart;
    }

    // Token on board — check if move is valid (won't overshoot)
    const { valid } = calculateNewPosition(token.position, diceValue, playerState.color);
    return valid;
  });
};

/**
 * Process a dice roll for the current player.
 * Returns updated state and dice value.
 */
const processRoll = (gameState, rules) => {
  const state = cloneState(gameState);

  if (state.diceRolled) {
    return { success: false, error: 'Dice already rolled this turn' };
  }

  const diceValue = rollDice();
  state.lastDiceValue = diceValue;
  state.diceRolled = true;

  // Track consecutive sixes
  if (diceValue === 6) {
    state.consecutiveSixes = (state.consecutiveSixes || 0) + 1;
  } else {
    state.consecutiveSixes = 0;
  }

  const currentPlayerState = state.players.find((p) => p.color === state.currentTurn);
  const movableTokens = getMovableTokens(currentPlayerState, diceValue, rules);

  // If forfeited due to 3 sixes, skip turn immediately
  if (isConsecutiveSixForfeit(state.consecutiveSixes, rules)) {
    state.consecutiveSixes = 0;
    const finishedColors = state.players.filter((p) => p.hasFinished).map((p) => p.color);
    state.currentTurn = getNextTurn(state.currentTurn, state.turnOrder, finishedColors);
    state.diceRolled = false;
    return {
      success: true,
      newState: state,
      diceValue,
      movableTokens: [],
      forfeit: true,
      events: [{ type: 'turn_forfeit', reason: 'three_consecutive_sixes', color: state.currentTurn }],
    };
  }

  // No movable tokens — auto-skip turn
  if (movableTokens.length === 0) {
    const finishedColors = state.players.filter((p) => p.hasFinished).map((p) => p.color);
    state.currentTurn = getNextTurn(state.currentTurn, state.turnOrder, finishedColors);
    state.consecutiveSixes = 0;
    state.diceRolled = false;
    return {
      success: true,
      newState: state,
      diceValue,
      movableTokens: [],
      autoSkip: true,
      events: [{ type: 'turn_skipped', color: state.currentTurn }],
    };
  }

  return {
    success: true,
    newState: state,
    diceValue,
    movableTokens: movableTokens.map((t) => t.id),
    events: [],
  };
};

/**
 * Process a token move chosen by the current player.
 */
const processMove = (gameState, tokenId, rules) => {
  const state = cloneState(gameState);

  if (!state.diceRolled) {
    return { success: false, error: 'Roll dice first' };
  }

  const currentPlayerState = state.players.find((p) => p.color === state.currentTurn);
  if (!currentPlayerState) {
    return { success: false, error: 'Current player not found' };
  }

  const token = currentPlayerState.tokens.find((t) => t.id === tokenId);
  if (!token) {
    return { success: false, error: 'Token not found' };
  }

  if (token.state === 'finished') {
    return { success: false, error: 'Token already finished' };
  }

  const diceValue = state.lastDiceValue;
  const events = [];

  // Token entering from base
  if (token.state === 'home') {
    if (diceValue !== 6) {
      return { success: false, error: 'Need a 6 to move token out of base' };
    }
    const startPos = BOARD_CONFIG.COLOR_START_POSITION[currentPlayerState.color];
    token.position = startPos;
    token.state = 'active';
    events.push({
      type: 'token_entered',
      color: currentPlayerState.color,
      tokenId,
      position: startPos,
    });
  } else {
    // Normal move
    const result = calculateNewPosition(token.position, diceValue, currentPlayerState.color);
    if (!result.valid) {
      return { success: false, error: 'Invalid move' };
    }

    const prevPosition = token.position;
    token.position = result.newPosition;

    if (result.finished) {
      token.state = 'finished';
      currentPlayerState.finishedTokens = (currentPlayerState.finishedTokens || 0) + 1;
      events.push({
        type: 'token_finished',
        color: currentPlayerState.color,
        tokenId,
        position: result.newPosition,
      });
    } else {
      events.push({
        type: 'token_moved',
        color: currentPlayerState.color,
        tokenId,
        from: prevPosition,
        to: result.newPosition,
      });
    }

    // Check captures (only on main track)
    if (!result.finished) {
      const captures = checkCaptures(result.newPosition, currentPlayerState.color, state.players);
      for (const cap of captures) {
        const capPlayerState = state.players.find((p) => p.color === cap.color);
        const capToken = capPlayerState.tokens.find((t) => t.id === cap.tokenId);
        capToken.position = -1;
        capToken.state = 'home';
        events.push({
          type: 'token_captured',
          capturedColor: cap.color,
          capturedTokenId: cap.tokenId,
          byColor: currentPlayerState.color,
          byTokenId: tokenId,
        });
      }
    }
  }

  // Check for winner
  const winner = getWinner(state.players);
  if (winner) {
    state.status = 'completed';
    state.winner = winner.user;
    state.winnerColor = winner.color;
    winner.hasFinished = true;
    winner.rank = 1;
    state.diceRolled = false;
    events.push({ type: 'game_finished', winnerColor: winner.color, winnerId: winner.user });
    return { success: true, newState: state, events, gameFinished: true };
  }

  // Determine if player gets another turn
  const captured = events.filter((e) => e.type === 'token_captured');
  if (shouldRollAgain(diceValue, captured, rules)) {
    // Same player rolls again
    state.diceRolled = false;
    if (diceValue !== 6) {
      state.consecutiveSixes = 0;
    }
    events.push({ type: 'extra_turn', color: currentPlayerState.color });
  } else {
    // Advance turn
    const finishedColors = state.players.filter((p) => p.hasFinished).map((p) => p.color);
    state.currentTurn = getNextTurn(state.currentTurn, state.turnOrder, finishedColors);
    state.consecutiveSixes = 0;
    state.diceRolled = false;
    events.push({ type: 'turn_changed', nextColor: state.currentTurn });
  }

  state.turnStartedAt = new Date();
  return { success: true, newState: state, events, gameFinished: false };
};

/**
 * Initialise a fresh game state object (plain JS, to be persisted by service layer).
 */
const initGameState = (players) => {
  const colors = ['red', 'green', 'yellow', 'blue'];
  const playerStates = players.map((p, i) => ({
    user: p.userId,
    color: p.color,
    tokens: [0, 1, 2, 3].map((id) => ({ id, state: 'home', position: -1 })),
    finishedTokens: 0,
    hasFinished: false,
    rank: null,
  }));

  return {
    players: playerStates,
    currentTurn: players[0].color,
    currentTurnUserId: players[0].userId,
    turnOrder: players.map((p) => p.color),
    lastDiceValue: null,
    diceRolled: false,
    consecutiveSixes: 0,
    status: 'in_progress',
    winner: null,
    winnerColor: null,
    turnStartedAt: new Date(),
    version: 0,
  };
};

module.exports = { processRoll, processMove, initGameState, getMovableTokens };
