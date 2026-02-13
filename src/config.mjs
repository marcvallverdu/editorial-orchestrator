/**
 * Configuration and API keys
 */
export const CONFIG = {
  // Models
  llmModel: 'minimax/MiniMax-M2.5',
  schedulerModel: 'minimax/MiniMax-M2.5',
  embeddingModel: 'gemini-embedding-001',
  perplexityModel: 'sonar-pro',

  // Thresholds
  dedupeSimilarity: 0.90,    // cosine sim above this = duplicate
  coveredThreshold: 0.85,    // fact is covered on page
  partialThreshold: 0.70,    // fact is partially covered

  // Limits
  maxFactsPerRetailer: 60,
  maxExistingContentChars: 3000,
  maxPerplexityChars: 3000,
  scrapeTimeout: 15000,
  llmTimeout: 60000,

  // Concurrency
  parallelRetailers: 5,      // run N retailers simultaneously

  // Cost tracking
  costs: {
    perplexity: 0.01,
    firecrawlScrape: 0.001,
    m25InputPer1k: 0.0005,
    m25OutputPer1k: 0.0015,
    embeddingPer1k: 0.00001,
  }
};

export const KEYS = {
  openrouter: process.env.OPENROUTER_API_KEY,
  perplexity: process.env.PERPLEXITY_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  firecrawl: process.env.FIRECRAWL_API_KEY,
};

/** Comprehensive research query template */
export const RESEARCH_TEMPLATE = (retailer) => `${retailer} ALL savings opportunities comprehensive guide 2026:

DISCOUNTS: student discount, military discount, veterans discount, healthcare worker discount, first responder discount, teacher discount, senior discount, employee discount, birthday discount, referral program, friends and family sale

LOYALTY: loyalty program, rewards program, membership benefits, credit card benefits, points earning rate, bonus points events, member exclusive sales, early access deals, program tiers

CODES AND COUPONS: newsletter signup code, email signup code, app download code, first order discount, welcome offer, seasonal promo codes, sitewide codes, stackable coupons

SHIPPING: free shipping threshold, free delivery, delivery costs, same day delivery, click and collect, free returns

PRICE POLICIES: price match guarantee, price adjustment policy, lower price guarantee

PAYMENT: store credit card, financing options, buy now pay later, interest free credit, gift card promotions

SALES CALENDAR: Black Friday, Cyber Monday, January sale, summer sale, seasonal clearance, flash sales, weekly deals, clearance schedule, mid season sale, end of season sale

PROGRAMS: trade in program, recycling program, product buyback, bulk discount, business accounts

OTHER: outlet stores, outlet section, clearance section, open box deals, ex display items, best time to buy, membership benefits`;

/** Fact types for classification */
export const FACT_TYPES = [
  'discount', 'loyalty', 'promo_code', 'shipping', 'return_policy',
  'price_match', 'payment', 'sales_calendar', 'program', 'other'
];

/** High-risk fact types that need verification */
export const HIGH_RISK_TYPES = ['return_policy', 'price_match', 'discount', 'payment'];

/** Retail seasonal calendar */
export const SEASONAL_CALENDAR = {
  'valentines':     { start: [2, 7],  peak: [2, 14], categories: ['gifts', 'jewelry', 'flowers'] },
  'presidents-day': { start: [2, 14], peak: [2, 17], categories: ['mattresses', 'appliances', 'furniture'] },
  'memorial-day':   { start: [5, 19], peak: [5, 26], categories: ['outdoor', 'grills', 'mattresses'] },
  'prime-day':      { start: [7, 8],  peak: [7, 16], categories: ['electronics', 'amazon-competitors'] },
  'back-to-school': { start: [7, 15], peak: [8, 15], categories: ['clothing', 'electronics', 'office'] },
  'black-friday':   { start: [11, 15], peak: [11, 28], categories: ['*'] },
  'cyber-monday':   { start: [11, 29], peak: [12, 2], categories: ['electronics', 'software'] },
  'christmas':      { start: [12, 1], peak: [12, 25], categories: ['*'] },
};
