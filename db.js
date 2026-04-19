// db.js — Postgres connection pool
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('[db] ERROR: DATABASE_URL environment variable is required.');
  console.error('[db] On Railway: add a Postgres plugin, then reference ${{Postgres.DATABASE_URL}}');
  console.error('[db] Locally: run `docker run -d --name pg -e POSTGRES_PASSWORD=pg -p 5432:5432 postgres:16`');
  console.error('[db]           then set DATABASE_URL=postgres://postgres:pg@localhost:5432/postgres');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false }
});

pool.on('error', err => console.error('[db] Pool error:', err));

export async function query(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

export async function init() {
  const schema = `
    CREATE TABLE IF NOT EXISTS deals (
      id SERIAL PRIMARY KEY,
      brand TEXT NOT NULL,
      discount TEXT NOT NULL,
      discount_num INTEGER DEFAULT 0,
      description TEXT NOT NULL,
      code TEXT DEFAULT '',
      category TEXT NOT NULL,
      link TEXT DEFAULT '',
      expires_at TIMESTAMPTZ NOT NULL,
      added_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      source TEXT DEFAULT 'manual'
    );

    CREATE INDEX IF NOT EXISTS idx_deals_expires ON deals(expires_at);
    CREATE INDEX IF NOT EXISTS idx_deals_category ON deals(category);

    CREATE TABLE IF NOT EXISTS fetch_log (
      id SERIAL PRIMARY KEY,
      ran_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      deals_added INTEGER DEFAULT 0,
      status TEXT,
      message TEXT
    );
  `;
  const client = await pool.connect();
  try {
    await client.query(schema);
  } finally {
    client.release();
  }
  console.log('[db] Schema ready');
}

export async function close() { await pool.end(); }
