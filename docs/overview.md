# Editorial Content Research System — Architecture

*Created: 2026-02-05*
*Status: Proof of Concept VALIDATED ✅*

## Context

~200 editors managing content on ~50 Atolls sites (hotukdeals.com, coupons.com, etc.). Current workflow: editors manually research retailer sites → paraphrase in brand voice → add editorial content. Using Perplexity for some research.

**Goal:** Rebuild from scratch with automated research, embeddings-based gap detection, and AI-assisted content generation.

---

## ✅ Proof of Concept Results (2026-02-05)

Tested on: **coupons.com/coupon-codes/dicks-sporting-goods**

| Metric | Result |
|--------|--------|
| Facts researched | 9 (from Perplexity) |
| Existing chunks | 8 (from page) |
| Gaps found | 6 missing, 3 partial |
| Pipeline time | ~5 seconds |
| Total cost | ~$0.01 |

**Key finding:** The page has zero return policy info — a major gap that shoppers care about.

### Demo script
- [[editorial-research-system/embedding-gap-demo.mjs]] — gap detection + comparison

---

## The Pipeline (4 Stages)

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  1. RESEARCH    │ →  │  2. NORMALIZE   │ →  │  3. COMPARE     │ →  │  4. GENERATE    │
│  (Multi-source) │    │  (Structured)   │    │  (Embeddings)   │    │  (LLM + Review) │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 1. Research Layer (Data Ingestion)

Multiple sources, each with different strengths:

| Source | Best For | Speed | Cost |
|--------|----------|-------|------|
| **Direct fetch** (simple HTTP) | Static pages, basic HTML | ⚡ Fast | Free |
| **Firecrawl** | JS-rendered sites, full crawls | Medium | ~$1/1k pages |
| **Perplexity API** | Synthesized facts, "what are Dick's return policies" | Medium | ~$5/1k queries |
| **Retailer APIs** (where available) | Structured product data | ⚡ Fast | Free |
| **Unbrowse** (internal APIs) | Competitor sites, loyalty programs | Fast after capture | Free |

**Recommendation:** Use **both Perplexity + Firecrawl**, then dedupe with embeddings:

```
PERPLEXITY (broad)     FIRECRAWL (specific)
     │                        │
     └──────────┬─────────────┘
                ▼
        COMBINE ALL FACTS
                │
                ▼
        EMBED ALL FACTS
                │
                ▼
     DEDUPE VIA SIMILARITY
     (>0.90 = same fact)
                │
                ▼
       FINAL FACT SET
```

**Why both:**
- **Perplexity** (~$0.01): sales calendar, policies, multi-page synthesis
- **Firecrawl+LLM** (~$0.003/page): current promos, exact pricing, page-specific details
- **Embeddings**: merge duplicates, keep most detailed version

**Coverage comparison (tested on Target + IKEA):**
| Source | Facts Found | Unique Finds |
|--------|-------------|--------------|
| Perplexity | 10/11 | Sales calendar, price match policy |
| Firecrawl | 8/11 | Birthday treats, workshops, exact promo wording |
| **Combined** | **11/11** | Complete coverage |

**Cost per retailer:** ~$0.02-0.03 for comprehensive research

### PoC Learning: Perplexity as primary research source

#### Bash script (convenience wrapper)

```bash
~/clawd/scripts/perplexity-search.sh "Dick's Sporting Goods return policy shipping policy student discount military discount price match policy loyalty program ScoreRewards" 2000 sonar
```

#### Direct API call (for replication)

```bash
curl -s https://api.perplexity.ai/chat/completions \
  -H "Authorization: Bearer $PERPLEXITY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonar",
    "messages": [{
      "role": "user", 
      "content": "Dick'\''s Sporting Goods return policy shipping policy student discount military discount price match policy loyalty program ScoreRewards"
    }],
    "max_tokens": 2000,
    "return_citations": true
  }'
```

#### JavaScript/TypeScript version

