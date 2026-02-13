#!/usr/bin/env node
/**
 * Fast Scripted Pipeline — single retailer research
 * 
 * Deterministic flow: scrape existing → research → extract → dedupe → compare → verify
 * M2.5 only used for extraction + verification (not orchestration decisions)
 * 
 * Usage: node src/pipeline.mjs "Target" "coupons.com"
 */
import { CONFIG, KEYS, RESEARCH_TEMPLATE, HIGH_RISK_TYPES } from './config.mjs';
import { searchPerplexity, scrapePage, embed, cosineSimilarity, callM25, verifyViaPerplexity } from './apis.mjs';

// ─── Step 1: Fetch existing page content ────────────────────────────

async function fetchExistingContent(retailer, site) {
  const slug = retailer.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const url = `https://www.${site}/coupon-codes/${slug}`;
  
  const result = await scrapePage(url);
  if (!result.ok) {
    // Try alternate URL patterns
    const altUrl = `https://www.${site}/coupons/${slug}`;
    const alt = await scrapePage(altUrl);
    if (alt.ok) return { content: alt.content.slice(0, CONFIG.maxExistingContentChars), url: altUrl };
    return { content: '', url, error: 'Could not fetch existing page' };
  }
  return { content: result.content.slice(0, CONFIG.maxExistingContentChars), url };
}

// ─── Step 2: Research via Perplexity ────────────────────────────────

async function research(retailer) {
  const query = RESEARCH_TEMPLATE(retailer);
  return searchPerplexity(query);
}

// ─── Step 3: Extract facts via M2.5 ────────────────────────────────

async function extractFacts(rawText, retailer) {
  const system = `Extract ALL distinct facts from the research text about ${retailer}. Return JSON: {"facts": [{"type": "<type>", "content": "<fact>"}]}. Types: discount, loyalty, promo_code, shipping, return_policy, price_match, payment, sales_calendar, program, other. Every distinct piece of info = separate fact. Be exhaustive.`;
  
  const result = await callM25(system, rawText.slice(0, 6000));
  
  try {
    const parsed = JSON.parse(result.content);
    let facts = parsed.facts || parsed;
    if (!Array.isArray(facts)) facts = [];
    return { facts, elapsed: result.elapsed, cost: result.cost };
  } catch (e) {
    return { facts: [], elapsed: result.elapsed, cost: result.cost, error: e.message };
  }
}

// ─── Step 4: Deduplicate via embeddings ─────────────────────────────

