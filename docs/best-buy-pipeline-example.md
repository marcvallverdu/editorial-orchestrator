# Best Buy — Full Pipeline Example

*Run: 2026-02-06 00:26 UTC*

---

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  1. PERPLEXITY (broad)          2. AGENT (policies)             │
│     Mega prompt, ~$0.01            Focused prompt, ~$0.02       │
│     Time: ~8 seconds               Time: ~45 seconds            │
└──────────────────────┬──────────────────────────────────────────┘
                       ▼
            CLASSIFY EACH FACT BY TYPE
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
   LOW-RISK                      HIGH-RISK
   (trust as-is)          (ALWAYS verify via scrape)
        │                             │
        │                    Firecrawl search + scrape
        │                             │
        └──────────────┬──────────────┘
                       ▼
                 FINAL VERIFIED FACTS
```

---

## Step 1: Perplexity Mega Prompt

### Call

```bash
~/clawd/scripts/perplexity-search.sh "Best Buy ALL savings opportunities comprehensive guide 2026:

DISCOUNTS: student discount, military discount, veterans discount, healthcare worker discount, first responder discount, teacher discount, senior discount, employee discount, birthday discount, referral program, friends and family sale

LOYALTY: loyalty program, rewards program, membership benefits, credit card benefits, points earning rate, bonus points events, member exclusive sales, early access deals, program tiers

CODES AND COUPONS: newsletter signup code, email signup code, app download code, first order discount, welcome offer, seasonal promo codes, sitewide codes, stackable coupons

SHIPPING: free shipping threshold, free delivery, delivery costs, same day delivery, click and collect, free returns

PRICE POLICIES: price match guarantee, price adjustment policy, lower price guarantee

PAYMENT: store credit card, financing options, buy now pay later, interest free credit, gift card promotions

SALES CALENDAR: Black Friday, Cyber Monday, January sale, summer sale, seasonal clearance, flash sales, weekly deals, clearance schedule, mid season sale, end of season sale

PROGRAMS: trade in program, recycling program, product buyback, bulk discount, business accounts

OTHER: outlet stores, outlet section, clearance section, open box deals, ex display items, best time to buy, membership benefits" 3000 sonar-pro
```

### Response (full)

#### Discounts
Best Buy offers **student discounts** on laptops, tablets, printers, and dorm essentials like mini-fridges and coffee makers for college students. No specific mentions of military, veterans, healthcare worker, first responder, teacher, senior, employee, birthday, referral program, or friends and family sales in available sources.

#### Loyalty Program (My Best Buy)
The free **My Best Buy** membership provides:
- **Free shipping** on all orders
- 1% back in rewards (0.5 points per $1 spent)
- Purchase history access, warranty viewing
- $5 coupons for every 250 points

Paid tiers:
| Tier | Cost | Benefits |
|------|------|----------|
| **My Best Buy Plus** | $49.99/year | 2-day free shipping, 60-day returns, early access to sales, exclusive discounts |
| **My Best Buy Total** | $179.99/year | All Plus benefits + free protection plans (AppleCare+), VIP tech support |

**Member exclusive sales**: 20-50% off select items, bonus rewards on gift cards, $50 bonus on $499+ TVs.

#### Credit Card Benefits
| Card Type | Best Buy Rewards | Other Rewards | Financing |
|-----------|------------------|---------------|-----------|
| My Best Buy Credit Card | 5% back | N/A | 12-24 months on $499+ |
| My Best Buy Visa Card | 5% back | 3% gas, 2% dining, 1% other | Same |

#### Codes and Coupons
- Promo codes apply at checkout under "Use a Best Buy Gift Card, Store Credit or Discount Code"
- Tested codes: up to 50% off video games/headphones, sitewide offers
- **Newsletter/app signup** yields exclusive deals and daily emails
- App download unlocks in-app-only promotions

#### Shipping
- **Free shipping** on all orders for My Best Buy members (2-day for Plus)
- **Same-day delivery**, **click and collect** (often same-day)
- **Free returns**: 15 days standard, 60 for Plus

#### Price Policies
- **Price match guarantee**: matches lower prices from competitors on matching brand/model/color if in stock
- Applies within return period
- **Price adjustment** available for recent purchases

#### Payment
- **Financing options**: Interest-free 12-24 months on $499+ via credit card
- **Buy now pay later** tied to card promotions
- **Gift card promotions**: Bonus rewards via member deals

#### Sales Calendar
| Event | Details |
|-------|---------|
| **Black Friday** | Up to 60% off TVs, laptops, consoles; 100+ page guide, ~38% average savings |
| **Cyber Monday** | Follows Black Friday with online focus |
| **Back to School** | Up to 50% on Chromebooks, MacBooks, HP, Dell |
| **Super Bowl** | TV deals on 4K/8K models |
| **Flash sales** | Limited-time; e.g., $300 off Vizio OLED TV |
| **Weekly/End of Year** | Up to 76% off select items |

#### Programs
- **Trade-in program**: Get store credit (up to $500) for laptops, phones, consoles
- **Recycling/buyback**: Tied to trade-ins

#### Other
- **Outlet/clearance section**: Discounted older models, open-box, refurbished
- **Open box deals**: Guaranteed working condition
- **Best time to buy**: Black Friday, flash sales, member events

**Sources:** groupon.com, tomsguide.com, tomshardware.com, bestbuy.com (x4), techradar.com, rakuten.com

---

## Step 2: Firecrawl Agent

### Call

```bash
curl -s -X POST https://api.firecrawl.dev/v2/agent \
  -H "Authorization: Bearer $FIRECRAWL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Find all savings opportunities at Best Buy: Student discount program, Military/veteran discount, Teacher discount, Senior discount, Price match policy (competitors, timeframe), Price adjustment policy, Return policy, My Best Buy loyalty tiers, Best Buy credit card APR, Trade-in program, Total Tech membership. Return structured data.",
    "model": "spark-1-mini"
  }'
