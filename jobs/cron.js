// jobs/cron.js — lightweight cron worker. Railway runs this on schedule.
// Hits our own API so fetches are logged and rate-limited centrally.

const url = process.env.PUBLIC_URL;
const secret = process.env.CRON_SECRET;

if (!url) {
  console.error('[cron] PUBLIC_URL not set');
  process.exit(1);
}
if (!secret) {
  console.error('[cron] CRON_SECRET not set');
  process.exit(1);
}

const endpoint = url.replace(/\/$/, '') + '/api/cron/daily-fetch';
console.log('[cron] Triggering', endpoint);

try {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'x-cron-secret': secret, 'Content-Type': 'application/json' },
    body: '{}'
  });
  const body = await res.text();
  console.log('[cron] Status', res.status);
  console.log('[cron] Body', body);
  if (!res.ok) process.exit(1);
} catch (e) {
  console.error('[cron] Failed', e);
  process.exit(1);
}
