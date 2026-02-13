#!/usr/bin/env node
/**
 * Batch test — run orchestrator on 5 retailers sequentially
 * Uses spawn with inherited stdio for real-time output
 */

import { spawnSync } from 'child_process';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const RETAILERS = [
  { name: "Target", site: "coupons.com" },
  { name: "Best Buy", site: "coupons.com" },
  { name: "Nike", site: "coupons.com" },
  { name: "IKEA", site: "coupons.com" },
  { name: "Walmart", site: "coupons.com" },
];

const results = [];

for (const { name, site } of RETAILERS) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🚀 Starting: ${name} × ${site}`);
  console.log(`${'═'.repeat(70)}\n`);
  
  const start = Date.now();
  const child = spawnSync('node', ['orchestrator.mjs', name, site], {
    cwd: __dirname,
    env: process.env,
    timeout: 300000,
    stdio: ['pipe', 'pipe', 'inherit'],  // capture stdout, inherit stderr
    encoding: 'utf-8',
  });
  
  const output = child.stdout || '';
  // Print captured output
  process.stdout.write(output);
  
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  
  const turnsMatch = output.match(/Turns:\s+(\d+)/);
  const costMatch = output.match(/Est\. cost:\s+\$([0-9.]+)/);
  const turns = turnsMatch ? parseInt(turnsMatch[1]) : 0;
  const cost = costMatch ? parseFloat(costMatch[1]) : 0;
  
  const gapMatch = output.match(/\[Decision\/gap\]([\s\S]*?)(?=─{10,}|═{10,}|$)/);
  const gapSummary = gapMatch ? gapMatch[1].trim().slice(0, 2000) : 'No gap assessment found';
  
  const perplexityCalls = (output.match(/\[Perplexity\]/g) || []).length;
  const extractCalls = (output.match(/\[Extract\]/g) || []).length;
  const dedupeCalls = (output.match(/\[Dedupe\]/g) || []).length;
  const compareCalls = (output.match(/\[Compare\]/g) || []).length;
  const verifyCalls = (output.match(/\[Verify\]/g) || []).length;
  const scrapeCalls = (output.match(/\[Scrape\]/g) || []).length;
  
  const status = child.status === 0 ? 'success' : 'failed';
  
  results.push({
    retailer: name, site, status, turns, elapsed, cost,
    pipeline: { perplexityCalls, extractCalls, dedupeCalls, compareCalls, verifyCalls, scrapeCalls },
    gapSummary,
  });
  
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`${status === 'success' ? '✅' : '❌'} ${name}: ${turns} turns, ${elapsed}s, $${cost.toFixed(4)}`);
  console.log(`Pipeline: ${perplexityCalls}× perplexity, ${extractCalls}× extract, ${dedupeCalls}× dedupe, ${compareCalls}× compare, ${verifyCalls}× verify`);
}

// Final report
console.log('\n\n' + '═'.repeat(70));
console.log('📊 BATCH TEST REPORT — 5 RETAILERS');
console.log('═'.repeat(70));

let totalCost = 0, totalTime = 0, successCount = 0;

for (const r of results) {
  const icon = r.status === 'success' ? '✅' : '❌';
  console.log(`\n${icon} ${r.retailer}`);
  console.log(`   ${r.turns} turns | ${r.elapsed}s | $${r.cost.toFixed(4)}`);
  console.log(`   Pipeline: ${r.pipeline.perplexityCalls}p ${r.pipeline.extractCalls}e ${r.pipeline.dedupeCalls}d ${r.pipeline.compareCalls}c ${r.pipeline.verifyCalls}v`);
  if (r.status === 'success') { totalCost += r.cost; successCount++; }
  totalTime += parseFloat(r.elapsed);
}

console.log('\n' + '─'.repeat(70));
console.log(`${successCount}/${results.length} succeeded | Total M2.5: $${totalCost.toFixed(4)} | Avg: ${(totalTime / results.length).toFixed(0)}s/retailer`);
if (successCount > 0) console.log(`Projected 200/day: $${(totalCost / successCount * 200).toFixed(2)}/day (M2.5 only)`);
console.log('═'.repeat(70));

writeFileSync('batch-results.json', JSON.stringify(results, null, 2));
console.log('\nSaved to batch-results.json');
