#!/usr/bin/env node
/**
 * M2.5 Scheduler Agent — decides WHAT to refresh
 * 
 * This is the agentic part: M2.5 looks at staleness data, seasonal context,
 * and budget, then decides which retailers to research and how deep.
 * 
 * The actual per-retailer research uses the fast scripted pipeline.
 * 
 * Usage:
 *   node src/scheduler.mjs --budget 5.00 --max 50 retailers-state.json
 */
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { CONFIG, KEYS, SEASONAL_CALENDAR } from './config.mjs';
import { callM25 } from './apis.mjs';
import { runPipeline } from './pipeline.mjs';

// ─── Staleness Scoring ──────────────────────────────────────────────

function getSeasonalContext() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  
  const active = [];
  for (const [name, event] of Object.entries(SEASONAL_CALENDAR)) {
    const [sm, sd] = event.start;
    const [pm, pd] = event.peak;
    if ((month === sm && day >= sd) || (month === pm && day <= pd) ||
        (month > sm && month < pm)) {
      active.push({ name, categories: event.categories, daysUntilPeak: (pm - month) * 30 + (pd - day) });
    }
  }
  return active;
}

function computeStaleness(retailer, seasonalEvents) {
  const daysSinceResearch = retailer.lastResearched
    ? (Date.now() - new Date(retailer.lastResearched).getTime()) / 86400000
    : 999;
  
  const base = Math.min(daysSinceResearch / 30, 1.0);
  const priorityMult = { high: 1.5, medium: 1.0, low: 0.5 }[retailer.priority || 'medium'];
  const gapPenalty = (retailer.lastGapCount || 0) > 5 ? 0.2 : 0;
  
  // Seasonal boost
  let seasonalBoost = 0;
  for (const event of seasonalEvents) {
    if (event.categories.includes('*') || 
        event.categories.some(c => (retailer.categories || []).includes(c))) {
      seasonalBoost = Math.max(seasonalBoost, 0.3);
    }
  }
  
  return (base + gapPenalty + seasonalBoost) * priorityMult;
}

// ─── M2.5 Scheduling Decision ───────────────────────────────────────

