#!/usr/bin/env node
/**
 * M2.5 Editorial Research Orchestrator — Phase 1 Skeleton
 * 
 * Tests MiniMax M2.5's tool-calling ability to orchestrate
 * the editorial research pipeline for a single retailer.
 * 
 * Usage: node orchestrator.mjs "Dick's Sporting Goods" "coupons.com"
 */

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const PERPLEXITY_KEY = process.env.PERPLEXITY_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;

const MODEL = 'minimax/MiniMax-M2.5';

// ─── Tool Definitions ───────────────────────────────────────────────

const tools = [
  {
    type: 'function',
    function: {
      name: 'research_perplexity',
      description: 'Research a retailer using Perplexity AI. Returns synthesized facts from web sources about discounts, loyalty programs, policies, sales calendar, etc. Cost: ~$0.01. Use as first broad research pass.',
      parameters: {
        type: 'object',
        properties: {
          retailer: { type: 'string', description: 'Retailer name, e.g. "Dick\'s Sporting Goods"' },
          query: { type: 'string', description: 'Research query. Be comprehensive — include all savings categories.' }
        },
        required: ['retailer', 'query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'scrape_page',
      description: 'Scrape a URL and return its content as markdown. Use for official policy pages, help pages, or retailer landing pages. Cost: ~$0.001.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to scrape' },
          reason: { type: 'string', description: 'Why scraping this page (for audit trail)' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'extract_facts',
      description: 'Extract structured facts from raw research text. Returns an array of typed fact objects. Uses M2.5 internally.',
      parameters: {
        type: 'object',
        properties: {
          raw_text: { type: 'string', description: 'Raw research text to extract facts from' },
          retailer: { type: 'string', description: 'Retailer name for context' }
        },
        required: ['raw_text', 'retailer']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'verify_fact',
      description: 'Verify a specific fact by scraping the official source URL and checking if the fact is confirmed, outdated, or incorrect. Use for HIGH-RISK facts: policies, discount percentages, credit card terms.',
      parameters: {
        type: 'object',
        properties: {
          fact: { type: 'string', description: 'The fact to verify' },
          official_url: { type: 'string', description: 'Official retailer URL to check against' },
          fact_type: { type: 'string', description: 'Type: return_policy, price_match, discount, loyalty, shipping' }
        },
        required: ['fact', 'official_url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'embed_and_dedupe',
      description: 'Take an array of facts, embed them, and remove duplicates (cosine similarity > 0.90). Returns deduplicated facts.',
      parameters: {
        type: 'object',
        properties: {
          facts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                content: { type: 'string' },
                source: { type: 'string' }
              }
            },
            description: 'Array of fact objects to deduplicate'
          }
        },
        required: ['facts']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'compare_with_existing',
      description: 'Compare new facts against existing page content to find gaps. Returns MISSING, PARTIAL, or COVERED for each fact.',
      parameters: {
        type: 'object',
        properties: {
          facts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                content: { type: 'string' }
              }
            },
            description: 'New researched facts'
          },
          existing_content: {
            type: 'string',
            description: 'Existing page content to compare against'
          }
        },
        required: ['facts', 'existing_content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'log_decision',
      description: 'Log an orchestrator decision for the audit trail. Use to explain your reasoning at each step.',
      parameters: {
        type: 'object',
        properties: {
          decision: { type: 'string', description: 'What you decided and why' },
          category: { type: 'string', enum: ['strategy', 'research', 'verification', 'gap', 'output'] }
        },
        required: ['decision', 'category']
      }
    }
  }
];

// ─── Tool Implementations ───────────────────────────────────────────

async function research_perplexity({ retailer, query }) {
  console.log(`\n🔍 [Perplexity] Researching ${retailer}...`);
  const start = Date.now();
  
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PERPLEXITY_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [{ role: 'user', content: query }],
      max_tokens: 3000,
      return_citations: true,
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || 'No results';
  const citations = data.citations || [];
  const elapsed = Date.now() - start;
  
  console.log(`   ✅ Got ${content.length} chars, ${citations.length} citations (${elapsed}ms)`);
  
  return JSON.stringify({
    content,
    citations,
    cost_estimate: '$0.01'
  });
}

async function scrape_page({ url, reason }) {
  console.log(`\n🌐 [Scrape] ${url}`);
  if (reason) console.log(`   Reason: ${reason}`);
  const start = Date.now();
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  
  let data;
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_KEY}`,
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
    data = await response.json();
  } catch (e) {
    clearTimeout(timeout);
    console.log(`   ⚠️ Scrape timed out or failed: ${e.message}`);
    return `Failed to scrape ${url}: timeout`;
  }
  clearTimeout(timeout);
  const markdown = data.data?.markdown || 'Failed to scrape';
  const elapsed = Date.now() - start;
  
  // Truncate to avoid blowing context
  const truncated = markdown.slice(0, 4000);
  console.log(`   ✅ Got ${markdown.length} chars (truncated to ${truncated.length}) (${elapsed}ms)`);
  
  return truncated;
}

async function extract_facts({ raw_text, retailer }) {
  console.log(`\n📋 [Extract] Extracting facts for ${retailer}...`);
  const start = Date.now();
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{
        role: 'system',
        content: 'Extract all distinct facts from the research text. Return a JSON array of objects with "type" (return_policy, shipping, discount, loyalty, price_match, payment, sales_calendar, promo_code) and "content" (the fact). Be exhaustive — every distinct piece of information is a separate fact.'
      }, {
        role: 'user',
        content: `Retailer: ${retailer}\n\nResearch text:\n${raw_text}`
      }],
      response_format: { type: 'json_object' },
      max_tokens: 3000,
    }),
  });

  const data = await response.json();
  const elapsed = Date.now() - start;
  
  let facts = [];
  try {
    let raw = data.choices[0].message.content;
    // Strip markdown code fences if present
    raw = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const parsed = JSON.parse(raw);
    facts = parsed.facts || parsed;
    if (!Array.isArray(facts)) facts = [facts];
  } catch (e) {
    console.log(`   ⚠️ Failed to parse: ${e.message}`);
    facts = [];
  }
  
  console.log(`   ✅ Extracted ${facts.length} facts (${elapsed}ms)`);
  return JSON.stringify(facts);
}

async function embed(text) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text }] } })
    }
  );
  const data = await response.json();
  return data.embedding?.values;
}

function cosineSim(a, b) {
  let dot = 0, nA = 0, nB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    nA += a[i] * a[i];
    nB += b[i] * b[i];
  }
  return dot / (Math.sqrt(nA) * Math.sqrt(nB));
}

async function embed_and_dedupe({ facts }) {
  // Parse if string
  if (typeof facts === 'string') {
    try { facts = JSON.parse(facts); } catch(e) { facts = []; }
  }
  console.log(`\n🔗 [Dedupe] Deduplicating ${facts.length} facts...`);
  if (facts.length > 0) console.log(`   Sample fact keys: ${Object.keys(facts[0]).join(', ')}`);
  const start = Date.now();
  
  // Embed all — handle various field names M2.5 might use
  const embedded = [];
  for (const fact of facts) {
    const text = fact.content || fact.text || fact.fact || fact.description || JSON.stringify(fact);
    const vec = await embed(text);
    if (vec) embedded.push({ ...fact, content: text, embedding: vec });
  }
  
  // Dedupe
  const unique = [];
  for (const fact of embedded) {
    let isDuplicate = false;
    for (const existing of unique) {
      const sim = cosineSim(fact.embedding, existing.embedding);
      if (sim > 0.90) {
        isDuplicate = true;
        // Keep longer version
        if (fact.content.length > existing.content.length) {
          existing.content = fact.content;
          existing.type = fact.type;
        }
        break;
      }
    }
    if (!isDuplicate) unique.push(fact);
  }
  
  const elapsed = Date.now() - start;
  console.log(`   ✅ ${facts.length} → ${unique.length} unique facts (${elapsed}ms)`);
  
  // Strip embeddings from response
  const result = unique.map(({ embedding, ...rest }) => rest);
  return JSON.stringify(result);
}

async function compare_with_existing({ facts, existing_content }) {
  // Parse if string
  if (typeof facts === 'string') {
    try { facts = JSON.parse(facts); } catch(e) { facts = []; }
  }
  console.log(`\n📊 [Compare] Comparing ${facts.length} facts against existing content...`);
  const start = Date.now();
  
  // Chunk existing content
  const chunks = existing_content.split('\n').filter(c => c.trim().length > 20);
  
  // Embed chunks
  const chunkEmbeddings = [];
  for (const chunk of chunks) {
    const vec = await embed(chunk);
    if (vec) chunkEmbeddings.push({ text: chunk, embedding: vec });
  }
  
  console.log(`   Embedded ${chunkEmbeddings.length} existing chunks`);
  
  // Embed facts and compare
  const results = [];
  for (const fact of facts) {
    const text = fact.content || fact.text || fact.fact || fact.description || JSON.stringify(fact);
    const factVec = await embed(text);
    if (!factVec) continue;
    
    let bestSim = 0;
    let bestMatch = '';
    for (const chunk of chunkEmbeddings) {
      const sim = cosineSim(factVec, chunk.embedding);
      if (sim > bestSim) {
        bestSim = sim;
        bestMatch = chunk.text;
      }
    }
    
    let status;
    if (bestSim > 0.85) status = 'COVERED';
    else if (bestSim > 0.70) status = 'PARTIAL';
    else status = 'MISSING';
    
    results.push({
      type: fact.type || 'unknown',
      fact: text,
      status,
      similarity: Math.round(bestSim * 100),
      best_match: bestMatch.slice(0, 100)
    });
  }
  
  const elapsed = Date.now() - start;
  const missing = results.filter(r => r.status === 'MISSING').length;
  const partial = results.filter(r => r.status === 'PARTIAL').length;
  const covered = results.filter(r => r.status === 'COVERED').length;
  
  console.log(`   ✅ ${covered} covered, ${partial} partial, ${missing} missing (${elapsed}ms)`);
  
  return JSON.stringify(results);
}

function log_decision({ decision, category }) {
  const icon = { strategy: '🧠', research: '🔍', verification: '✅', gap: '📊', output: '📤' }[category] || '📝';
  console.log(`\n${icon} [Decision/${category}] ${decision}`);
  return 'Logged.';
}

// ─── Tool Router ─────────────────────────────────────────────────────

const toolHandlers = {
  research_perplexity,
  scrape_page,
  extract_facts,
  verify_fact: async ({ fact, official_url, fact_type }) => {
    console.log(`\n✅ [Verify] Checking: "${fact.slice(0, 60)}..."`);
    const pageContent = await scrape_page({ url: official_url, reason: `Verify ${fact_type}: ${fact.slice(0, 40)}` });
    
    // Use M2.5 to verify
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{
          role: 'user',
          content: `Official page content:\n---\n${pageContent.slice(0, 3000)}\n---\n\nVerify this fact:\n"${fact}"\n\nRespond with JSON: {"verdict": "VERIFIED|OUTDATED|UNVERIFIED|INCORRECT", "explanation": "...", "corrected_fact": "..." (if outdated/incorrect)}`
        }],
        response_format: { type: 'json_object' },
        max_tokens: 500,
      }),
    });
    
    const data = await response.json();
    let result = data.choices?.[0]?.message?.content || '{"verdict": "UNVERIFIED"}';
    result = result.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    return result;
  },
  embed_and_dedupe,
  compare_with_existing,
  log_decision,
};

// ─── Orchestrator Loop ───────────────────────────────────────────────

async function runOrchestrator(retailer, site) {
  console.log('═'.repeat(70));
  console.log(`🦞 M2.5 EDITORIAL RESEARCH ORCHESTRATOR`);
  console.log(`   Retailer: ${retailer}`);
  console.log(`   Site: ${site}`);
  console.log(`   Model: ${MODEL}`);
  console.log('═'.repeat(70));
  
  const startTime = Date.now();
  let totalCost = 0;
  let turns = 0;
  
  // Fetch existing page content from the live site
  const slug = retailer.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const pageUrl = `https://www.${site}/coupon-codes/${slug}`;
  console.log(`\n📄 Fetching existing page: ${pageUrl}`);
  let existingContent = '';
  try {
    existingContent = await scrape_page({ url: pageUrl, reason: 'Fetch existing editorial content for gap comparison' });
    if (existingContent.length < 50) existingContent = `[Page returned minimal content from ${pageUrl}]`;
    // Truncate to keep context manageable
    existingContent = existingContent.slice(0, 3000);
    console.log(`   📄 Existing content: ${existingContent.length} chars`);
  } catch (e) {
    existingContent = `[Failed to fetch existing page from ${pageUrl}]`;
    console.log(`   ⚠️ Could not fetch existing page: ${e.message}`);
  }
  
  // Current date context
  const today = new Date().toISOString().split('T')[0];
  const seasonalContext = getSeasonalContext(today);
  
  const messages = [
    {
      role: 'system',
      content: `You are the editorial research orchestrator for ${site}. Your job is to research retailers and find content gaps on existing pages.

You have tools to: research via Perplexity, scrape pages, extract facts, deduplicate, compare gaps, verify facts, and log decisions.

Be thorough but cost-conscious. Log decisions so we can audit your reasoning.`
    },
    {
      role: 'user',
      content: `Research ${retailer} and find content gaps on our ${site} page.

Today is ${today}. ${seasonalContext}

WORKFLOW — YOU MUST EXECUTE ALL THESE STEPS IN ORDER:
1. log_decision — Log your initial strategy
2. research_perplexity — Broad research query covering ALL savings categories (discounts, loyalty, policies, shipping, sales calendar, promo codes, payment options)
3. extract_facts — Extract structured facts from the Perplexity response
4. embed_and_dedupe — Deduplicate the extracted facts via embeddings
5. compare_with_existing — Compare deduplicated facts against existing page content to find MISSING/PARTIAL/COVERED
6. verify_fact — For HIGH-RISK missing/partial facts (policies, discount percentages), verify against official URLs
7. log_decision — Log final gap assessment with specific recommendations

IMPORTANT: Steps 3-5 are MANDATORY. Do not skip deduplication or comparison — we need the embeddings pipeline to work.

EXISTING PAGE CONTENT for ${retailer} on ${site}:
---
${existingContent}
---

Start now.`
    }
  ];
  
  const MAX_TURNS = 15;
  
  while (turns < MAX_TURNS) {
    turns++;
    console.log(`\n${'─'.repeat(50)} Turn ${turns} ${'─'.repeat(10)}`);
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools,
        max_tokens: 2000,
      }),
    });
    
    const data = await response.json();
    
    if (!data.choices?.[0]) {
      console.error('❌ No response from M2.5:', JSON.stringify(data).slice(0, 500));
      break;
    }
    
    const msg = data.choices[0].message;
    const finishReason = data.choices[0].finish_reason;
    
    // Track cost
    if (data.usage) {
      const inputCost = (data.usage.prompt_tokens || 0) * 0.5 / 1_000_000;
      const outputCost = (data.usage.completion_tokens || 0) * 1.5 / 1_000_000;
      totalCost += inputCost + outputCost;
    }
    
    // Add assistant message
    messages.push(msg);
    
    // If there's text content, print it
    if (msg.content) {
      console.log(`\n💬 M2.5: ${msg.content.slice(0, 300)}${msg.content.length > 300 ? '...' : ''}`);
    }
    
    // If no tool calls, we're done
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      console.log('\n✅ Orchestrator finished (no more tool calls).');
      break;
    }
    
    // Execute tool calls
    for (const toolCall of msg.tool_calls) {
      const { name, arguments: argsStr } = toolCall.function;
      let args;
      try {
        args = JSON.parse(argsStr);
      } catch (e) {
        console.error(`⚠️ Bad args for ${name}: ${argsStr.slice(0, 200)}`);
        args = {};
      }
      
      console.log(`\n🔧 Tool call: ${name}(${JSON.stringify(args).slice(0, 100)}...)`);
      
      const handler = toolHandlers[name];
      if (!handler) {
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: `Error: unknown tool "${name}"` });
        continue;
      }
      
      try {
        const result = await handler(args);
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: typeof result === 'string' ? result : JSON.stringify(result) });
      } catch (e) {
        console.error(`❌ Tool ${name} failed: ${e.message}`);
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: `Error: ${e.message}` });
      }
    }
  }
  
  // Final report
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '═'.repeat(70));
  console.log('📊 ORCHESTRATOR REPORT');
  console.log('═'.repeat(70));
  console.log(`Retailer:     ${retailer}`);
  console.log(`Site:         ${site}`);
  console.log(`Turns:        ${turns}`);
  console.log(`Time:         ${elapsed}s`);
  console.log(`Est. cost:    $${totalCost.toFixed(4)} (M2.5 only, + API calls)`);
  console.log('═'.repeat(70));
  
  return { turns, elapsed, totalCost, messages };
}