```javascript
async function researchRetailer(retailerName, topics) {
  const query = `${retailerName} ${topics.join(' ')}`;
  
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',  // or 'sonar-pro' for deeper research
      messages: [{ role: 'user', content: query }],
      max_tokens: 2000,
      return_citations: true,
    }),
  });
  
  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    sources: data.citations || [],
  };
}

// Usage
const facts = await researchRetailer("Dick's Sporting Goods", [
  "return policy",
  "shipping policy", 
  "student discount",
  "military discount",
  "price match policy",
  "loyalty program ScoreRewards"
]);
```

#### Perplexity models

| Model | Use case | Cost |
|-------|----------|------|
| `sonar` | Fast, good for most queries | ~$0.005/query |
| `sonar-pro` | Deeper research, more sources | ~$0.01/query |
| `sonar-reasoning` | Complex questions, shows thinking | ~$0.02/query |

#### Actual response from PoC

The query above returned:

> **Return Policy:** Dick's offers a **90-day return window** from purchase date (in-store) or shipment date (online). Items must be clean, resalable, with proof of purchase. With receipt → refund to original payment. Without → store credit. Online purchases can be returned to any store nationwide. Bicycles have 24-hour window if unused.
>
> **Price Match:** Best Price Guarantee — matches lower prices found elsewhere.
>
> **Loyalty:** ScoreCard program — 1 point per $1 spent, $10 reward per 300 points.
>
> **Student/Military:** No info found in search results.

**Sources returned:** receiptor.ai, closo.co, oreateai.com, dickssportinggoods.com (official)

Returns synthesized facts with sources — much better than scraping multiple pages.

#### Comprehensive Research Query Template

Use `sonar-pro` with this exhaustive topic list for maximum coverage:

```
{RETAILER_NAME} ALL savings opportunities comprehensive guide:

DISCOUNTS: student discount, military discount, veterans discount, nurse discount, healthcare worker discount, first responder discount, teacher discount, educator discount, senior citizen discount, AARP discount, AAA discount, employee discount, birthday discount, referral program, friends and family sale, influencer codes

LOYALTY: loyalty program, rewards program, credit card benefits APR cashback, points earning rate, bonus points events, double points days, member exclusive sales, early access deals, tier levels

CODES AND COUPONS: newsletter signup code, text signup code, app download code, first order discount, welcome offer, abandoned cart email codes, seasonal promo codes, sitewide codes, category codes, brand specific codes, stackable coupons

SHIPPING: free shipping threshold, free shipping codes, expedited shipping deals, same day delivery, curbside pickup discounts, ship to store, free returns

PRICE POLICIES: price match guarantee competitors list, price adjustment policy days, rain check policy, ad match

PAYMENT: credit card benefits, financing options, buy now pay later, Afterpay Klarna Affirm, gift card promotions, gift card discounts, layaway

SALES CALENDAR: Black Friday, Cyber Monday, Christmas sale, New Years sale, Presidents Day sale, Memorial Day sale, Fourth of July sale, Labor Day sale, back to school sale, spring sale, summer sale, fall clearance, winter clearance, flash sales, daily deals, weekly ad, clearance schedule, warehouse sale, anniversary sale

PROGRAMS: trade in program, recycling program, equipment rental, team sales bulk discount, corporate accounts, league discounts, school discounts

OTHER: browser extensions cashback, Rakuten cashback, outlet store locations, factory store deals, open box deals, refurbished items, best time to buy, seasonal buying guide, protection plans, warranty
```

#### Example: Full Dick's Research Response

Using the comprehensive query above with `sonar-pro`, we extracted:

**Discounts Found:**
| Type | Details |
|------|---------|
| Military/Veterans | 10% off (ID.me verified) |
| Healthcare Workers | 10% off select footwear |
| Partner Programs | 20% off via youth clubs, leagues, schools |

**Loyalty (ScoreCard):**
- 2x points per $1 (6% back), 3x during promos (10% back)
- Free shipping: $49+ (members) vs $65+ (regular)
- ScoreCard Gold tier after $499/year

**Codes:**
- Newsletter: 10% off first order
- Email + text: $20 off $100+
- App: $20 off $100+ + early flash sale access

