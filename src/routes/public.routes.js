const express = require('express');
const router = express.Router();
const SystemSettings = require('../models/SystemSettings');
const { success } = require('../utils/apiResponse');

// Public: is fake activity enabled?
router.get('/live-feed/status', async (req, res) => {
  try {
    const s = await SystemSettings.getSettings();
    return success(res, { fakeActivityEnabled: s.fakeActivityEnabled });
  } catch {
    return success(res, { fakeActivityEnabled: true });
  }
});

module.exports = router;
