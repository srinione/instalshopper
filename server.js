// server.js — instashopper.com backend
import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, init } from './db.js';
import { fetchDealsFromAI } from './jobs/fetchDeals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ============ CONFIG ============
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'instashopper2026';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production-' + Math.random();
const CRON_SECRET = process.env.CRON_SECRET || 'change-this-cron-secret';

// Pre-hash admin password on boot
const ADMIN_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

// ============ MIDDLEWARE ============
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting on the admin login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' }
});

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ============ PUBLIC ROUTES ============

// Health check (Railway pings this)
app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Get all active deals
app.get('/api/deals', async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, brand, discount, discount_num, description, code, category, link, expires_at, added_at
       FROM deals
       WHERE expires_at > CURRENT_TIMESTAMP
       ORDER BY added_at DESC`
    );
    res.json(rows.map(formatDeal));
  } catch (e) {
    console.error('GET /api/deals failed:', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============ AUTH ============
app.post('/api/admin/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  if (username !== ADMIN_USERNAME) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, ADMIN_HASH);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ user: username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

app.get('/api/admin/me', requireAuth, (req, res) => {
  res.json({ user: req.admin.user });
});

// ============ ADMIN ROUTES ============

app.get('/api/admin/deals', requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, brand, discount, discount_num, description, code, category, link,
              expires_at, added_at, source
       FROM deals ORDER BY added_at DESC`
    );
    res.json(rows.map(formatDeal));
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/admin/deals', requireAuth, async (req, res) => {
  const { brand, discount, description, code, category, link, expiryDays } = req.body || {};
  if (!brand || !discount || !description || !category) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const days = parseInt(expiryDays) || 3;
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  const discountNum = parseInt(String(discount).replace(/[^\d]/g, '')) || 0;
  try {
    await query(
      `INSERT INTO deals (brand, discount, discount_num, description, code, category, link, expires_at, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [brand, discount, discountNum, description, code || '', category, link || '', expiresAt, 'manual']
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('Insert failed:', e);
    res.status(500).json({ error: 'Insert failed' });
  }
});

app.delete('/api/admin/deals/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    await query('DELETE FROM deals WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Manual trigger from admin panel
app.post('/api/admin/fetch-deals', requireAuth, async (req, res) => {
  try {
    const result = await fetchDealsFromAI();
    res.json(result);
  } catch (e) {
    console.error('Fetch failed:', e);
    res.status(500).json({ error: e.message || 'Fetch failed' });
  }
});

app.get('/api/admin/fetch-log', requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, ran_at, deals_added, status, message
       FROM fetch_log ORDER BY ran_at DESC LIMIT 20`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Log read failed' });
  }
});

// ============ CRON ENDPOINT ============
// Called by Railway's cron schedule (not by users)
app.post('/api/cron/daily-fetch', async (req, res) => {
  const secret = req.headers['x-cron-secret'];
  if (secret !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await fetchDealsFromAI();
    res.json(result);
  } catch (e) {
    console.error('Cron fetch failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// ============ HELPERS ============
function formatDeal(row) {
  return {
    id: row.id,
    brand: row.brand,
    discount: row.discount,
    discountNum: row.discount_num,
    description: row.description,
    code: row.code,
    category: row.category,
    link: row.link,
    expiresAt: row.expires_at,
    addedAt: row.added_at,
    source: row.source
  };
}

// ============ BOOT ============
init()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[instashopper] Running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('[instashopper] Failed to init database:', err);
    process.exit(1);
  });
