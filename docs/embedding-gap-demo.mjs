#!/usr/bin/env node
/**
 * Embedding Gap Detection Demo
 * Compares researched facts against existing page content
 * Uses Gemini embeddings
 */

const GEMINI_KEY = process.env.GEMINI_API_KEY;

// --- DATA ---

// Existing content from coupons.com/dicks-sporting-goods (chunked)
const existingChunks = [
  "2% Cashback all year round. The offer is intended exclusively for new customers. To be eligible for cashback, you must begin your purchase with an empty shopping cart. Cashback can only be combined with offers and/or coupon codes published on the Coupons.com website.",
  "Cashback is earned on the qualifying purchase total after any discounts and before any fees, taxes, or shipping. Cashback is not eligible on gift cards. Cashback will be voided on canceled or returned purchases.",
  "Get $20 off $100+ at Dick's Sporting Goods when you sign up for texts. This promotion applies to new subscribers only. This discount works on gear, apparel, and footwear.",
  "Free shipping for ScoreRewards members. Log in to your account to get this offer. This applies every time you shop.",
  "Spend $65 or more to get free shipping at Dick's Sporting Goods. You can buy anything from any category.",
  "10% off for nurses through ID.me verification. Each promo code may be applied towards one eligible product. You may receive a new promo code every 2 weeks.",
  "10% off for healthcare workers through ID.me. Once verified, you'll receive a promo code. You can redeem two promo codes per month.",
  "Earn $30 bonus when you open and use ScoreRewards Credit Card. New cardholders only. Earn 10% back on qualifying purchases - 3 points per $1 spent."
];

// Researched facts from Perplexity (structured)
const researchedFacts = [
  { type: "return_policy", content: "Dick's Sporting Goods offers a 90-day return window from the date of purchase for in-store purchases and from the original shipment date for online purchases." },
  { type: "return_policy", content: "Items must be in clean, resalable condition with valid proof of purchase such as order confirmation email, sales receipt, or order number." },
  { type: "return_policy", content: "Returns with valid proof of purchase receive refunds to the original payment method, while returns without proof of purchase receive store credit." },
  { type: "return_policy", content: "You can return online purchases to any Dick's location nationwide." },
  { type: "return_policy", content: "Bicycles have a 24-hour return window for a full refund if unused, with potential restocking charges after." },
  { type: "return_policy", content: "Mail returns may incur return shipping costs for oversized items, with refunds taking 7-10 business days." },
  { type: "price_match", content: "Dick's Sporting Goods offers a Best Price Guarantee, matching lower prices found elsewhere." },
  { type: "loyalty", content: "ScoreCard rewards program: customers earn one point for every $1 spent and receive a $10 reward for every 300 points accumulated." },
  { type: "loyalty", content: "When rewards or coupons are redeemed on returns, the refund amount is adjusted accordingly." },
];

// --- EMBEDDING FUNCTIONS ---

async function embed(text) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] }
      })
    }
  );
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Embedding failed: ${err}`);
  }
  
  const data = await response.json();
  return data.embedding.values;
}

function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// --- MAIN ---

async function main() {
  if (!GEMINI_KEY) {
    console.error('❌ GEMINI_API_KEY not set');
    process.exit(1);
  }

  console.log('🔄 Embedding existing page chunks...\n');
  
  // Embed existing content
  const chunkEmbeddings = [];
  for (const chunk of existingChunks) {
    const embedding = await embed(chunk);
    chunkEmbeddings.push({ text: chunk, embedding });
    process.stdout.write('.');
  }
  console.log(` Done! (${chunkEmbeddings.length} chunks)\n`);

  console.log('🔄 Embedding researched facts...\n');
  
  // Embed researched facts
  const factEmbeddings = [];
  for (const fact of researchedFacts) {
    const embedding = await embed(fact.content);
    factEmbeddings.push({ type: fact.type, text: fact.content, embedding });
    process.stdout.write('.');
  }
  console.log(` Done! (${factEmbeddings.length} facts)\n`);

  console.log('📊 Comparing facts against existing content...\n');
  console.log('='.repeat(80));

  const gaps = [];

  for (const fact of factEmbeddings) {
    // Find best matching chunk
    let bestSimilarity = 0;
    let bestChunk = '';
    
    for (const chunk of chunkEmbeddings) {
      const similarity = cosineSimilarity(fact.embedding, chunk.embedding);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestChunk = chunk.text;
      }
    }

    // Determine status
    let status;
    if (bestSimilarity > 0.85) {
      status = '✅ COVERED';
    } else if (bestSimilarity > 0.70) {
      status = '⚠️ PARTIAL';
    } else {
      status = '❌ MISSING';
    }

    gaps.push({
      type: fact.type,
      fact: fact.text,
      bestMatch: bestChunk,
      similarity: bestSimilarity,
      status
    });

    // Print result
    console.log(`\n[${fact.type.toUpperCase()}] ${status} (similarity: ${(bestSimilarity * 100).toFixed(1)}%)`);
    console.log(`  Fact: "${fact.text.slice(0, 80)}..."`);
    if (bestSimilarity > 0.5) {
      console.log(`  Best match: "${bestChunk.slice(0, 60)}..."`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n📋 SUMMARY\n');
  
  const missing = gaps.filter(g => g.status === '❌ MISSING');
  const partial = gaps.filter(g => g.status === '⚠️ PARTIAL');
  const covered = gaps.filter(g => g.status === '✅ COVERED');

  console.log(`✅ Covered: ${covered.length}`);
  console.log(`⚠️ Partial: ${partial.length}`);
  console.log(`❌ Missing: ${missing.length}`);

  if (missing.length > 0) {
    console.log('\n🚨 MISSING FACTS (should add to page):\n');
    for (const m of missing) {
      console.log(`  • [${m.type}] ${m.fact}`);
    }
  }

  if (partial.length > 0) {
    console.log('\n⚠️ PARTIAL MATCHES (review/update):\n');
    for (const p of partial) {
      console.log(`  • [${p.type}] ${p.fact}`);
      console.log(`    Current: "${p.bestMatch.slice(0, 50)}..."`);
    }
  }
}

main().catch(console.error);
