# Firecrawl Modes Comparison

*Tested: 2026-02-05*

## Available Modes

### 1. SCRAPE (Single Page)
```bash
firecrawl https://www.target.com/circle --only-main-content
```

**Best for:** Quick extraction of a specific page
**Output:** Markdown content of one page
**Cost:** 1 credit (~$0.001)
**Speed:** 2-5 seconds

**Pros:**
- Fast, simple
- Clean markdown output
- `--only-main-content` strips nav/footer

**Cons:**
- Single page only
- Misses linked pages (returns, shipping, etc.)

---

### 2. MAP (Discover URLs)
```bash
firecrawl map https://www.target.com --search "circle loyalty rewards discount" --limit 20
```

**Best for:** Finding all relevant pages before scraping
**Output:** List of URLs matching search terms
**Cost:** 1 credit
**Speed:** 3-10 seconds

**Example output for Target:**
```
https://www.target.com/l/target-circle/-/N-pzno9
https://www.target.com/circlecard
https://www.target.com/help/articles/delivery-options/target-circle-360
https://www.target.com/l/target-circle-360/-/N-2rguk
https://www.target.com/l/target-circle-bonus/-/N-7xl7q
https://www.target.com/l/target-circle-teacher-appreciation/-/N-2dktv
https://www.target.com/help/articles/promotions-coupons/current-promotions
```

**Pros:**
- Finds pages you might miss manually
- Can search by keywords
- Great for discovery phase

**Cons:**
- Doesn't scrape content, just URLs
- Need to follow up with SCRAPE or CRAWL

---

### 3. SEARCH (Web Search + Snippets)
```bash
firecrawl search "Target Circle loyalty program benefits 2026" --limit 5
```

**Best for:** Finding info across multiple sites (like Google)
**Output:** Titles, URLs, snippets from search results
**Cost:** 1 credit per search

**Example output:**
```
Target Circle: Free and Paid Loyalty Program Benefits
  URL: https://corporate.target.com/press/fact-sheet/2025/06/target-circle
  Join Target Circle for free to unlock exclusive savings...

Target Circle 360
  URL: https://www.target.com/l/target-circle-360/-/N-2rguk
  Join Target Circle 360™ for $99/year or $10.99/month...
```

**Pros:**
- Finds info from third-party sources (reviews, news)
- Similar to Perplexity but with direct source access
- Good for competitive research

**Cons:**
- Only snippets, not full content
- Need `--scrape` flag for full content

---

### 4. SEARCH + SCRAPE (Web Search → Full Content)
```bash
firecrawl search "IKEA Family benefits rewards" --limit 3 --scrape --scrape-formats markdown
```

**Best for:** Getting full content from search results
**Output:** Full markdown content of each search result page
**Cost:** 1 + N credits (search + scrape per result)

**Pros:**
- Combines discovery + extraction
- Gets full page content, not just snippets
- Can find info from news/review sites

**Cons:**
- More expensive (multiple credits)
- Can hit rate limits
- May include irrelevant results

---

### 5. CRAWL (Multi-Page)
```bash
firecrawl crawl https://www.target.com/circle --limit 10 --max-depth 2 --wait
```

**Best for:** Scraping entire site sections
**Output:** JSON with all pages crawled
**Cost:** N credits (1 per page)
**Speed:** 10-60 seconds depending on limit

**Example: Target Circle Card page returned 4,500+ words of content including:**
- Full program rules
- All discount exclusions
- Credit card terms
- Mastercard rewards details (2% dining, 1% elsewhere)
- Return policy extensions

**Pros:**
- Gets comprehensive content from linked pages
- Single command for multiple pages
- Includes metadata (titles, descriptions)

**Cons:**
- Slower, more expensive
- May include duplicate/irrelevant content
- Needs post-processing to extract facts

---

## Recommended Strategy for Editorial Research

### Discovery Phase
```bash
# Find all relevant pages
firecrawl map https://www.retailer.com --search "loyalty rewards discount shipping returns" --limit 20
```

### Extraction Phase
```bash
# Scrape specific pages found
firecrawl https://www.retailer.com/loyalty-program --only-main-content
firecrawl https://www.retailer.com/shipping-policy --only-main-content
firecrawl https://www.retailer.com/returns --only-main-content
```

### Alternative: Deep Crawl
```bash
# Crawl entire loyalty section
firecrawl crawl https://www.retailer.com/loyalty --limit 10 --max-depth 2 --wait
```

---

## Cost Comparison per Retailer

| Approach | Credits Used | Approximate Cost |
|----------|--------------|------------------|
| Perplexity (sonar-pro) | N/A | ~$0.01 |
| MAP + 5 SCRAPES | 6 | ~$0.006 |
| SEARCH + SCRAPE (3 results) | 4 | ~$0.004 |
| CRAWL (10 pages) | 10 | ~$0.01 |
| **Combined (Perplexity + Firecrawl)** | - | **~$0.02** |

---

## Firecrawl + LLM Extraction

After scraping, use LLM to extract structured facts:

```javascript
const prompt = `Extract ALL savings facts from this retailer page content. 
Return as JSON with categories: discounts, loyalty, shipping, codes, sales, policies, programs`;

// Gemini Flash: ~$0.002 per extraction
```

**Full pipeline cost per retailer:**
- Perplexity: $0.01
- Firecrawl (5 pages): $0.005
- LLM extraction (5 pages): $0.01
- **Total: ~$0.025**
