# Editorial Research Orchestrator

AI-powered content gap detection for discount/cashback editorial sites. Researches retailers, extracts facts, compares against existing page content, and identifies what's missing.

Built for [Atolls](https://atolls.com) — operating 50+ sites like hotukdeals.com, coupons.com, etc.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  SCHEDULER (M2.5 agentic)                                        │
│  Decides WHAT to refresh based on staleness, season, budget       │
└────────────────────┬─────────────────────────────────────────────┘
                     │ selects retailers
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  PIPELINE (scripted, fast)              ×N parallel              │
│                                                                  │
│  1. Fetch existing page (Firecrawl)     ~1-5s                    │
│  2. Research retailer (Perplexity)      ~3-5s                    │
│  3. Extract facts (M2.5)               ~20-40s                   │
│  4. Deduplicate (Gemini embeddings)     ~5-10s                   │
│  5. Compare gaps (Gemini embeddings)    ~10-20s                  │
│  6. Verify high-risk (scrape + M2.5)    ~10-30s                  │
│                                                                  │
│  Total: ~60-90s per retailer                                     │
└──────────────────────────────────────────────────────────────────┘
```

**Key insight:** M2.5 for extraction/verification (its strength: structured output + tool calling), scripted flow for deterministic pipeline execution. Agentic decisions only at the scheduling layer where they add real value.

## Quick Start

```bash
# Required env vars
export OPENROUTER_API_KEY=sk-or-...     # MiniMax M2.5 via OpenRouter
export PERPLEXITY_API_KEY=pplx-...      # Perplexity sonar-pro
export GEMINI_API_KEY=AIza...           # Gemini embeddings
export FIRECRAWL_API_KEY=fc-...         # Firecrawl scraping (optional)

# Single retailer
node src/pipeline.mjs "Target" "coupons.com"

# Batch (5 default retailers, parallel)
node src/batch.mjs

# Batch with custom retailers
node src/batch.mjs --site coupons.com "Target,Best Buy,Nike,IKEA,Walmart"

# Scheduler (agentic — picks what to refresh)
node src/scheduler.mjs --budget 5.00 --max 50 retailers-state.json
```

## Cost

| Component | Per retailer | Notes |
|-----------|-------------|-------|
| Perplexity (sonar-pro) | ~$0.01 | Broad research |
| M2.5 extraction | ~$0.01-0.03 | Fact extraction + verification |
| Gemini embeddings | ~$0.001 | Dedupe + gap comparison |
| Firecrawl scrapes | ~$0.005 | Existing page + verification |
| **Total** | **~$0.03-0.05** | |

### At scale

| Scenario | Retailers/day | Daily cost | Monthly |
|----------|--------------|------------|---------|
| Conservative (10%) | 100 | ~$5 | ~$150 |
| Moderate (20%) | 200 | ~$10 | ~$300 |
| Full weekly | 700/day | ~$35 | ~$1,050 |

## Pipeline Output

Each retailer produces a structured result:

```json
{
  "retailer": "Target",
  "site": "coupons.com",
  "status": "success",
  "elapsed": 72.3,
  "totalCost": 0.0483,
  "factsExtracted": 35,
  "factsDeduped": 28,
  "gaps": {
    "missing": [
      { "type": "loyalty", "content": "Target Circle 360 membership $49/year includes free shipping" },
      { "type": "discount", "content": "Student discount 20% off annual event June-September" }
    ],
    "partial": [
      { "type": "shipping", "content": "Free shipping $35+ for Circle members", "similarity": 74 }
    ],
    "covered": 18
  },
  "verification": [
    { "type": "discount", "content": "Student discount 20%", "verdict": "VERIFIED" }
  ]
}
```

## Scheduler

The scheduler is the agentic layer — M2.5 decides which retailers to refresh:

```bash
# Create retailer state file
cat > retailers-state.json << 'EOF'
[
  {"name": "Target", "site": "coupons.com", "priority": "high", "categories": ["general"]},
  {"name": "Best Buy", "site": "coupons.com", "priority": "high", "categories": ["electronics"]},
  {"name": "Nike", "site": "coupons.com", "priority": "medium", "categories": ["clothing"]},
  {"name": "IKEA", "site": "coupons.com", "priority": "medium", "categories": ["furniture"]}
]
EOF

# Run scheduler — M2.5 picks retailers, pipeline researches them
node src/scheduler.mjs --budget 5.00 --max 20 retailers-state.json
```

The scheduler considers:
- **Staleness** — days since last research (never > recently refreshed)
- **Priority** — high/medium/low based on traffic/revenue
- **Seasonal relevance** — Valentine's Day boosts gift retailers, Black Friday boosts all
- **Gap count** — pages with many gaps get refreshed sooner
- **Budget** — stays within daily spend limit

## Files

```
src/
├── config.mjs      # API keys, thresholds, research template, seasonal calendar
├── apis.mjs        # API wrappers (Perplexity, Firecrawl, Gemini, M2.5)
├── pipeline.mjs    # Fast scripted per-retailer pipeline
├── batch.mjs       # Parallel batch runner
└── scheduler.mjs   # M2.5 agentic scheduler
orchestrator.mjs    # Original agentic orchestrator (v1, slower but interesting)
```

## Benchmark Results (v1 agentic vs v2 scripted)

### v1: Fully agentic (M2.5 decides everything)

| Retailer | Turns | Time | M2.5 Cost |
|----------|-------|------|-----------|
| Target | 15 | 228s | $0.071 |
| Best Buy | 11 | 213s | $0.050 |
| Nike | 15 | 193s | $0.058 |
| IKEA | 12 | 194s | $0.048 |
| Walmart | 10 | 201s | $0.029 |
| **Average** | **12.6** | **206s** | **$0.051** |

**Projected 200/day: $10.26/day** (sequential: ~11.4 hours)

### v2: Scripted pipeline (target)

- Expected: ~60-90s per retailer (2-3× faster)
- Parallel: 5 retailers at once → 200 in ~40 min
- M2.5 only for extraction + verification → fewer tokens

## Design Decisions

1. **Why not fully agentic?** The per-retailer pipeline is deterministic — M2.5 followed the same playbook every time. Agentic overhead added ~12 unnecessary LLM turns per retailer.

2. **Why keep M2.5 for the scheduler?** Scheduling decisions genuinely benefit from reasoning: seasonal awareness, budget allocation, priority balancing. This is where agent flexibility adds value.

3. **Why Perplexity over direct scraping?** Perplexity synthesizes across multiple sources in one call (~$0.01). Scraping individual pages is slower and misses cross-site information.

4. **Why Gemini embeddings?** Free tier is generous, quality is good, and we need them for both dedup and gap detection. Cosine similarity on 768-dim vectors is simple and fast.

5. **Why MiniMax M2.5?** Best tool-calling benchmark (BFCL 76.8%) at 1/20th the cost of Opus. For structured extraction and verification, it's the sweet spot.

## Next Steps

- [ ] Test scripted pipeline speed improvement
- [ ] Add Firecrawl Agent for deep policy verification
- [ ] Supabase/pgvector for persistent fact store
- [ ] Editor review UI (Slack digest → web app)
- [ ] Multi-site support (same retailer, different sites/tones)
- [ ] Cross-site dedup (research once, adapt content per site)

## License

MIT