**Shipping:**
- $65+ free (standard), $49+ (ScoreCard)
- 1-hour curbside pickup

**Sales Calendar:**
- Black Friday: "10 Days of Deals" up to 70% off
- Hot Summer Deals: Late May, up to 50% off
- Weekly ad: up to 50% off
- End-of-season clearance: 50% off

**Not Found (gaps to fill via scraping):**
- Student, teacher, senior, AARP, AAA, birthday discounts
- Price adjustment policy
- BNPL options (Afterpay/Klarna/Affirm)
- Trade-in programs
- Outlet store info

#### Global Template (validated across 8 retailers, 4 languages)

**One English template works globally** — Perplexity handles translation/context automatically.

Tested on:
- 🇺🇸 US: Target, Walmart, Best Buy
- 🇪🇺 EU: IKEA, H&M, Zalando
- 🇪🇸 Spain: El Corte Inglés (English prompt → Spanish sources)
- 🇫🇷 France: Fnac (English prompt → French sources)

```
{RETAILER} ALL savings opportunities comprehensive guide 2026:

DISCOUNTS: student discount, military discount, veterans discount, healthcare worker discount, first responder discount, teacher discount, senior discount, employee discount, birthday discount, referral program, friends and family sale

LOYALTY: loyalty program, rewards program, membership benefits, credit card benefits, points earning rate, bonus points events, member exclusive sales, early access deals, program tiers

CODES AND COUPONS: newsletter signup code, email signup code, app download code, first order discount, welcome offer, seasonal promo codes, sitewide codes, stackable coupons

SHIPPING: free shipping threshold, free delivery, delivery costs, same day delivery, click and collect, free returns

PRICE POLICIES: price match guarantee, price adjustment policy, lower price guarantee

PAYMENT: store credit card, financing options, buy now pay later, interest free credit, gift card promotions

SALES CALENDAR: Black Friday, Cyber Monday, January sale, summer sale, seasonal clearance, flash sales, weekly deals, clearance schedule, mid season sale, end of season sale

PROGRAMS: trade in program, recycling program, product buyback, bulk discount, business accounts

OTHER: outlet stores, outlet section, clearance section, open box deals, ex display items, best time to buy, membership benefits
```

**Cost:** ~$0.01 per retailer with `sonar-pro`

#### Cross-Retailer Validation Results

See [[perplexity-validation-results]] for full responses.

**US Retailers:**

| Retailer | Student | Loyalty | Price Match | Trade-in | Key Finding |
|----------|---------|---------|-------------|----------|-------------|
| Target | ✅ $4.99/mo Circle 360 | Circle + Circle 360 | ✅ Year-round | ❌ | 5% off with Circle Card |
| Walmart | ❌ | Walmart+ ($98/yr) | ❌ | ❌ | 10% employee discount |
| Best Buy | ❌ | My Best Buy (free/Plus) | ✅ | ✅ $500 | Open box outlet 50% off |

**EU/Global Retailers:**

| Retailer | Student | Loyalty | Price Match | Recycling | Key Finding |
|----------|---------|---------|-------------|-----------|-------------|
| IKEA | ❌ | IKEA Family (free) | ✅ 90-day adjust | ✅ Buyback | As-Is section, ex-display |
| H&M | ✅ 10% UNiDAYS | 1pt/£1, £3/100pts | ❌ | ✅ 15% coupon | Referral: 75 pts |
| Zalando | ✅ 10% | Lounge app (75% off) | ✅ Contact CS | ❌ | 100-day free returns, Klarna |

**Non-English Markets (English prompt works):**

| Retailer | Country | Loyalty | Key Finding |
|----------|---------|---------|-------------|
| El Corte Inglés | 🇪🇸 Spain | Club Card + Tourist Card | 10% store credit, 21% VAT refund, 8% fuel vouchers |
| Fnac | 🇫🇷 France | Fnac+ (10€/yr) | 10€/100€ spent, 10x interest-free, UNiDAYS student |

---

### Firecrawl: JS-Rendered Page Scraping

