const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, getDashboard, getLeaderboard, getMyMatches } = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/profile', getProfile);
router.patch('/profile', updateProfile);
router.get('/dashboard', getDashboard);
router.get('/leaderboard', getLeaderboard);
router.get('/my-matches', getMyMatches);

module.exports = router;