async function deduplicateFacts(facts) {
  const start = Date.now();
  
  // Embed all facts
  const embedded = [];
  for (const fact of facts) {
    const text = fact.content || fact.text || fact.fact || JSON.stringify(fact);
    const vec = await embed(text);
    if (vec) embedded.push({ ...fact, content: text, embedding: vec });
  }
  
  // Greedy dedupe
  const unique = [];
  for (const fact of embedded) {
    let isDuplicate = false;
    for (const existing of unique) {
      if (cosineSimilarity(fact.embedding, existing.embedding) > CONFIG.dedupeSimilarity) {
        isDuplicate = true;
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
  const result = unique.map(({ embedding, ...rest }) => rest);
  return { facts: result, original: facts.length, deduped: result.length, elapsed };
}

// ─── Step 5: Compare against existing content ───────────────────────

async function compareGaps(facts, existingContent) {
  const start = Date.now();
  
  // Split existing content into meaningful chunks
  const chunks = existingContent.split(/\n+/).filter(c => c.trim().length > 20);
  if (chunks.length === 0) {
    // No existing content — everything is missing
    return {
      results: facts.map(f => ({ ...f, status: 'MISSING', similarity: 0 })),
      elapsed: Date.now() - start,
    };
  }
  
  // Embed chunks
  const chunkEmbeddings = [];
  for (const chunk of chunks) {
    const vec = await embed(chunk);
    if (vec) chunkEmbeddings.push({ text: chunk, embedding: vec });
  }
  
  // Compare each fact
  const results = [];
  for (const fact of facts) {
    const text = fact.content || '';
    const factVec = await embed(text);
    if (!factVec) { results.push({ ...fact, status: 'MISSING', similarity: 0 }); continue; }
    
    let bestSim = 0;
    let bestMatch = '';
    for (const chunk of chunkEmbeddings) {
      const sim = cosineSimilarity(factVec, chunk.embedding);
      if (sim > bestSim) { bestSim = sim; bestMatch = chunk.text; }
    }
    
    let status;
    if (bestSim > CONFIG.coveredThreshold) status = 'COVERED';
    else if (bestSim > CONFIG.partialThreshold) status = 'PARTIAL';
    else status = 'MISSING';
    
    results.push({
      type: fact.type || 'other',
      content: text,
      status,
      similarity: Math.round(bestSim * 100),
      bestMatch: bestMatch.slice(0, 100),
    });
  }
  
  return { results, elapsed: Date.now() - start };
}

// ─── Step 6: Verify high-risk facts ─────────────────────────────────

async function verifyHighRiskFacts(gaps, retailer) {
  const start = Date.now();
  const highRisk = gaps.filter(g =>
    (g.status === 'MISSING' || g.status === 'PARTIAL') &&
    HIGH_RISK_TYPES.includes(g.type)
  ).slice(0, 5); // Max 5 verifications to control cost
  
  if (highRisk.length === 0) return { verified: [], elapsed: 0 };
  
  const verified = [];
  for (const fact of highRisk) {
    // Try scraping official page first
    const slug = retailer.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const searchTerm = fact.type.replace(/_/g, '-');
    const officialUrl = `https://www.${slug}.com/help/${searchTerm}`;
    
    let pageContent = '';
    const scrapeResult = await scrapePage(officialUrl);
    
    if (scrapeResult.ok && scrapeResult.content.length > 200 && !scrapeResult.content.includes('error page')) {
      pageContent = scrapeResult.content.slice(0, 3000);
    } else {
      // Fallback: targeted Perplexity search (more reliable than scraping)
      const ppx = await verifyViaPerplexity(retailer, fact.content, fact.type);
      pageContent = ppx.content;
    }
    
    // M2.5 verification
    const verifyResult = await callM25(
      null,
      `Source content:\n---\n${pageContent.slice(0, 2000)}\n---\n\nVerify: "${fact.content}"\n\nJSON: {"verdict": "VERIFIED|OUTDATED|UNVERIFIED|INCORRECT", "explanation": "...", "corrected_fact": null}`,
      true
    );
    
    try {
      const parsed = JSON.parse(verifyResult.content);
      verified.push({ ...fact, verification: parsed });
    } catch {
      verified.push({ ...fact, verification: { verdict: 'UNVERIFIED' } });
    }
  }
  
  return { verified, elapsed: Date.now() - start };
}

// ─── Main Pipeline ──────────────────────────────────────────────────

export async function runPipeline(retailer, site) {
  const startTime = Date.now();
  const log = [];
  let totalCost = 0;
  
  const step = (name, detail) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log.push({ step: name, detail, elapsed });
    console.log(`  [${elapsed}s] ${name}: ${detail}`);
  };

  console.log(`\n🔍 ${retailer} × ${site}`);
  
  // Step 1: Fetch existing content
  const existing = await fetchExistingContent(retailer, site);
  step('fetch', `${existing.content.length} chars from ${existing.url}${existing.error ? ' (FAILED)' : ''}`);
  
  // Step 2: Research
  const research_result = await research(retailer);
  totalCost += research_result.cost;
  step('research', `${research_result.content.length} chars, ${research_result.citations.length} citations (${research_result.elapsed}ms)`);
  
  // Step 3: Extract facts
  const extracted = await extractFacts(research_result.content, retailer);
  totalCost += extracted.cost || 0;
  step('extract', `${extracted.facts.length} facts (${extracted.elapsed}ms)${extracted.error ? ' ERROR: ' + extracted.error : ''}`);
  
  if (extracted.facts.length === 0) {
    step('ABORT', 'No facts extracted — skipping remaining steps');
    return { retailer, site, status: 'failed', reason: 'no_facts', log, totalCost, elapsed: (Date.now() - startTime) / 1000 };
  }
  
  // Step 4: Deduplicate
  const deduped = await deduplicateFacts(extracted.facts);
  step('dedupe', `${deduped.original} → ${deduped.deduped} unique facts (${deduped.elapsed}ms)`);
  
  // Step 5: Compare gaps
  const comparison = await compareGaps(deduped.facts, existing.content);
  const missing = comparison.results.filter(r => r.status === 'MISSING');
  const partial = comparison.results.filter(r => r.status === 'PARTIAL');
  const covered = comparison.results.filter(r => r.status === 'COVERED');
  step('compare', `${covered.length} covered, ${partial.length} partial, ${missing.length} missing (${comparison.elapsed}ms)`);
  
  // Step 6: Verify high-risk
  const verification = await verifyHighRiskFacts(comparison.results, retailer);
  totalCost += verification.verified.length * 0.015; // rough estimate per verification
  if (verification.verified.length > 0) {
    const verdicts = verification.verified.map(v => v.verification?.verdict).join(', ');
    step('verify', `${verification.verified.length} facts checked: ${verdicts} (${verification.elapsed}ms)`);
  } else {
    step('verify', 'No high-risk facts to verify');
  }
  
  const elapsed = (Date.now() - startTime) / 1000;
  step('done', `Total: ${elapsed.toFixed(1)}s, ~$${totalCost.toFixed(4)}`);
  
  return {
    retailer,
    site,
    status: 'success',
    elapsed,
    totalCost,
    existingUrl: existing.url,
    existingContentLength: existing.content.length,
    factsExtracted: extracted.facts.length,
    factsDeduped: deduped.deduped,
    gaps: {
      missing: missing.map(m => ({ type: m.type, content: m.content })),
      partial: partial.map(p => ({ type: p.type, content: p.content, similarity: p.similarity })),
      covered: covered.length,
    },
    verification: verification.verified.map(v => ({
      type: v.type,
      content: v.content,
      verdict: v.verification?.verdict,
      explanation: v.verification?.explanation,
      corrected: v.verification?.corrected_fact,
    })),
    log,
  };
}

// ─── CLI ─────────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith('pipeline.mjs')) {
  const retailer = process.argv[2] || "Dick's Sporting Goods";
  const site = process.argv[3] || 'coupons.com';
  
  if (!KEYS.openrouter || !KEYS.perplexity || !KEYS.gemini) {
    console.error('❌ Missing API keys: OPENROUTER_API_KEY, PERPLEXITY_API_KEY, GEMINI_API_KEY');
    process.exit(1);
  }
  
  const result = await runPipeline(retailer, site);
  
  console.log('\n' + '═'.repeat(60));
  console.log(`📊 ${result.retailer}: ${result.status}`);
  console.log(`   Time: ${result.elapsed.toFixed(1)}s | Cost: ~$${result.totalCost.toFixed(4)}`);
  console.log(`   Facts: ${result.factsExtracted} extracted → ${result.factsDeduped} unique`);
  console.log(`   Gaps: ${result.gaps.missing.length} missing, ${result.gaps.partial.length} partial, ${result.gaps.covered} covered`);
  
  if (result.gaps.missing.length > 0) {
    console.log(`\n   ❌ MISSING:`);
    for (const m of result.gaps.missing) {
      console.log(`      [${m.type}] ${m.content.slice(0, 80)}`);
    }
  }
  if (result.gaps.partial.length > 0) {
    console.log(`\n   ⚠️ PARTIAL:`);
    for (const p of result.gaps.partial) {
      console.log(`      [${p.type}] ${p.content.slice(0, 80)} (${p.similarity}%)`);
    }
  }
  if (result.verification.length > 0) {
    console.log(`\n   ✅ VERIFIED:`);
    for (const v of result.verification) {
      console.log(`      [${v.verdict}] ${v.content.slice(0, 60)} — ${v.explanation?.slice(0, 60) || ''}`);
    }
  }
  console.log('═'.repeat(60));
}