Use Firecrawl when Perplexity gaps exist (current promos, exact pricing, page-specific details).

#### CLI (single page scrape)

```bash
# Basic markdown scrape
firecrawl https://www.target.com/circle

# Main content only (strips nav/footer)
firecrawl https://www.target.com/circle --only-main-content

# Wait for JS rendering
firecrawl https://www.target.com/circle --wait-for 3000

# Filter to specific sections
firecrawl https://www.target.com/circle --include-tags article,main

# Multiple formats (returns JSON)
firecrawl https://www.target.com/circle --format markdown,links --pretty
```

#### Search + Scrape

```bash
# Search and auto-scrape results
firecrawl search "Target student discount 2026" --limit 5 --scrape --scrape-formats markdown

# Time-filtered search
firecrawl search "Target Black Friday deals" --tbs qdr:w --limit 10
```

#### Crawl (entire site section)

```bash
# Crawl deals section
firecrawl crawl https://www.target.com/c/ways-to-save --limit 50 --max-depth 2 --wait

# Save results
firecrawl crawl https://www.target.com/c/ways-to-save --wait --pretty -o target-deals.json
```

#### Extract Mode (structured data from URLs)

`/extract` combines scraping + LLM extraction in one call. Supports wildcards and schemas.

```javascript
import Firecrawl from '@mendable/firecrawl-js';

const app = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

// Extract structured data from retailer page
const result = await app.extract({
  urls: ['https://www.target.com/circle'],
  prompt: `Extract all savings opportunities:
    - Loyalty program name and benefits
    - Points earning rate
    - Member-exclusive discounts
    - Free shipping threshold
    - Credit card benefits`,
  schema: {
    type: 'object',
    properties: {
      loyalty_program: { type: 'string' },
      points_rate: { type: 'string' },
      member_discounts: { type: 'array', items: { type: 'string' } },
      free_shipping_threshold: { type: 'string' },
      credit_card_benefits: { type: 'array', items: { type: 'string' } }
    }
  }
});

console.log(result.data);
```

##### Wildcard extraction (entire section)

```javascript
// Extract from all pages in a section
const result = await app.extract({
  urls: ['https://www.target.com/c/ways-to-save/*'],  // Wildcard!
  prompt: 'Extract all current promotions and discounts',
  enableWebSearch: true  // Follow links outside domain
});
```

##### FIRE-1 agent (for complex navigation)

```bash
curl -X POST https://api.firecrawl.dev/v2/extract \
  -H "Authorization: Bearer $FIRECRAWL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://www.target.com/circle"],
    "prompt": "Extract all Circle membership tiers, benefits, and earning rates",
    "agent": { "model": "FIRE-1" }
  }'
```

**Cost:** Credits-based (15 tokens per credit). Check dashboard for usage.

---

#### LLM + Firecrawl combo (manual approach)

```javascript
// 1. Scrape with Firecrawl
const pageContent = await firecrawl.scrape(url, { formats: ['markdown'] });

// 2. Extract facts with LLM
const facts = await extractFacts(pageContent.markdown, retailerName);
```

**Cost:** ~$0.001/page for scrape, ~$0.002/page with LLM extraction = ~$0.003/page total

---

### ⚠️ Firecrawl Agent Mode (NOT YET TESTED)

Firecrawl has a new `/agent` API that could replace Perplexity + Firecrawl combo. Uses Spark-1 models to search, navigate, and extract data autonomously.

#### Potential use case for editorial research

```javascript
import Firecrawl from '@mendable/firecrawl-js';

const app = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

// Agent mode — just describe what you want
const result = await app.agent({
  prompt: `Find all savings opportunities for Target:
    - Student/military/senior discounts
    - Loyalty program (Target Circle) benefits
    - Current promo codes
    - Free shipping threshold
    - Price match policy
    - Credit card benefits
    - Sales calendar (Black Friday, etc.)`,
  model: 'spark-1-mini', // or 'spark-1-pro' for complex research
  // Optional: JSON schema for structured output
});

console.log(result.data);
```

#### Models

