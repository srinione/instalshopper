# instashopper.com

A full-stack daily deals platform with a Node.js backend, Postgres database, admin panel, and automatic daily AI-powered deal fetching via Claude.

## What's in here

```
instashopper/
├── server.js              Main Express API server
├── db.js                  Postgres connection pool + schema
├── jobs/
│   ├── fetchDeals.js      AI deal-fetching logic (called by cron + admin button)
│   └── cron.js            Cron worker script — triggers the daily fetch
├── public/
│   └── index.html         The frontend app
├── package.json
├── railway.json           Railway web service config
├── nixpacks.toml          Build config (ensures Node 20)
├── .env.example           Environment variable template
└── README.md              This file
```

## How the daily auto-fetch works

1. Railway runs a **cron service** every morning (e.g. 6 AM UTC)
2. Cron worker hits your own `/api/cron/daily-fetch` endpoint with a secret header
3. That endpoint calls Claude AI with the web search tool to find today's real deals
4. Parsed deals are inserted into Postgres
5. Visitors see fresh deals automatically — no admin action needed

The admin can also trigger a fetch manually from the dashboard anytime.

---

## Deploy to Railway — step by step

### 1. Get your Anthropic API key

Go to [console.anthropic.com](https://console.anthropic.com), create an account, and grab an API key. You'll need it in step 5.

### 2. Push this project to GitHub

```bash
cd instashopper
git init
git add .
git commit -m "initial commit"
# Create a new repo at github.com, then:
git remote add origin https://github.com/YOUR-USERNAME/instashopper.git
git branch -M main
git push -u origin main
```

### 3. Create a Railway project

1. Sign up at [railway.app](https://railway.app)
2. Click **New Project** → **Deploy from GitHub repo**
3. Pick your `instashopper` repo
4. Railway will start building. It'll fail at first because env vars aren't set — that's fine.

### 4. Add a Postgres database

1. In your Railway project, click **+ New** → **Database** → **Add PostgreSQL**
2. Railway auto-creates the database and sets a `DATABASE_URL` variable
3. Click your web service → **Variables** → **Service Variables**
4. Add a reference variable: set `DATABASE_URL` to `${{Postgres.DATABASE_URL}}`
   (or click the "Variable Reference" helper and pick `Postgres.DATABASE_URL`)

### 5. Set environment variables

In the web service → **Variables**, add:

| Variable | Value |
|---|---|
| `ADMIN_USERNAME` | `admin` (or whatever you want) |
| `ADMIN_PASSWORD` | a strong password |
| `JWT_SECRET` | a long random string (e.g. run `openssl rand -hex 32`) |
| `CRON_SECRET` | another long random string |
| `ANTHROPIC_API_KEY` | your `sk-ant-...` key from step 1 |
| `NODE_ENV` | `production` |

Railway will redeploy automatically.

### 6. Generate a public URL

Click your web service → **Settings** → **Networking** → **Generate Domain**.

You'll get something like `instashopper-production.up.railway.app`. Test it — the site should load.

### 7. Set up the daily cron job

This is what makes deals refresh automatically.

1. In your Railway project, click **+ New** → **Empty Service**
2. Rename it to something like `daily-fetcher`
3. Go to **Settings** → connect the same GitHub repo
4. Go to **Settings** → **Deploy** → set **Cron Schedule** to `0 6 * * *` (runs at 6 AM UTC daily)
5. Go to **Settings** → **Deploy** → set **Custom Start Command** to `npm run cron`
6. Go to **Variables** and add:
   - `PUBLIC_URL` = your Railway URL from step 6 (e.g. `https://instashopper-production.up.railway.app`)
   - `CRON_SECRET` = same value as in step 5

The cron service will now run once a day, hit your own API, and refresh deals automatically.

### 8. Connect instashopper.com

1. Buy the domain at [Namecheap](https://namecheap.com), [Porkbun](https://porkbun.com), or [Cloudflare](https://cloudflare.com/products/registrar/)
2. In Railway → web service → **Settings** → **Networking** → **Custom Domain**
3. Add `instashopper.com` and `www.instashopper.com`
4. Railway shows you DNS records to add at your registrar
5. Add them — propagation takes a few minutes to a few hours

Done. Your site is live.

---

## Local development

You need Postgres running locally. Easiest way is Docker:

```bash
docker run -d --name pg -e POSTGRES_PASSWORD=pg -p 5432:5432 postgres:16
```

Then:

```bash
cp .env.example .env
# The default DATABASE_URL in .env.example works with the Docker command above.
# Also set ANTHROPIC_API_KEY if you want to test AI fetching.
npm install
npm run dev
```

Visit `http://localhost:3000`.

Test the AI fetcher manually:
```bash
npm run fetch-deals
```

---

## Is the fetching daily or real-time?

**Daily** by default (runs once at 6 AM UTC via the Railway cron service). You can change this:

- Change frequency: edit the cron schedule in Railway (standard cron syntax)
- Every 6 hours: `0 */6 * * *`
- Every hour: `0 * * * *` (⚠️ expensive — uses your Anthropic credits)
- On-demand only: delete the cron service; admin triggers it manually

Each AI fetch costs a few cents in Anthropic API credits (web search + generation). Daily is the sweet spot — ~$2-5/month in API costs.

---

## Environment variables reference

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `ADMIN_USERNAME` | yes | Admin login username |
| `ADMIN_PASSWORD` | yes | Admin login password |
| `JWT_SECRET` | yes | For signing auth tokens |
| `CRON_SECRET` | yes | Protects the cron endpoint |
| `ANTHROPIC_API_KEY` | for AI | Claude API key |
| `CLAUDE_MODEL` | no | Model to use (default `claude-haiku-4-5-20251001`) |
| `PUBLIC_URL` | for cron | Your public Railway URL |
| `PORT` | auto | Server port (Railway sets this) |

---

## API endpoints

Public:
- `GET /health` — health check
- `GET /api/deals` — list active deals

Admin (require Bearer token):
- `POST /api/admin/login` — get token with `{username, password}`
- `GET /api/admin/deals` — list all deals (including expired)
- `POST /api/admin/deals` — create deal
- `DELETE /api/admin/deals/:id` — delete deal
- `POST /api/admin/fetch-deals` — trigger AI fetch manually
- `GET /api/admin/fetch-log` — view recent fetch runs

Cron:
- `POST /api/cron/daily-fetch` — requires `x-cron-secret` header

---

## Troubleshooting

**"Database error" after deploy** — Make sure `DATABASE_URL` is set correctly (reference the Postgres service variable, don't copy-paste).

**AI fetch returns "No deals parsed"** — Claude sometimes wraps its response; the parser is lenient but not perfect. Try again, or check the fetch log.

**Cron isn't running** — Check Railway's cron service logs. Make sure `PUBLIC_URL` has no trailing slash and `CRON_SECRET` matches exactly.

**I forgot my admin password** — Update `ADMIN_PASSWORD` in Railway env vars and redeploy.

---

## License

Yours to use, modify, and deploy.
