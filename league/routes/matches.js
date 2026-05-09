const express  = require('express');
const router   = express.Router();

const { protect }                                          = require('../middleware/authMiddleware');
const { requireLeagueMember, requireLeagueOwner }         = require('../middleware/roleMiddleware');
const { submitResult, approveResult, rejectResult }       = require('../controllers/matchController');

// All match routes require authentication
router.use(protect);

// POST /api/matches/:matchId/result   — player submits a score
router.post('/:matchId/result',  submitResult);

// POST /api/matches/:matchId/approve  — owner approves a pending result
router.post('/:matchId/approve', approveResult);

// POST /api/matches/:matchId/reject   — owner rejects a pending result
router.post('/:matchId/reject',  rejectResult);

module.exports = router;