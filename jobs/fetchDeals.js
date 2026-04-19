// jobs/fetchDeals.js — uses Claude AI with web search to find real deals
import Anthropic from '@anthropic-ai/sdk';
import { query } from '../db.js';

export async function fetchDealsFromAI() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await logRun(0, 'error', 'ANTHROPIC_API_KEY not set');
    throw new Error('ANTHROPIC_API_KEY environment variable not set');
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

  const prompt = `Search the web for today's active discount deals and coupons from major US retailers.
Find 6 to 8 real, currently active deals available right now.

Return ONLY a raw JSON array (no markdown fences, no explanation, no preamble text).
Each object must have exactly these fields:
- brand (string) — store or brand name
- category (one of: "Food", "Tech", "Fashion", "Travel", "Beauty", "Home", "Other")
- discount (string) — e.g. "30% OFF" or "$15 OFF"
- discountNum (number) — numeric value only, e.g. 30
- description (string) — one clear sentence about the deal
- code (string) — coupon code or empty string if none required
- link (string) — store URL
- expiryDays (number 1-7) — how many days until the deal likely ends

Example format:
[{"brand":"Amazon","category":"Tech","discount":"20% OFF","discountNum":20,"description":"20% off wireless headphones today only.","code":"TECH20","link":"https://amazon.com","expiryDays":1}]

Return the JSON array now:`;

  console.log('[fetchDeals] Calling Claude (' + model + ') with web search...');

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 3000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }]
    });

    // Extract text blocks
    const textBlocks = (response.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    console.log('[fetchDeals] Got response, parsing...');

    // Find JSON array in the text
    const match = textBlocks.match(/\[[\s\S]*\]/);
    if (!match) {
      await logRun(0, 'error', 'No JSON array found in response');
      return { ok: false, added: 0, error: 'No JSON array in AI response' };
    }

    let deals;
    try {
      deals = JSON.parse(match[0]);
    } catch (e) {
      await logRun(0, 'error', 'JSON parse failed: ' + e.message);
      return { ok: false, added: 0, error: 'Could not parse JSON' };
    }

    if (!Array.isArray(deals) || deals.length === 0) {
      await logRun(0, 'error', 'Empty or non-array result');
      return { ok: false, added: 0, error: 'No deals in result' };
    }

    // Insert deals
    let added = 0;
    for (const d of deals) {
      try {
        const days = parseInt(d.expiryDays) || 3;
        const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
        await query(
          `INSERT INTO deals (brand, discount, discount_num, description, code, category, link, expires_at, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            d.brand || 'Store',
            d.discount || 'DEAL',
            parseInt(d.discountNum) || 0,
            d.description || '',
            d.code || '',
            d.category || 'Other',
            d.link || '',
            expiresAt,
            'ai'
          ]
        );
        added++;
      } catch (e) {
        console.error('[fetchDeals] Skipped one deal:', e.message);
      }
    }

    await logRun(added, 'success', `Added ${added} of ${deals.length} deals`);
    console.log(`[fetchDeals] ✓ Added ${added} deals`);
    return { ok: true, added, total: deals.length };

  } catch (err) {
    const msg = err.message || String(err);
    console.error('[fetchDeals] Error:', msg);
    await logRun(0, 'error', msg);
    throw err;
  }
}

async function logRun(added, status, message) {
  try {
    await query(
      `INSERT INTO fetch_log (deals_added, status, message) VALUES ($1,$2,$3)`,
      [added, status, String(message).slice(0, 500)]
    );
  } catch (e) {
    console.error('[fetchDeals] Log insert failed:', e);
  }
}

// Allow running directly: `node jobs/fetchDeals.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  const { init, close } = await import('../db.js');
  await init();
  try {
    const result = await fetchDealsFromAI();
    console.log('Result:', result);
  } catch (e) {
    console.error('Failed:', e);
    process.exitCode = 1;
  } finally {
    await close();
  }
}