| Model | Cost | Best For |
|-------|------|----------|
| `spark-1-mini` | 60% cheaper | Simple extraction, high volume |
| `spark-1-pro` | Standard | Complex research, critical accuracy |

#### Why we haven't tested it yet

- **Perplexity works well** and is proven (~$0.01/query)
- **Agent pricing is dynamic** — harder to predict costs at scale
- **5 free daily runs** for testing

### ✅ Comparison Test Results (Target, 2026-02-06)

Tested Perplexity (mega prompt) vs Firecrawl Agent on Target:

| Fact | Perplexity | Agent | Winner |
|------|------------|-------|--------|
| Loyalty tiers (Circle/360/Card) | ✅ Detailed | ✅ Detailed | Tie |
| Shipping thresholds | ✅ | ✅ | Tie |
| Sales calendar | ✅ "Circle weeks, Black Friday" | ✅ "Weekly ad, clearance" | Tie |
| Military discount | ❌ "No specific mentions" | ✅ "Seasonal 10%" | **Agent** |
| Student discount | ❌ "No specific mentions" | ✅ "Verified college offers" | **Agent** |
| Teacher discount | ❌ Not mentioned | ✅ "Seasonal K-12/university" | **Agent** |
| Price match policy | ❌ "No explicit guarantee" | ✅ "July 2025: own prices only" | **Agent** |
| Registry discount | ❌ Not mentioned | ✅ "15% completion discount" | **Agent** |

**Key insight:** Perplexity synthesizes from blogs/news; Agent navigates into help pages and policy docs.

**Costs:**
- Perplexity: ~$0.01 (sonar-pro)
- Agent: 0 credits (free daily runs? or ~15-30 credits normally)
- Extract: 24 credits (FAILED on JS-heavy page)

---

### 🏆 Recommended: Hybrid Approach

**Best coverage = Perplexity + Agent, then dedupe:**

```
┌─────────────────────────────────────────────────────────────────┐
│  1. PERPLEXITY (broad)          2. AGENT (deep)                 │
│  Mega prompt → markdown         Structured prompt → JSON        │
│  ~3 seconds, ~$0.01             ~40 seconds, ~$0.02?            │
└──────────────────────┬──────────────────────────────────────────┘
                       ▼
              COMBINE ALL FACTS
                       │
                       ▼
              EMBED + DEDUPE
              (>0.90 = same fact)
                       │
                       ▼
              FINAL FACT SET
```

#### Perplexity mega prompt (broad coverage)

```
{RETAILER} ALL savings opportunities comprehensive guide 2026:

DISCOUNTS: student discount, military discount, veterans discount, healthcare worker discount, first responder discount, teacher discount, senior discount, employee discount, birthday discount, referral program, friends and family sale

LOYALTY: loyalty program, rewards program, membership benefits, credit card benefits, points earning rate, bonus points events, member exclusive sales, early access deals, program tiers

CODES AND COUPONS: newsletter signup code, email signup code, app download code, first order discount, welcome offer, seasonal promo codes, sitewide codes, stackable coupons

SHIPPING: free shipping threshold, free delivery, delivery costs, same day delivery, click and collect, free returns

PRICE POLICIES: price match guarantee, price adjustment policy, lower price guarantee

PAYMENT: store credit card, financing options, buy now pay later, interest free credit, gift card promotions

SALES CALENDAR: Black Friday, Cyber Monday, January sale, summer sale, seasonal clearance, flash sales, weekly deals, clearance schedule, mid season sale, end of season sale

PROGRAMS: trade in program, recycling program, product buyback, bulk discount, business accounts

OTHER: outlet stores, outlet section, clearance section, open box deals, ex display items, best time to buy, membership benefits
```

#### Firecrawl Agent prompt (deep on discounts/policies)

