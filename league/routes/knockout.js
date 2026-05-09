const express = require('express');
const router  = express.Router();

const { protect }             = require('../middleware/authMiddleware');
const { requireLeagueMember, requireLeagueOwner } = require('../middleware/roleMiddleware');

const {
  getKnockout,
  generateKnockout,
  submitKnockoutResult,
  approveKnockoutResult,
  rejectKnockoutResult,
} = require('../controllers/knockoutController');

router.use(protect);

// GET  /api/knockout/:leagueId          — get full bracket
router.get('/:leagueId',                requireLeagueMember, getKnockout);

// POST /api/knockout/:leagueId/generate — owner generates bracket after league phase
router.post('/:leagueId/generate',      requireLeagueOwner,  generateKnockout);

// POST /api/knockout/:leagueId/matches/:matchId/result  — player submits score
router.post('/:leagueId/matches/:matchId/result',  requireLeagueMember, submitKnockoutResult);

// POST /api/knockout/:leagueId/matches/:matchId/approve — owner approves
router.post('/:leagueId/matches/:matchId/approve', requireLeagueOwner,  approveKnockoutResult);

// POST /api/knockout/:leagueId/matches/:matchId/reject  — owner rejects
router.post('/:leagueId/matches/:matchId/reject',  requireLeagueOwner,  rejectKnockoutResult);

module.exports = router;