function getSeasonalContext(dateStr) {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  
  const events = [];
  if (month === 2 && day <= 14) events.push("Valentine's Day is approaching — gift/jewelry/flowers retailers are seasonal priority.");
  if (month === 2 && day >= 14 && day <= 21) events.push("Presidents' Day sales happening — mattress, appliance, furniture retailers are priority.");
  if (month === 11 && day >= 15) events.push("Black Friday approaching — ALL retailers are seasonal priority.");
  if (month === 7) events.push("Back-to-school season — clothing, electronics, office supply retailers are priority.");
  if (month === 12 && day <= 25) events.push("Holiday sales season — ALL retailers are priority.");
  
  return events.length ? 'Seasonal context: ' + events.join(' ') : 'No major seasonal events right now.';
}

// ─── CLI ─────────────────────────────────────────────────────────────

const retailer = process.argv[2] || "Dick's Sporting Goods";
const site = process.argv[3] || 'coupons.com';

if (!OPENROUTER_KEY || !PERPLEXITY_KEY || !GEMINI_KEY) {
  console.error('❌ Missing API keys. Need: OPENROUTER_API_KEY, PERPLEXITY_API_KEY, GEMINI_API_KEY');
  process.exit(1);
}

runOrchestrator(retailer, site).catch(console.error);
