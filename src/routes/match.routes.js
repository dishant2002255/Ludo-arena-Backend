const express = require('express');
const router = express.Router();
const { getMatches, getMatchById, joinMatch } = require('../controllers/match.controller');
const { authenticate } = require('../middleware/auth');

router.get('/', getMatches);
router.get('/:id', getMatchById);
router.post('/:id/join', authenticate, joinMatch);

module.exports = router;