```
Find all savings opportunities at {RETAILER}:

VERIFIED DISCOUNTS (navigate to official policy pages):
- Student discount program (eligibility, verification method, discount %)
- Military/veteran discount (eligibility, discount %, how to verify)
- Teacher/educator discount
- Healthcare worker/first responder discount
- Senior discount (age requirement, discount %)
- Birthday rewards or discounts

POLICIES (find official policy documents):
- Price match policy (which competitors, timeframe, exclusions)
- Price adjustment policy (days after purchase, requirements)
- Return policy (days, conditions, exceptions)

PROGRAMS:
- Loyalty program tiers and benefits
- Credit card benefits and APR
- Registry completion discounts (baby, wedding)
- Trade-in or recycling programs

Return structured data with source URLs.
```

#### Combined cost estimate

| Step | Cost |
|------|------|
| Perplexity (sonar-pro) | ~$0.01 |
| Firecrawl Agent (spark-1-mini) | ~$0.01-0.02 |
| Embeddings (dedup) | ~$0.001 |
| **Total per retailer** | **~$0.02-0.03** |

Still cheap enough for scale. Better coverage than either alone.

---

### 🔍 Fact Verification (Freshness Check)

Perplexity synthesizes from blogs/news that may be outdated — even when it sounds confident. Agent navigates to official pages but can hallucinate. **Always verify high-risk facts against official sources.**

#### Verification pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  1. PERPLEXITY (broad)          2. AGENT (policies)             │
└──────────────────────┬──────────────────────────────────────────┘
                       ▼
            CLASSIFY EACH FACT BY TYPE
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
   LOW-RISK                      HIGH-RISK
   (trust as-is)          (ALWAYS verify via scrape)
        │                             │
        │                    1. Find official URL
        │                    2. Firecrawl scrape
        │                    3. LLM: Does source confirm?
        │                             │
        └──────────────┬──────────────┘
                       ▼
                 FINAL VERIFIED FACTS
```

#### Risk classification

| Risk Level | Fact Types | Action |
|------------|------------|--------|
| **HIGH** (always verify) | Price match policy, return policy, student discount, military discount, credit card terms/APR, price adjustment policy | Scrape official page |
| **MEDIUM** (verify if suspicious) | Loyalty program tiers, shipping thresholds, payment options | Cross-reference Agent vs Perplexity |
| **LOW** (trust sources) | Sales calendar, clearance schedules, general promo info | Accept from Perplexity/Agent |

**Why always verify HIGH-RISK:** Perplexity might confidently say "Target matches Amazon prices" (outdated) — we'd have no discrepancy to flag. Only official source scraping catches this.

#### Step 1: Find official URLs

**Option A: Scrape retailer help homepage for links**
```bash
# Get help page, extract policy links
firecrawl "https://www.target.com/help" --only-main-content
# Returns links like:
# - Price Match guarantee → /help/articles/policies-guidelines/price-match-guarantee
# - Return Policy → /help/article/return-policy
```

**Option B: Search for specific policy + scrape**
```bash
# Firecrawl search finds official + third-party sources
firecrawl search "Target military discount 2025 2026" --limit 5 --scrape

# Returns:
# - target.com/l/target-circle-military-appreciation/  ← official
# - military.com/discounts/target-veterans-day...      ← confirmation
```

**Official URL patterns to prioritize:**
```javascript
const officialPatterns = [
  `help.${retailer}.com/`,
  `${retailer}.com/help/`,
  `${retailer}.com/l/`,        // landing pages
  `${retailer}.com/c/`,        // category/policy pages
  `support.${retailer}.com/`,
];
```

#### Step 2: Scrape + verify

```bash
# Scrape official policy page
firecrawl "https://www.target.com/help/articles/policies-guidelines/price-match-guarantee" --only-main-content
```

#### Step 3: LLM verification prompt

```
Given this official policy page content:
---
{scraped_content}
---

Verify this fact is accurate and current:
"{fact_to_verify}"

