const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  keepAlive: true,
  max: 5,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 15000,
});

// ── Test connection ──
pool.connect()
  .then(client => {
    console.log('✅ PostgreSQL connected successfully');
    client.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
  });
  
// ── Graceful shutdown ──
process.on('SIGINT', () => pool.end(() => process.exit(0)));
process.on('SIGTERM', () => pool.end(() => process.exit(0)));

const query = (text, params) => pool.query(text, params);
const getClient = () => pool.connect();

module.exports = { query, getClient, pool };