/**
 * Migration to create the session table for PostgreSQL
 * This script can be run manually to set up the session table
 */
const { Pool } = require('pg');
require('dotenv').config();

async function createSessionTable() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    // Create the session table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
      );
      
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");
    `);
    
    console.log('Session table created or verified');
  } catch (error) {
    console.error('Failed to create session table:', error);
  } finally {
    await pool.end();
  }
}

// Run if this script is executed directly
if (require.main === module) {
  createSessionTable()
    .then(() => console.log('Migration complete'))
    .catch(err => console.error('Migration failed:', err));
}

module.exports = { createSessionTable };