Respond with:
- VERIFIED: Fact matches official source
- OUTDATED: Fact was true but has changed (explain what changed)
- UNVERIFIED: Cannot confirm from this source
- INCORRECT: Fact contradicts official source
```

#### Example: Target verification (2026-02-06)

Tested 3 HIGH-RISK facts. All required official source verification.

| Fact | Perplexity Said | Agent Said | Official Source | Verdict |
|------|-----------------|------------|-----------------|---------|
| **Price match** | "No explicit guarantee" | "July 2025: Only matches own prices" | ✅ Confirms: Target.com, stores, Circle only. **No competitor matching.** | Agent ✅, Perplexity ❌ |
| **Military discount** | "No specific mentions" | "Seasonal 10% for veterans" | ✅ military.com: "10% through Nov 11" via Circle verification | Agent ✅, Perplexity ❌ |
| **Student discount** | "No specific mentions" | "Verified college offers" | ✅ Official: 20% annual event (Jun-Sep) + monthly offers via ID upload | Agent ✅ (understated), Perplexity ❌ |

**Result: 3/3 Agent claims verified. 0/3 Perplexity claims correct.**

Agent navigates to official help pages. Perplexity synthesizes from blogs that miss policy updates.

**Key lesson:** Even if Perplexity had confidently said "Target matches Amazon prices" (old policy), only the official scrape would catch that it's now wrong.

#### Cost of verification

| Step | Cost |
|------|------|
| Firecrawl search + scrape | ~$0.002 |
| LLM verification | ~$0.001 |
| **Per HIGH-risk fact** | **~$0.003** |

For ~5-7 high-risk facts per retailer: **+$0.015-0.02 verification cost**

**Total with verification: ~$0.04-0.05 per retailer**

Still very cheap at scale (1000 retailers = ~$50).

---

### Firecrawl API Comparison

| Endpoint | URLs Required | Best For | Cost Model |
|----------|---------------|----------|------------|
| `/scrape` | Yes (1 URL) | Single page → markdown | ~$0.001/page |
| `/extract` | Yes (supports wildcards) | Structured data from known URLs | Credits (15 tokens/credit) |
| `/agent` | No | Autonomous research, unknown URLs | Dynamic (Spark-1 models) |
| `/search` | No (query) | Web search + optional scrape | Per query |

---

## 2. Normalize Layer (Structured Facts)

Raw data → structured "fact objects":

```json
{
  "retailer": "dicks-sporting-goods",
  "fact_type": "return_policy",
  "content": "90-day return window for most items",
  "source_url": "https://www.dickssportinggoods.com/...",
  "extracted_at": "2026-02-05T22:00:00Z",
  "confidence": 0.95
}
```

**Fact types to extract:**
- Return policies
- Shipping thresholds/times
- Current promotions/sales
- Loyalty program details
- Price match policies
- Student/military discounts
- Payment options

**LLM extraction** with structured output (JSON mode) works well here. Gemini Flash or GPT-4o-mini are cheap and fast.

---

## 3. Compare Layer (Embeddings + Gap Detection)

This is the core of the system — **validated in PoC**.

### How embeddings work

```javascript
// 1. Call embedding API (Gemini example)
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
  const data = await response.json();
  return data.embedding.values; // array of 768 floats
}