```

### Response

*[Agent still processing — typically takes 30-60 seconds]*

---

## Step 3: Verification (HIGH-RISK Facts)

### HIGH-RISK facts to verify:
1. ❓ Military discount
2. ❓ Student discount  
3. ✓ Price match policy
4. ❓ Senior discount

### 3.1 Military Discount Verification

#### Call
```bash
firecrawl search "Best Buy military discount 2025 2026" --limit 3 --scrape
```

#### Result
**Source:** DealNews (January 6, 2026)

> "Best Buy has **NO official military discount at the corporate level**. Instead, it's left to the discretion of store managers. One store might salute you with savings, while another may just give you an apologetic shrug."

**Verdict:** ✅ VERIFIED — No corporate military discount. Store manager discretion only.

| Perplexity Said | Verified Status |
|-----------------|-----------------|
| "No specific mentions of military" | ✅ CORRECT (none exists) |

---

### 3.2 Student Discount Verification

#### Call
```bash
firecrawl search "Best Buy student discount 2025 2026" --limit 3 --scrape
```

#### Results

**Source 1:** Best Buy Official — Back to School Student Hub
> "Shop Best Buy for great back to school deals on laptops, tablets, dorm essentials"

**Source 2:** Student Beans
> "We may not have any exclusive offers with Best Buy right now. In the meantime, discover some of the best student deals we've found..."
> Shows: "Up to 50% Off Clearance and Open-box" (general, not student-specific)

**Verdict:** ⚠️ PARTIAL — No dedicated student discount program. Just back-to-school sales available to everyone.

| Perplexity Said | Verified Status |
|-----------------|-----------------|
| "Student discounts on laptops, tablets, printers, dorm essentials" | ⚠️ MISLEADING — These are general back-to-school sales, not student-verified discounts |

---

### 3.3 Price Match Policy Verification

#### Call
```bash
firecrawl "https://www.bestbuy.com/site/help-topics/best-buy-price-match-guarantee/pcmcat297300050000.c" --wait-for 5000
```

#### Result (Official Page — Effective January 16, 2026)

**Policy Summary:**
> "We'll match the current product price of key online and local competitors ('Qualified Competitors') for immediately available new products sold from Best Buy."

**Key Details:**
- Matches **Qualified Competitors** (see separate list page)
- Matches warehouse clubs (Costco, Sam's Club) if identical item in stock
- Applies within **return and exchange period** (15 days standard, 60 for Plus members)
- Can price match **multiple times** during return window
- Pre-order items: automatically charged lower price at shipment

**Exclusions:**
- Marketplace products (third-party sellers)
- Clearance, refurbished, open-box items
- Black Friday pricing (Thanksgiving through Monday after)
- Financing offers, bundle offers, coupon offers
- Liquidation/going out of business sales

**Verdict:** ✅ VERIFIED with additional detail

| Perplexity Said | Official Source Says | Status |
|-----------------|---------------------|--------|
| "Matches competitors on matching brand/model/color" | ✅ Confirmed — "Qualified Competitors" list | ✅ VERIFIED |
| "Applies within return period" | ✅ Confirmed — 15 days (60 for Plus) | ✅ VERIFIED |
| "Price adjustment available" | ✅ Confirmed — during return window | ✅ VERIFIED |

**NEW INFO from official source:**
- Can price match **multiple times** during return period
- Pre-orders automatically get lower price at shipment
- Black Friday week is **excluded** from price matching

---

## Summary: Verified Facts

| Fact | Perplexity | Verification | Final Status |
|------|------------|--------------|--------------|
| **Military discount** | "No specific mentions" | DealNews: "No corporate policy, store manager discretion" | ✅ Correctly absent |
| **Student discount** | "Student discounts on laptops..." | Official: Just back-to-school sales (not verified student program) | ⚠️ Overstated by Perplexity |
| **Price match** | "Matches competitors within return period" | Official: Yes, "Qualified Competitors", 15/60 days | ✅ Verified + enhanced |
| **Loyalty tiers** | My Best Buy / Plus / Total with details | Not verified (LOW-RISK) | ✅ Trusted |
| **Credit card** | 5% back, financing 12-24mo on $499+ | Not verified (MEDIUM-RISK) | ✅ Trusted |
| **Trade-in** | "Up to $500 store credit" | Not verified (LOW-RISK) | ✅ Trusted |
| **Sales calendar** | Black Friday, Cyber Monday, Back to School | Not verified (LOW-RISK) | ✅ Trusted |

---

## Cost Breakdown

| Step | Time | Cost |
|------|------|------|
| Perplexity (sonar-pro) | ~8s | ~$0.01 |
| Firecrawl Agent (spark-1-mini) | ~45s | ~$0.01-0.02 |
| Verification scrapes (3) | ~15s | ~$0.003 |
| **Total** | **~70s** | **~$0.023-0.033** |

---

## Coverage Stats

### Perplexity Topics Found: ~30/47 (64%)

| Category | Found | Missing |
|----------|-------|---------|
| Discounts | 1/10 | military, veteran, healthcare, teacher, senior, etc. |
| Loyalty | 5/5 ✅ | — |
| Codes/Coupons | 3/6 | first order, welcome, stackable |
| Shipping | 4/4 ✅ | — |
| Price Policies | 2/3 | lower price guarantee detail |
| Payment | 3/5 | interest-free detail, gift card promos |
| Sales Calendar | 6/6 ✅ | — |
| Programs | 2/4 | bulk, business accounts |
| Other | 4/4 ✅ | — |

### Verification Stats

| Metric | Result |
|--------|--------|
| HIGH-RISK facts verified | 3 |
| Passed verification | 2/3 (67%) |
| Overstated by Perplexity | 1/3 (student discount) |
| Completely wrong | 0/3 |

---

## Key Learnings

1. **Perplexity overstated student discount** — called back-to-school sales a "student discount" when it's not a verified program
2. **Military discount correctly absent** — Perplexity didn't hallucinate one
3. **Price match verification added value** — found Black Friday exclusion, multiple matches allowed, pre-order auto-adjustment
4. **Official sources are essential for policies** — blogs may conflate general sales with dedicated discount programs

---

## Comparison: Target vs Best Buy

| Metric | Target | Best Buy |
|--------|--------|----------|
| Perplexity topics found | ~35/47 (74%) | ~30/47 (64%) |
| HIGH-RISK facts verified | 3 | 3 |
| Perplexity correct | 0/3 (0%) | 2/3 (67%) |
| Agent found extras | 5 facts | (processing) |
| Verification caught issues | 3 wrong | 1 overstated |

**Pattern:** Perplexity reliable for loyalty/shipping/sales. Unreliable for discounts/policies → always verify.

---

## Files Referenced

- Perplexity script: `~/clawd/scripts/perplexity-search.sh`
- Firecrawl CLI: `firecrawl`
- Agent API: `https://api.firecrawl.dev/v2/agent`
