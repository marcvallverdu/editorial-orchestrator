#!/usr/bin/env node
/**
 * Batch runner — parallel retailer research
 * 
 * Usage:
 *   node src/batch.mjs                          # default 5 test retailers
 *   node src/batch.mjs retailers.json            # from JSON file
 *   node src/batch.mjs --site coupons.com "Target,Best Buy,Nike,IKEA,Walmart"
 */
import { writeFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { CONFIG, KEYS } from './config.mjs';
import { runPipeline } from './pipeline.mjs';

const DEFAULT_RETAILERS = [
  { name: "Target", site: "coupons.com" },
  { name: "Best Buy", site: "coupons.com" },
  { name: "Nike", site: "coupons.com" },
  { name: "IKEA", site: "coupons.com" },
  { name: "Walmart", site: "coupons.com" },
];

async function loadRetailers() {
  const args = process.argv.slice(2);
  
  // JSON file input
  if (args[0]?.endsWith('.json')) {
    const data = JSON.parse(await readFile(args[0], 'utf-8'));
    return data;
  }
  
  // CLI comma-separated with --site
  const siteIdx = args.indexOf('--site');
  if (siteIdx >= 0 && args[siteIdx + 1] && args[siteIdx + 2]) {
    const site = args[siteIdx + 1];
    const names = args[siteIdx + 2].split(',').map(s => s.trim());
    return names.map(name => ({ name, site }));
  }
  
  // Single retailer + site
  if (args.length >= 2) {
    return [{ name: args[0], site: args[1] }];
  }
  
  return DEFAULT_RETAILERS;
}

async function runBatch(retailers) {
  const startTime = Date.now();
  console.log('═'.repeat(60));
  console.log(`🦞 EDITORIAL RESEARCH BATCH — ${retailers.length} retailers`);
  console.log(`   Concurrency: ${CONFIG.parallelRetailers}`);
  console.log('═'.repeat(60));
  
  const results = [];
  
  // Process in parallel batches
  for (let i = 0; i < retailers.length; i += CONFIG.parallelRetailers) {
    const batch = retailers.slice(i, i + CONFIG.parallelRetailers);
    const batchNum = Math.floor(i / CONFIG.parallelRetailers) + 1;
    const totalBatches = Math.ceil(retailers.length / CONFIG.parallelRetailers);
    
    console.log(`\n── Batch ${batchNum}/${totalBatches}: ${batch.map(r => r.name).join(', ')} ──`);
    
    const batchResults = await Promise.allSettled(
      batch.map(r => runPipeline(r.name, r.site))
    );
    
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          status: 'error',
          error: result.reason?.message || 'Unknown error',
        });
      }
    }
  }
  
  // Report
  const elapsed = (Date.now() - startTime) / 1000;
  const succeeded = results.filter(r => r.status === 'success');
  const totalCost = succeeded.reduce((sum, r) => sum + (r.totalCost || 0), 0);
  const totalGaps = succeeded.reduce((sum, r) => sum + (r.gaps?.missing?.length || 0), 0);
  const avgTime = succeeded.length > 0
    ? succeeded.reduce((sum, r) => sum + r.elapsed, 0) / succeeded.length
    : 0;
  
  console.log('\n\n' + '═'.repeat(60));
  console.log('📊 BATCH REPORT');
  console.log('═'.repeat(60));
  
  for (const r of results) {
    if (r.status === 'success') {
      const m = r.gaps?.missing?.length || 0;
      const p = r.gaps?.partial?.length || 0;
      console.log(`  ✅ ${r.retailer}: ${m} missing, ${p} partial | ${r.elapsed.toFixed(0)}s | $${r.totalCost.toFixed(4)}`);
    } else {
      console.log(`  ❌ ${r.retailer || 'unknown'}: ${r.error || r.reason || 'failed'}`);
    }
  }
  
  console.log('─'.repeat(60));
  console.log(`  ${succeeded.length}/${results.length} succeeded`);
  console.log(`  Total time: ${elapsed.toFixed(0)}s (wall) | Avg: ${avgTime.toFixed(0)}s/retailer`);
  console.log(`  Total M2.5 cost: $${totalCost.toFixed(4)}`);
  console.log(`  Total gaps found: ${totalGaps} missing facts`);
  if (succeeded.length > 0) {
    console.log(`  Projected 200/day: $${(totalCost / succeeded.length * 200).toFixed(2)}/day`);
  }
  console.log('═'.repeat(60));
  
  // Save
  const outFile = `batch-results-${new Date().toISOString().slice(0, 16).replace(/:/g, '')}.json`;
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\nSaved to ${outFile}`);
  
  return results;
}

// ─── Main ────────────────────────────────────────────────────────────

if (!KEYS.openrouter || !KEYS.perplexity || !KEYS.gemini) {
  console.error('❌ Missing API keys: OPENROUTER_API_KEY, PERPLEXITY_API_KEY, GEMINI_API_KEY');
  process.exit(1);
}

const retailers = await loadRetailers();
await runBatch(retailers);
