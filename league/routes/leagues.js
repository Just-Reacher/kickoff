const express  = require('express');
const router   = express.Router();

const { protect }              = require('../middleware/authMiddleware');
const { requireLeagueOwner, requireLeagueMember } = require('../middleware/roleMiddleware');

const {
  createLeague,
  getMyLeagues,
  getLeagueMembers,
  joinLeague,
  startLeague,
  getLeagueTable,
  getLeagueFixtures,
  getLeagueResults,
  getMyTeam,
} = require('../controllers/leagueController');

// All league routes require authentication
router.use(protect);

// ── League creation & discovery ──
router.post('/',         createLeague);   // POST   /api/leagues
router.get('/mine',      getMyLeagues);   // GET    /api/leagues/mine
router.post('/join',     joinLeague);     // POST   /api/leagues/join

// ── League-scoped routes ──
router.get('/:leagueId/members',  requireLeagueMember, getLeagueMembers);   // GET  /api/leagues/:leagueId/members
router.post('/:leagueId/start',   requireLeagueOwner,  startLeague);        // POST /api/leagues/:leagueId/start
router.get('/:leagueId/table',    requireLeagueMember, getLeagueTable);     // GET  /api/leagues/:leagueId/table
router.get('/:leagueId/fixtures', requireLeagueMember, getLeagueFixtures);  // GET  /api/leagues/:leagueId/fixtures
router.get('/:leagueId/results',  requireLeagueMember, getLeagueResults);   // GET  /api/leagues/:leagueId/results
router.get('/:leagueId/my-team',  requireLeagueMember, getMyTeam);          // GET  /api/leagues/:leagueId/my-team

module.exports = router;