import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const SHOPIFY_FUNNEL_EVENTS = [
  "RECOMMENDATION_VIEW", "PRODUCT_CLICK", "ADD_TO_CART",
] as const;
export type ShopifyFunnelEvent = (typeof SHOPIFY_FUNNEL_EVENTS)[number];

type Stage = { events: number; conversations: number };
type Trend = { day: string; recommendations: number; clicks: number; carts: number };

let tableReady: Promise<void> | null = null;
async function ensureTable() {
  if (!tableReady) {
    // Same migration-on-first-use pattern as widget_message_rich. No impact on
    // existing Shopify product, billing, or legacy conversation tables.
    tableReady = prisma.$executeRawUnsafe(
      "CREATE TABLE IF NOT EXISTS shopify_funnel_event (" +
      "id VARCHAR(36) NOT NULL PRIMARY KEY," +
      "businessId VARCHAR(191) NOT NULL," +
      "agentId VARCHAR(191) NOT NULL," +
      "conversationId VARCHAR(191) NOT NULL," +
      "shopifyProductId VARCHAR(90) NOT NULL," +
      "eventType VARCHAR(32) NOT NULL," +
      "tokenHash CHAR(64) NOT NULL," +
      "createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)," +
      "UNIQUE KEY uniq_aaryvo_funnel_event(eventType,tokenHash)," +
      "INDEX idx_aaryvo_funnel_business_date(businessId,createdAt)," +
      "INDEX idx_aaryvo_funnel_type_date(businessId,eventType,createdAt)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ).then(() => undefined).catch(error => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}


// Minimize linkable engagement history. Prune on storefront activity and
// merchant reporting (no external cron dependency for active storefronts).
let lastPrunedAt = 0;
let pruning: Promise<void> | null = null;
async function pruneExpiredEngagement() {
  if (Date.now() - lastPrunedAt < 24 * 60 * 60 * 1000) return;
  if (pruning) return pruning;
  pruning = prisma.$executeRawUnsafe(
    "DELETE FROM shopify_funnel_event WHERE createdAt < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 90 DAY)",
  ).then(() => { lastPrunedAt = Date.now(); }).catch(error => {
    console.error("AARYVO funnel engagement retention cleanup failed",
      error instanceof Error ? error.message : "unknown");
  }).finally(() => { pruning = null; });
  return pruning;
}

export async function recordShopifyFunnelEvent(input: {
  businessId: string;
  agentId: string;
  conversationId: string;
  shopifyProductId: string;
  eventType: ShopifyFunnelEvent;
  signedToken: string;
}) {
  await ensureTable();
  await pruneExpiredEngagement();
  const digest = crypto.createHash("sha256").update(input.signedToken).digest("hex");
  // Deduplicate re-rendered recommendations, double clicks, and repeat cart
  // checks. Do not persist the signed token or shopper identity.
  await prisma.$executeRawUnsafe(
    "INSERT INTO shopify_funnel_event " +
    "(id,businessId,agentId,conversationId,shopifyProductId,eventType,tokenHash) " +
    "VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id",
    crypto.randomUUID(), input.businessId, input.agentId, input.conversationId,
    input.shopifyProductId, input.eventType, digest,
  );
}

function numeric(value: bigint | number | string | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function boundedRate(numerator: number, denominator: number) {
  if (denominator < 1) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export async function readShopifyFunnelSummary(businessId: string, storeId: string, days: 7 | 30 | 90 = 30) {
  await ensureTable();
  await pruneExpiredEngagement();
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  type EventRow = {
    eventType: ShopifyFunnelEvent;
    total: bigint | number;
    sessions: bigint | number;
  };
  type DailyRow = {
    day: string;
    recommendations: bigint | number;
    clicks: bigint | number;
    carts: bigint | number;
  };
  type ProductRow = {
    shopifyProductId: string;
    clicks: bigint | number;
    carts: bigint | number;
    views: bigint | number;
  };
  type ConvertedViewRow = {
    convertedRecommendations: bigint | number;
    convertedConversations: bigint | number;
  };
  const [totals, dailyGroups, products, convertedViews] = await Promise.all([
    prisma.$queryRawUnsafe<EventRow[]>(
      "SELECT eventType, COUNT(*) AS total, COUNT(DISTINCT conversationId) AS sessions " +
      "FROM shopify_funnel_event WHERE businessId=? AND createdAt>=? GROUP BY eventType",
      businessId, since,
    ),
    prisma.$queryRawUnsafe<DailyRow[]>(
      "SELECT DATE_FORMAT(createdAt,'%Y-%m-%d') AS day," +
      "SUM(CASE WHEN eventType='RECOMMENDATION_VIEW' THEN 1 ELSE 0 END) AS recommendations," +
      "SUM(CASE WHEN eventType='PRODUCT_CLICK' THEN 1 ELSE 0 END) AS clicks," +
      "SUM(CASE WHEN eventType='ADD_TO_CART' THEN 1 ELSE 0 END) AS carts " +
      "FROM shopify_funnel_event WHERE businessId=? AND createdAt>=? " +
      "GROUP BY DATE_FORMAT(createdAt,'%Y-%m-%d') ORDER BY day ASC",
      businessId, since,
    ),
    prisma.$queryRawUnsafe<ProductRow[]>(
      "SELECT shopifyProductId," +
      "SUM(CASE WHEN eventType='PRODUCT_CLICK' THEN 1 ELSE 0 END) AS clicks," +
      "SUM(CASE WHEN eventType='ADD_TO_CART' THEN 1 ELSE 0 END) AS carts," +
      "SUM(CASE WHEN eventType='RECOMMENDATION_VIEW' THEN 1 ELSE 0 END) AS views " +
      "FROM shopify_funnel_event WHERE businessId=? AND createdAt>=? GROUP BY shopifyProductId " +
      "ORDER BY carts DESC,clicks DESC,views DESC LIMIT 25",
      businessId, since,
    ),
    // A direct Add to Cart does not require a product-page click. Measure
    // true view-to-cart conversion on the same signed recommendation proof.
    prisma.$queryRawUnsafe<ConvertedViewRow[]>(
      "SELECT COUNT(DISTINCT v.tokenHash) AS convertedRecommendations, " +
      "COUNT(DISTINCT v.conversationId) AS convertedConversations " +
      "FROM shopify_funnel_event v INNER JOIN shopify_funnel_event c " +
      "ON c.businessId=v.businessId AND c.tokenHash=v.tokenHash " +
      "AND c.eventType='ADD_TO_CART' " +
      "WHERE v.businessId=? AND v.eventType='RECOMMENDATION_VIEW' " +
      "AND v.createdAt>=? AND c.createdAt>=?",
      businessId, since, since,
    ),
  ]);

  const empty: Stage = { events: 0, conversations: 0 };
  const byType = Object.fromEntries(totals.map(row => [
    row.eventType,
    { events: numeric(row.total), conversations: numeric(row.sessions) },
  ])) as Partial<Record<ShopifyFunnelEvent, Stage>>;
  const recommendations = byType.RECOMMENDATION_VIEW || empty;
  const clicks = byType.PRODUCT_CLICK || empty;
  const carts = byType.ADD_TO_CART || empty;
  const matchingViews = convertedViews[0];
  const convertedRecommendationCount = numeric(matchingViews?.convertedRecommendations);
  const convertedConversationCount = numeric(matchingViews?.convertedConversations);
  const dates = new Map(dailyGroups.map(d => [d.day, d]));
  const trend: Trend[] = Array.from({ length: days }, (_, index) => {
    const date = new Date(since.getTime() + index * 86400000).toISOString().slice(0, 10);
    const row = dates.get(date);
    return {
      day: date,
      recommendations: numeric(row?.recommendations),
      clicks: numeric(row?.clicks),
      carts: numeric(row?.carts),
    };
  });
  const lookupIds = products.map(p => p.shopifyProductId);
  const productRecords = lookupIds.length
    ? await prisma.shopifyProduct.findMany({
      where: { storeId, shopifyProductId: { in: lookupIds } },
      select: { shopifyProductId: true, title: true },
    })
    : [];
  const names = new Map(productRecords.map(p => [p.shopifyProductId, p.title]));
  return {
    available: true as const,
    periodDays: days,
    recommendations, clicks, carts,
    // Conversation engagement and product-level CTR use different denominators.
    conversationEngagementRate: boundedRate(clicks.conversations, recommendations.conversations),
    productClickThroughRate: boundedRate(clicks.events, recommendations.events),
    clickThroughRate: boundedRate(clicks.conversations, recommendations.conversations),
    addToCartRate: boundedRate(convertedConversationCount, recommendations.conversations),
    productCartRate: boundedRate(convertedRecommendationCount, recommendations.events),
    trend,
    topProducts: products.map(p => ({
      productId: p.shopifyProductId,
      title: names.get(p.shopifyProductId) || "Shopify product",
      clicks: numeric(p.clicks),
      carts: numeric(p.carts),
      recommendations: numeric(p.views),
      productClickThroughRate: boundedRate(numeric(p.clicks), numeric(p.views)),
    })),
    attributionNote: "Each product interaction is deduplicated by its signed recommendation, so adding the same recommendation twice does not count twice. Direct Add to Cart does not require a product-page click. View-to-cart rates count only cart events matched to a recorded impression. Accelerated checkouts may skip an observable cart event.",
  };
}


/**
 * Exact click-to-paid conversion cohort. The Shopify app sends only conversation
 * IDs extracted from signed, verified paid-order references through its HMAC-
 * authenticated server bridge. The returned value contains only a count.
 */
export async function countShopifyPaidClickConversions(
  businessId: string,
  paidConversationIds: string[],
  days: 7 | 30 | 90 = 30,
) {
  if (!paidConversationIds.length) return 0;
  if (paidConversationIds.length > 60 ||
      paidConversationIds.some(id => !/^[A-Za-z0-9_-]{10,80}$/.test(id))) {
    throw new Error("Invalid verified purchase conversation set.");
  }
  await ensureTable();
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const placeholders = paidConversationIds.map(() => "?").join(",");
  const rows = await prisma.$queryRawUnsafe<Array<{total: bigint | number}>>(
    "SELECT COUNT(DISTINCT conversationId) AS total " +
    "FROM shopify_funnel_event " +
    "WHERE businessId=? AND eventType='PRODUCT_CLICK' AND createdAt>=? " +
    "AND conversationId IN (" + placeholders + ")",
    businessId, since, ...paidConversationIds,
  );
  return numeric(rows[0]?.total);
}