async function getSchedulingDecision(retailers, budget, maxRetailers, seasonalEvents) {
  // Pre-compute staleness scores
  const scored = retailers.map(r => ({
    ...r,
    staleness: computeStaleness(r, seasonalEvents),
  })).sort((a, b) => b.staleness - a.staleness);
  
  const top = scored.slice(0, Math.min(maxRetailers * 2, 100)); // Show M2.5 top candidates
  
  const seasonalDesc = seasonalEvents.length > 0
    ? `Active seasonal events: ${seasonalEvents.map(e => `${e.name} (${e.daysUntilPeak} days to peak, categories: ${e.categories.join(',')})`).join('; ')}`
    : 'No major seasonal events right now.';
  
  const retailerList = top.map(r => 
    `- ${r.name} (${r.site}) | staleness: ${r.staleness.toFixed(2)} | last: ${r.lastResearched || 'never'} | gaps: ${r.lastGapCount || '?'} | priority: ${r.priority || 'medium'} | categories: ${(r.categories || []).join(',') || 'general'}`
  ).join('\n');
  
  const result = await callM25(
    `You are the editorial research scheduler. Decide which retailers to refresh today.`,
    `Budget: $${budget.toFixed(2)} (~$0.05/retailer = max ${Math.floor(budget / 0.05)} retailers)
Max retailers this run: ${maxRetailers}
Today: ${new Date().toISOString().split('T')[0]}
${seasonalDesc}

Retailers ranked by staleness (top ${top.length}):
${retailerList}

Return JSON: {"retailers": [{"name": "...", "site": "...", "reason": "..."}], "skipped_reason": "why others were skipped"}

Pick the most impactful retailers to refresh. Consider:
1. Never-researched retailers are highest priority
2. Seasonal relevance (boost relevant categories)
3. High-priority retailers before low
4. Stay within budget`,
    true
  );
  
  try {
    return JSON.parse(result.content);
  } catch {
    // Fallback: just take top N by staleness
    return {
      retailers: scored.slice(0, maxRetailers).map(r => ({ name: r.name, site: r.site, reason: 'staleness' })),
      skipped_reason: 'M2.5 parse failed, using staleness ranking',
    };
  }
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  
  // Parse args
  let budget = 5.0;
  let maxRetailers = 50;
  let stateFile = 'retailers-state.json';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--budget' && args[i + 1]) { budget = parseFloat(args[i + 1]); i++; }
    else if (args[i] === '--max' && args[i + 1]) { maxRetailers = parseInt(args[i + 1]); i++; }
    else if (args[i].endsWith('.json')) stateFile = args[i];
  }
  
  if (!KEYS.openrouter || !KEYS.perplexity || !KEYS.gemini) {
    console.error('❌ Missing API keys');
    process.exit(1);
  }
  
  // Load retailer state
  if (!existsSync(stateFile)) {
    console.error(`❌ State file not found: ${stateFile}`);
    console.log('Create a JSON array of retailers: [{"name": "Target", "site": "coupons.com", "priority": "high", "categories": ["general"]}]');
    process.exit(1);
  }
  
  const retailers = JSON.parse(await readFile(stateFile, 'utf-8'));
  const seasonalEvents = getSeasonalContext();
  
  console.log('═'.repeat(60));
  console.log('🧠 M2.5 SCHEDULER');
  console.log(`   ${retailers.length} retailers | Budget: $${budget} | Max: ${maxRetailers}`);
  console.log(`   Seasonal: ${seasonalEvents.map(e => e.name).join(', ') || 'none'}`);
  console.log('═'.repeat(60));
  
  // Get M2.5's scheduling decision
  console.log('\n📋 Asking M2.5 what to refresh...');
  const decision = await getSchedulingDecision(retailers, budget, maxRetailers, seasonalEvents);
  
  console.log(`\n🎯 M2.5 selected ${decision.retailers.length} retailers:`);
  for (const r of decision.retailers) {
    console.log(`   • ${r.name} (${r.site}) — ${r.reason}`);
  }
  if (decision.skipped_reason) {
    console.log(`   Skipped: ${decision.skipped_reason}`);
  }
  
  // Run pipeline on selected retailers
  console.log(`\n🚀 Running pipeline on ${decision.retailers.length} retailers...`);
  
  const results = [];
  for (let i = 0; i < decision.retailers.length; i += CONFIG.parallelRetailers) {
    const batch = decision.retailers.slice(i, i + CONFIG.parallelRetailers);
    const batchResults = await Promise.allSettled(
      batch.map(r => runPipeline(r.name, r.site))
    );
    results.push(...batchResults.map(r => r.status === 'fulfilled' ? r.value : { status: 'error', error: r.reason?.message }));
  }
  
  // Update state with results
  const now = new Date().toISOString();
  for (const result of results) {
    if (result.status !== 'success') continue;
    const retailer = retailers.find(r => r.name === result.retailer && r.site === result.site);
    if (retailer) {
      retailer.lastResearched = now;
      retailer.lastGapCount = result.gaps?.missing?.length || 0;
      retailer.lastCost = result.totalCost;
    }
  }
  
  // Save updated state
  await writeFile(stateFile, JSON.stringify(retailers, null, 2));
  console.log(`\n💾 Updated ${stateFile}`);
  
  // Summary
  const succeeded = results.filter(r => r.status === 'success');
  const totalCost = succeeded.reduce((s, r) => s + (r.totalCost || 0), 0);
  console.log('\n' + '═'.repeat(60));
  console.log(`📊 SCHEDULER RUN COMPLETE`);
  console.log(`   ${succeeded.length}/${results.length} succeeded | $${totalCost.toFixed(4)} spent | Budget remaining: $${(budget - totalCost).toFixed(2)}`);
  console.log('═'.repeat(60));
}

main().catch(console.error);
