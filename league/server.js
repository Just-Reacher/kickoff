require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const path       = require('path');

// ── DB connection (runs on import — tests connection immediately) ──
require('./config/db');

// ── Route imports ──
const authRoutes     = require('./routes/auth');
const leagueRoutes   = require('./routes/leagues');
const matchRoutes    = require('./routes/matches');
const knockoutRoutes = require('./routes/knockout');

// ── Middleware imports ──
const errorHandler = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 5000;

// ════════════════════════════════
// GLOBAL MIDDLEWARE
// ════════════════════════════════

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // disabled so frontend HTML pages load fine
}));

// CORS — allow frontend to call the API
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL   // set this in .env for production
    : '*'
}));

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging — only in development
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ════════════════════════════════
// SERVE STATIC FRONTEND
// Serves all HTML, JS, assets from /public
// ════════════════════════════════
app.use(express.static(path.join(__dirname, 'public')));

// ════════════════════════════════
// API ROUTES
// ════════════════════════════════
app.use('/api/auth',     authRoutes);
app.use('/api/leagues',  leagueRoutes);
app.use('/api/matches',  matchRoutes);
app.use('/api/knockout', knockoutRoutes);

// ── API health check ──
app.get('/api/health', (req, res) => {
  res.json({
    status:  'ok',
    env:     process.env.NODE_ENV || 'development',
    time:    new Date().toISOString(),
  });
});

// ── Catch-all — serve index.html for any non-API route ──
// This allows the frontend to handle its own navigation
app.get('*', (req, res) => {
  // Don't catch API routes
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ════════════════════════════════
// ERROR HANDLER
// Must be last middleware
// ════════════════════════════════
app.use(errorHandler);

// ════════════════════════════════
// START SERVER
// ════════════════════════════════
app.listen(PORT, () => {
  console.log('');
  console.log('⚽  KickOff server running');
  console.log(`🌍  http://localhost:${PORT}`);
  console.log(`🔧  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
});

module.exports = app;