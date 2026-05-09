const db = require('../config/db');

/**
 * generateInviteCode
 * Generates a unique invite code in format KO-XXXXX
 * Checks DB to ensure no collision before returning.
 */
const generateInviteCode = async () => {
  const prefix = process.env.INVITE_CODE_PREFIX || 'KO';
  const length = parseInt(process.env.INVITE_CODE_LENGTH || '5');
  const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion

  let code;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    let random = '';
    for (let i = 0; i < length; i++) {
      random += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code = `${prefix}-${random}`;

    // Check uniqueness
    const result = await db.query(
      'SELECT id FROM leagues WHERE invite_code = $1',
      [code]
    );

    if (result.rows.length === 0) return code;
    attempts++;
  }

  throw new Error('Failed to generate a unique invite code after 10 attempts.');
};

module.exports = generateInviteCode;