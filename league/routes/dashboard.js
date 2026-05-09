const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    res.json({
      leagues: [],
      recentResults: [],
      pendingApprovals: [],
      notifications: [],
      totalMatches: 0,
      ownedLeagues: 0
    });
  } catch (err) {
    res.status(500).json({ message: 'Dashboard error' });
  }
});

module.exports = router;