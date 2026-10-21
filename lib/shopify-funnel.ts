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

export async function recordShopifyFunnelEvent(input: {
  businessId: string;
  agentId: string;
  conversationId: string;
  shopifyProductId: string;
  eventType: ShopifyFunnelEvent;
  signedToken: string;
}) {
  await ensureTable();
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

export async function readShopifyFunnelSummary(businessId: string, storeId: string) {
  await ensureTable();
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 29);

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
  const [totals, days, products] = await Promise.all([
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
      "ORDER BY clicks DESC,views DESC LIMIT 10",
      businessId, since,
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
  const dates = new Map(days.map(d => [d.day, d]));
  const trend: Trend[] = Array.from({ length: 30 }, (_, index) => {
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
    periodDays: 30,
    recommendations, clicks, carts,
    clickThroughRate: boundedRate(clicks.conversations, recommendations.conversations),
    addToCartRate: boundedRate(carts.conversations, clicks.conversations),
    trend,
    topProducts: products.map(p => ({
      productId: p.shopifyProductId,
      title: names.get(p.shopifyProductId) || "Shopify product",
      clicks: numeric(p.clicks),
      carts: numeric(p.carts),
      recommendations: numeric(p.views),
    })),
    attributionNote: "Engagement counts are deduplicated by signed product recommendation. Add-to-cart is counted only when the storefront detects a matching Shopify cart item. Some accelerated checkouts skip this step.",
  };
}
