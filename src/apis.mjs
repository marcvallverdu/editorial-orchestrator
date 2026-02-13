/**
 * API wrappers — Perplexity, Firecrawl, Gemini Embeddings, M2.5
 */
import { CONFIG, KEYS } from './config.mjs';

// ─── Perplexity ─────────────────────────────────────────────────────

export async function searchPerplexity(query) {
  const start = Date.now();
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KEYS.perplexity}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CONFIG.perplexityModel,
      messages: [{ role: 'user', content: query }],
      max_tokens: 3000,
      return_citations: true,
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const citations = data.citations || [];
  const elapsed = Date.now() - start;

  return { content, citations, elapsed, cost: CONFIG.costs.perplexity };
}

// ─── Firecrawl Scrape ───────────────────────────────────────────────

export async function scrapePage(url) {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.scrapeTimeout);

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KEYS.firecrawl}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        timeout: 10000,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json();
    const markdown = data.data?.markdown || '';
    return { content: markdown, elapsed: Date.now() - start, ok: markdown.length > 50 };
  } catch (e) {
    clearTimeout(timeout);
    return { content: '', elapsed: Date.now() - start, ok: false, error: e.message };
  }
}

// ─── Gemini Embeddings ──────────────────────────────────────────────

export async function embed(text) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.embeddingModel}:embedContent?key=${KEYS.gemini}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text }] } }),
    }
  );
  const data = await response.json();
  return data.embedding?.values || null;
}

export async function embedBatch(texts) {
  // Sequential for now — Gemini batch API has different format
  const results = [];
  for (const text of texts) {
    results.push(await embed(text));
  }
  return results;
}

export function cosineSimilarity(a, b) {
  if (!a || !b) return 0;
  let dot = 0, nA = 0, nB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    nA += a[i] * a[i];
    nB += b[i] * b[i];
  }
  return dot / (Math.sqrt(nA) * Math.sqrt(nB));
}

// ─── M2.5 (via OpenRouter) ─────────────────────────────────────────

export async function callM25(systemPrompt, userPrompt, jsonMode = true) {
  const start = Date.now();
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const body = {
    model: CONFIG.llmModel,
    messages,
    max_tokens: 3000,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KEYS.openrouter}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  const elapsed = Date.now() - start;
  let content = data.choices?.[0]?.message?.content || '';
  
  // Strip markdown fences
  content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  
  // Cost estimate
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;
  const cost = (inputTokens * CONFIG.costs.m25InputPer1k + outputTokens * CONFIG.costs.m25OutputPer1k) / 1000;

  return { content, elapsed, cost, inputTokens, outputTokens };
}

// ─── Perplexity fallback for verification ───────────────────────────

export async function verifyViaPerplexity(retailer, fact, factType) {
  const query = `${retailer} ${factType.replace(/_/g, ' ')} 2025 2026 official policy current`;
  return searchPerplexity(query);
}