// 2. Compare with cosine similarity
function cosineSimilarity(a, b) {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 3. Classify gaps
// >85% = COVERED, 70-85% = PARTIAL, <70% = MISSING
```

### Gap detection flow

```javascript
for (const fact of researchedFacts) {
  // Find best matching existing content
  let bestSimilarity = 0;
  for (const chunk of existingChunks) {
    const sim = cosineSimilarity(fact.embedding, chunk.embedding);
    if (sim > bestSimilarity) bestSimilarity = sim;
  }
  
  if (bestSimilarity > 0.85) status = 'COVERED';
  else if (bestSimilarity > 0.70) status = 'PARTIAL';
  else status = 'MISSING';
}
```

### Tech options for production

| Option | Pros | Cons |
|--------|------|------|
| **pgvector** (Supabase) | Already in stack, SQL familiar | Scale limits |
| **Pinecone** | Managed, fast, scales well | Another vendor |
| **Qdrant** | Self-hosted, fast, cheap | Ops overhead |
| **Weaviate** | Hybrid search (BM25 + vectors) | More complex |

**For Atolls scale (50 sites × ~1000 retailer pages each = 50k pages):** pgvector in Supabase is probably fine to start.

---

## 4. Generate Layer (Content + Review)

**Validated in PoC** — generated content matches coupons.com tone.

### Content generation prompt

```javascript
const prompt = `You are a content writer for coupons.com, a deals and coupons website.

Examples of coupons.com writing style:
- "Spend $65 or more to get free shipping at Dick's Sporting Goods..."
- "Get $20 off $100+ at Dick's Sporting Goods when you sign up for texts..."

Style notes: Direct, helpful, conversational. Uses "you" frequently. 
Explains requirements clearly. Focuses on what the customer gets.

Write a "Return Policy" section using these facts:
${facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Requirements:
- Match the coupons.com tone exactly
- Be helpful and direct
- Use "you" to address the reader
- Keep it scannable with short paragraphs`;
```

### Generated output example

> Here's what you need to know about returns at Dick's Sporting Goods:
>
> You have 90 days to return most items. This starts from the purchase date for in-store buys and from the original shipment date for online orders.
>
> Make sure your items are in clean, resalable condition. You'll also need valid proof of purchase, like your order confirmation email, sales receipt, or order number.
>
> If you have proof of purchase, you'll get a refund to your original payment method. No proof? No problem! You'll receive store credit instead.

### Editor review UI concept

```
📋 Dick's Sporting Goods — Content Gap Report

Page: coupons.com/coupon-codes/dicks-sporting-goods  
Gaps found: 6 missing, 3 partial

❌ Missing Section: Return Policy
Current: Not covered  
Suggested addition: [generated content]

[ ✅ Approve ]  [ ✏️ Edit ]  [ ❌ Reject ]
```

---

## Cost Estimate (validated)

### Per page

| Step | API | Cost |
|------|-----|------|
| Research (Perplexity) | sonar | ~$0.005 |
| Embeddings (Gemini) | text-embedding-004 | ~$0.001 |
| Generation (Gemini) | gemini-2.0-flash | ~$0.002 |
| **Total per page** | | **~$0.01** |

### At scale

| Scale | Frequency | Cost |
|-------|-----------|------|
| 1k pages | Daily | ~$10/day |
| 50k pages | Weekly full refresh | ~$500/week |
| 50k pages | Daily delta (10%) | ~$50/day |

---

## Key Architecture Decisions

### 1. Orchestration — how does the pipeline run?
- **Option A:** Cron-based batch (nightly research runs)
- **Option B:** Event-driven (retailer page changes → trigger research)
- **Option C:** Editor-initiated (editor requests research on specific page)

Probably start with **A + C** — nightly batch for coverage, plus on-demand for editors.

### 2. Where does this live?
- **Serverless functions** (Vercel/Cloudflare) for individual steps
- **Queue** (BullMQ, Inngest, or Trigger.dev) for orchestration
- **Database** (Supabase) for facts, embeddings, audit trail

### 3. How do editors interact?
- **Minimal:** Email/Slack digest of "pages needing attention"
- **Integrated:** Panel in existing CMS showing gaps + suggestions
- **Standalone:** Dedicated app with review queue

---

## Next Steps

1. ✅ **PoC validated** — pipeline works end-to-end
2. ⬜ **Pick pilot site** — suggest coupons.com US (English, high volume)
3. ⬜ **Define fact schema** — what fact types matter most?
4. ⬜ **Build ingestion for existing pages** — CMS API or scrape?
5. ⬜ **Set up Supabase with pgvector** — store embeddings
6. ⬜ **Build editor review UI** — simple approve/edit/reject
7. ⬜ **Run on 100 retailers** — measure quality, tune thresholds

---

## Open Questions

1. **Where does existing content live?** (CMS API? Database? Need to fetch from live pages?)
2. **What's the review workflow today?** (Do editors use a specific tool?)
3. **Priority:** Coverage (find all missing facts) vs. Freshness (catch stale info fast)?

---

## Related

- [[shoop-de]] — captured internal API for competitive intelligence
- [[unbrowse]] — internal API capture for competitor monitoring
- Demo script: [[editorial-research-system/embedding-gap-demo.mjs]]
