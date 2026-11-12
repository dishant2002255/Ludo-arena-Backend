const express = require('express');
const router = express.Router();
const { getRoomById, getRoomState, reconnectToRoom } = require('../controllers/room.controller');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/:roomId', getRoomById);
router.get('/:roomId/state', getRoomState);
router.post('/:roomId/reconnect', reconnectToRoom);

module.exports = router;
