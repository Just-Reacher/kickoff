const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,

    
keepAlive: true,
  max: 5,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 15000,
});

// ── Test connection on startup ──
pool.query('SELECT NOW()')
  .then(() => {
    console.log('✅ PostgreSQL connected successfully');
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  });

// ── Graceful shutdown ──
process.on('SIGINT',  () => pool.end(() => process.exit(0)));
process.on('SIGTERM', () => pool.end(() => process.exit(0)));

/**
 * Run a parameterised query.
 * Usage: db.query('SELECT * FROM users WHERE id = $1', [userId])
 */
const query = (text, params) => pool.query(text, params);

/**
 * Get a client from the pool for transactions.
 * Always call client.release() in a finally block.
 *
 * Usage:
 *   const client = await db.getClient();
 *   try {
 *     await client.query('BEGIN');
 *     await client.query(...);
 *     await client.query('COMMIT');
 *   } catch (err) {
 *     await client.query('ROLLBACK');
 *     throw err;
 *   } finally {
 *     client.release();
 *   }
 */
const getClient = () => pool.connect();

module.exports = { query, getClient, pool };