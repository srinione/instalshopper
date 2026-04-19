# instashopper.com — Deploy Checklist

Follow these steps **in order** for a working deployment. If something is wrong, the first mismatch below is almost always the cause.

---

## ✅ Step 1 — Extract the zip cleanly

Unzip `instashopper.zip`. You should see exactly this structure:

```
instashopper/
├── .env.example
├── .gitignore
├── README.md
├── db.js
├── jobs/
│   ├── cron.js
│   └── fetchDeals.js
├── nixpacks.toml
├── package.json
├── public/
│   └── index.html       ← CRITICAL: this file must be in public/
├── railway.json
└── server.js
```

**⚠️ Most common mistake:** Having an old `index.html` at the project root, or no `public/` folder. The server only serves files from `public/` — if `index.html` lives elsewhere, the frontend won't load, or an old version gets served.

**Verify:** open `public/index.html` in any text editor and search for `const API =`. You must see this line:

```javascript
const API = '/api';
```

If you don't see it, you have the wrong file. Re-extract from the zip.

---

## ✅ Step 2 — Push to GitHub

```bash
cd instashopper
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/instashopper.git
git push -u origin main
```

---

## ✅ Step 3 — Create Railway project

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → pick `instashopper`
2. First build will fail (no DB yet) — that's expected. Don't panic.

---

## ✅ Step 4 — Add Postgres

1. In the project view, click **+ New** → **Database** → **Add PostgreSQL**
2. Wait ~30 seconds for it to spin up

---

## ✅ Step 5 — Link `DATABASE_URL` to the web service

This is where most deploys fail.

1. Click your **web service** (not the Postgres one) → **Variables** tab
2. Click **+ New Variable**
3. Name: `DATABASE_URL`
4. Value: click the **"Add Reference"** button (NOT paste a string)
5. Pick **Postgres** → **DATABASE_URL**
6. Save — you should see a little 🔗 link icon next to the variable, meaning it's a live reference

---

## ✅ Step 6 — Set remaining env vars

Still in your web service → Variables, add these one by one:

| Variable | What to put |
|---|---|
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | something strong, no leading/trailing spaces |
| `JWT_SECRET` | a long random string (run `openssl rand -hex 32` in terminal) |
| `CRON_SECRET` | another long random string |
| `ANTHROPIC_API_KEY` | your `sk-ant-...` from [console.anthropic.com](https://console.anthropic.com) |

Railway will redeploy after you add each one. Wait until the last deploy shows green before testing.

---

## ✅ Step 7 — Get a public URL

Web service → **Settings** → **Networking** → **Generate Domain**.

You'll get `https://instashopper-production-xxxx.up.railway.app`.

---

## ✅ Step 8 — Test the deployment

In order. Don't skip:

1. **`/health`** — visit `https://your-url.up.railway.app/health`
   - ✅ Expect: `{"ok":true,"time":"..."}`
   - ❌ If error: check deploy logs, probably `DATABASE_URL` not linked

2. **`/api/deals`** — visit `https://your-url.up.railway.app/api/deals`
   - ✅ Expect: `[]` (empty array — no deals yet)
   - ❌ If `Cannot GET` or error: backend not running

3. **Home page** — visit `https://your-url.up.railway.app/`
   - ✅ Expect: the instashopper site loads, shows "No deals yet"
   - ❌ If blank or error: `public/index.html` didn't get pushed

4. **Admin login** — click **Admin** button, enter username `admin` and the `ADMIN_PASSWORD` you set
   - ✅ Expect: dashboard opens
   - ❌ If fails: open DevTools (F12) → Network tab → check the `/api/admin/login` request

---

## ✅ Step 9 — Add the daily cron (optional but recommended)

This is what makes deals auto-refresh daily.

1. In your project: **+ New** → **Empty Service**
2. Rename it `daily-fetcher`
3. Settings → **Source** → connect the same GitHub repo
4. Settings → **Deploy** → set **Custom Start Command** to `npm run cron`
5. Settings → **Deploy** → set **Cron Schedule** to `0 6 * * *` (6 AM UTC daily)
6. Variables → add:
   - `PUBLIC_URL` = your Railway URL from step 7 (no trailing slash)
   - `CRON_SECRET` = same value as step 6

---

## 🔧 Troubleshooting Quick Reference

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot GET /deals` | Old `index.html` deployed | Extract zip fresh, make sure `public/index.html` has `const API = '/api'` |
| `/health` returns error | Server crashed on boot | Deploy logs will show why — usually `DATABASE_URL` |
| Login: "Invalid credentials" | Password mismatch | Check `ADMIN_PASSWORD` in Railway variables, watch for trailing spaces |
| Login: "Too many attempts" | Hit rate limit (10 tries / 15 min) | Wait or redeploy the service |
| AI fetch fails | No API key | Set `ANTHROPIC_API_KEY` in Railway |
| Cron doesn't run | Missing vars on cron service | `PUBLIC_URL` and `CRON_SECRET` both need to be set on the cron service too |

---

## 🔑 Default credentials (if you didn't override in Railway)

- Username: `admin`
- Password: `instashopper2026`

**⚠️ Change these before going live.**
