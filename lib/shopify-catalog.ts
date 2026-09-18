import { prisma } from "@/lib/prisma";

const STOP_WORDS = new Set([
  "the","and","for","with","that","this","from","have","has","your","you","our","are","was","were",
  "can","could","would","should","want","need","show","find","give","tell","about","looking","something",
  "product","products","item","items","please","under","below","above","over","than","into","some","any",
  "what","which","where","when","how","there","their","them","they","its","also","only","more","less",
  "type","types","sell","selling","sold","store","shop","catalog","catalogue","collection","collections",
  "recommend","recommended","recommendation","options","option","available","availability","stock","price","prices",
  "hello","hey","thanks","thank","welcome","there","today","help","budget","range","flexible","prefer","preferred","preference",
]);

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/[^a-z0-9₹$€£.%\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TERM_SYNONYMS: Record<string, string[]> = {
  jewellery: ["jewelry"],
  jewelry: ["jewellery"],
  ring: ["rings"],
  rings: ["ring"],
  bracelet: ["bracelets", "bangle", "bangles"],
  bracelets: ["bracelet", "bangle", "bangles"],
  bangle: ["bracelet", "bracelets", "bangles"],
  bangles: ["bracelet", "bracelets", "bangle"],
  pants: ["pant", "trouser", "trousers"],
  pant: ["pants", "trouser", "trousers"],
  trouser: ["pants", "pant", "trousers"],
  trousers: ["pants", "pant", "trouser"],
  skincare: ["skin", "serum", "cleanser", "cream", "moisturizer", "moisturiser"],
  moisturizer: ["moisturiser", "cream", "skincare"],
  moisturiser: ["moisturizer", "cream", "skincare"],
  coord: ["co ord", "coordinated", "set"],
  set: ["coord", "co ord"],
};

function expandTerms(terms: string[]) {
  const expanded: string[] = [];
  for (const term of terms) {
    expanded.push(term);
    for (const synonym of TERM_SYNONYMS[term] || []) expanded.push(synonym);
  }
  return [...new Set(expanded)].slice(0, 16);
}

function priceCeiling(query: string) {
  const normalized = query.replace(/,/g, "");
  const match = normalized.match(
    /(?:under|below|less than|up to|upto|maximum|max|budget(?:\s+is)?(?:\s+around)?)[^0-9]{0,12}(?:₹|\$|€|£)?\s*(\d+(?:\.\d+)?)/i,
  );
  if (match?.[1]) {
    const value = Number(match[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  return null;
}

function searchTerms(query: string) {
  const raw = [...new Set(
    normalize(query)
      .split(" ")
      .map((term) => term.trim())
      .filter((term) => term.length >= 3)
      .filter((term) => !STOP_WORDS.has(term))
      .filter((term) => !/^[₹$€£]?\d+(?:\.\d+)?$/.test(term)),
  )].slice(0, 8);

  return expandTerms(raw);
}

function isBroadDiscoveryQuery(query: string) {
  return /\b(what.*sell|what.*product|what.*collection|show.*product|show.*item|browse|recommend|suggest|catalog(?:ue)?|shop|collection|products?|items?)\b/i.test(query);
}

export function isShopifyCommerceQuery(query: string) {
  if (priceCeiling(query) !== null) return true;
  if (/\b(product|products|item|items|collection|collections|buy|shop|price|cost|size|colour|color|variant|stock|available|gift|gifting|recommend|suggest)\b/i.test(query)) return true;
  // A single meaningful word such as "pants", "jewellery" or "skincare"
  // should be treated as a catalogue search when Shopify is connected.
  return searchTerms(query).length > 0;
}

export function isLikelyShopifyRefinement(query: string) {
  const normalized = normalize(query);
  const words = normalized.split(" ").filter(Boolean);
  if (!words.length || words.length > 6) return false;

  if (/\b(any budget|no budget|budget flexible|no preference|anything|any color|any colour|any size)\b/i.test(query)) {
    return true;
  }

  return /\b(minimal|simple|classic|modern|gold|golden|silver|rose|black|white|red|blue|green|pink|beige|brown|small|medium|large|xs|xl|xxl|casual|formal|everyday|daily|gifting|gift|party|wedding|office|workwear|premium|luxury|affordable)\b/i.test(normalized);
}

function safeStorefrontUrl(
  websiteUrl: string | null,
  shopDomain: string,
  handle: string | null,
  onlineStoreUrl: string | null,
) {
  if (onlineStoreUrl?.startsWith("https://")) return onlineStoreUrl;
  if (!handle) return null;
  try {
    if (websiteUrl) return new URL(`/products/${handle}`, websiteUrl).toString();
  } catch {}
  return `https://${shopDomain}/products/${encodeURIComponent(handle)}`;
}

export type ShopifyCatalogProduct = {
  id: string;
  title: string;
  description: string;
  vendor: string | null;
  productType: string | null;
  tags: string | null;
  imageUrl: string | null;
  url: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  currencyCode: string | null;
  availableForSale: boolean;
  variants: Array<{
    id: string;
    title: string;
    price: number | null;
    compareAtPrice: number | null;
    availableForSale: boolean;
    inventoryQuantity: number | null;
    optionSummary: string | null;
  }>;
  knowledge?: string | null;
};

export type ShopifyCatalogOverview = {
  shopDomain: string;
  productCount: number;
  productTypes: string[];
  vendors: string[];
  currencyCode: string | null;
  minPrice: number | null;
  maxPrice: number | null;
};

async function connectedStore(businessId: string) {
  return prisma.shopifyStore.findUnique({
    where: { businessId },
    select: {
      id: true,
      shopDomain: true,
      status: true,
      business: { select: { websiteUrl: true } },
    },
  });
}

export async function getShopifyCatalogOverview(
  businessId: string,
): Promise<ShopifyCatalogOverview | null> {
  const store = await connectedStore(businessId);
  if (!store || store.status !== "CONNECTED") return null;

  const activeWhere = { storeId: store.id, status: "ACTIVE" as const };

  // Keep the chat-time overview to basic reads only. This avoids adapter-
  // sensitive aggregate/group operations and is reliable on production MariaDB.
  const [productCount, sample] = await Promise.all([
    prisma.shopifyProduct.count({ where: activeWhere }),
    prisma.shopifyProduct.findMany({
      where: activeWhere,
      select: {
        productType: true,
        vendor: true,
        currencyCode: true,
        minPrice: true,
        maxPrice: true,
      },
      take: 500,
    }),
  ]);

  const productTypes = [...new Set(
    sample.map((item) => item.productType?.trim()).filter(Boolean) as string[],
  )].slice(0, 40);

  const vendors = [...new Set(
    sample.map((item) => item.vendor?.trim()).filter(Boolean) as string[],
  )].slice(0, 30);

  const prices = sample
    .flatMap((item) => [item.minPrice, item.maxPrice])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    shopDomain: store.shopDomain,
    productCount,
    productTypes,
    vendors,
    currencyCode: sample.find((item) => item.currencyCode)?.currencyCode || null,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
  };
}

export async function searchShopifyCatalog(
  businessId: string,
  query: string,
  limit = 8,
  agentId?: string,
): Promise<ShopifyCatalogProduct[]> {
  const terms = searchTerms(query);
  const maxPrice = priceCeiling(query);
  const broadDiscovery = isBroadDiscoveryQuery(query);
  const wantsAvailable = /\b(in stock|available now|available|ready to ship)\b/i.test(query);

  if (!terms.length && maxPrice === null && !broadDiscovery) return [];

  const store = await connectedStore(businessId);
  if (!store || store.status !== "CONNECTED") return [];

  // Rich Shopify knowledge is optional enrichment. Never let a knowledge query
  // failure prevent structured product search from returning real products.
  const knowledgeByShopifyId = new Map<string, string>();

  if (agentId && terms.length) {
    try {
      const knowledgeMatches = await prisma.knowledgeItem.findMany({
        where: {
          agentId,
          OR: terms.flatMap((term) => [
            { title: { contains: term } },
            { content: { contains: term } },
          ]),
        },
        select: { source: true, content: true },
        take: 100,
      });

      for (const item of knowledgeMatches) {
        if (!item.source.startsWith("shopify://product/")) continue;
        const encodedId = item.source.slice("shopify://product/".length);
        if (!encodedId) continue;
        try {
          knowledgeByShopifyId.set(decodeURIComponent(encodedId), item.content);
        } catch {}
      }
    } catch (error) {
      console.error("AARYVO Shopify knowledge search error", error);
    }
  }

  const includeVariants = {
    variants: {
      orderBy: { price: "asc" as const },
      take: 16,
    },
  };

  const rows = new Map<string, Awaited<ReturnType<typeof prisma.shopifyProduct.findMany>>[number]>();

  async function addRows(
    found: Awaited<ReturnType<typeof prisma.shopifyProduct.findMany>>,
  ) {
    for (const product of found) rows.set(product.id, product);
  }

  if (!terms.length && broadDiscovery) {
    await addRows(await prisma.shopifyProduct.findMany({
      where: { storeId: store.id, status: "ACTIVE" },
      include: includeVariants,
      orderBy: { syncedAt: "desc" },
      take: 100,
    }));
  } else {
    // First search the strongest structured commerce fields. This keeps queries
    // such as "rings", "bangles" or "skincare" reliable even if rich knowledge
    // indexing is unavailable.
    const primaryOr = terms.flatMap((term) => [
      { title: { contains: term } },
      { productType: { contains: term } },
      { tags: { contains: term } },
      { vendor: { contains: term } },
    ]);

    if (primaryOr.length) {
      await addRows(await prisma.shopifyProduct.findMany({
        where: {
          storeId: store.id,
          status: "ACTIVE",
          OR: primaryOr,
        },
        include: includeVariants,
        take: 120,
      }));
    }

    // Search descriptions separately so a very broad description match cannot
    // crowd out exact title/product-type matches before ranking.
    if (rows.size < 80 && terms.length) {
      await addRows(await prisma.shopifyProduct.findMany({
        where: {
          storeId: store.id,
          status: "ACTIVE",
          OR: terms.map((term) => ({ description: { contains: term } })),
        },
        include: includeVariants,
        take: 80,
      }));
    }

    const knowledgeIds = [...knowledgeByShopifyId.keys()];
    if (knowledgeIds.length) {
      await addRows(await prisma.shopifyProduct.findMany({
        where: {
          storeId: store.id,
          status: "ACTIVE",
          shopifyProductId: { in: knowledgeIds },
        },
        include: includeVariants,
        take: 100,
      }));
    }
  }

  const candidates = [...rows.values()].filter((product) => {
    if (maxPrice !== null && (product.minPrice === null || product.minPrice > maxPrice)) return false;
    if (wantsAvailable && !product.variants.some((variant) => variant.availableForSale)) return false;
    return true;
  });

  const scored = candidates.map((product) => {
    const title = normalize(product.title);
    const type = normalize(product.productType || "");
    const vendor = normalize(product.vendor || "");
    const tags = normalize(product.tags || "");
    const description = normalize(product.description || "").slice(0, 3000);
    const variantText = normalize(
      product.variants.map((variant) => variant.optionSummary || variant.title).join(" "),
    );
    const richKnowledge = knowledgeByShopifyId.get(product.shopifyProductId) || "";
    const knowledgeText = normalize(richKnowledge).slice(0, 16000);

    let score = terms.length ? 0 : 1;
    for (const term of terms) {
      if (title === term) score += 14;
      else if (title.includes(term)) score += 9;
      if (type === term) score += 12;
      else if (type.includes(term)) score += 7;
      if (tags.includes(term)) score += 5;
      if (vendor.includes(term)) score += 3;
      if (variantText.includes(term)) score += 4;
      if (knowledgeText.includes(term)) score += 4;
      if (description.includes(term)) score += 1;
    }

    if (product.variants.some((variant) => variant.availableForSale)) score += 2;
    if (maxPrice !== null && product.minPrice !== null && product.minPrice <= maxPrice) score += 3;

    return { product, score };
  });

  const ranked = scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  const target = Math.max(1, Math.min(limit, 12));
  const selected = !terms.length && broadDiscovery
    ? (() => {
        const output: typeof ranked = [];
        const seenTypes = new Set<string>();

        for (const row of ranked) {
          const key = normalize(row.product.productType || row.product.vendor || row.product.title);
          if (key && !seenTypes.has(key)) {
            seenTypes.add(key);
            output.push(row);
          }
          if (output.length >= target) break;
        }

        for (const row of ranked) {
          if (output.length >= target) break;
          if (!output.includes(row)) output.push(row);
        }
        return output;
      })()
    : ranked.slice(0, target);

  return selected.map(({ product }) => ({
    id: product.id,
    title: product.title,
    description: (product.description || "").replace(/\s+/g, " ").trim().slice(0, 420),
    vendor: product.vendor,
    productType: product.productType,
    tags: product.tags,
    imageUrl: product.featuredImageUrl,
    url: safeStorefrontUrl(
      store.business.websiteUrl,
      store.shopDomain,
      product.handle,
      product.onlineStoreUrl,
    ),
    minPrice: product.minPrice,
    maxPrice: product.maxPrice,
    currencyCode: product.currencyCode,
    availableForSale: product.variants.some((variant) => variant.availableForSale),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      availableForSale: variant.availableForSale,
      inventoryQuantity: variant.inventoryQuantity,
      optionSummary: variant.optionSummary,
    })),
    knowledge: knowledgeByShopifyId.get(product.shopifyProductId) || null,
  }));
}

export function buildShopifyOverviewContext(overview: ShopifyCatalogOverview | null) {
  if (!overview) return "";
  const priceRange =
    overview.minPrice !== null
      ? `${overview.currencyCode || ""} ${overview.minPrice}${overview.maxPrice !== null && overview.maxPrice !== overview.minPrice ? `–${overview.maxPrice}` : ""}`
      : "N/A";

  return [
    `CONNECTED SHOPIFY STORE: ${overview.shopDomain}`,
    `ACTIVE PRODUCT COUNT: ${overview.productCount}`,
    `PRODUCT TYPES: ${overview.productTypes.length ? overview.productTypes.join(", ") : "Not categorized"}`,
    `VENDORS: ${overview.vendors.length ? overview.vendors.join(", ") : "N/A"}`,
    `CATALOGUE PRICE RANGE: ${priceRange}`,
  ].join("\n");
}

export function buildShopifyCatalogContext(products: ShopifyCatalogProduct[]) {
  if (!products.length) return "";
  return products.map((product) => {
    const price =
      product.minPrice == null
        ? "Price unavailable"
        : product.minPrice === product.maxPrice
          ? `${product.currencyCode || ""} ${product.minPrice}`
          : `${product.currencyCode || ""} ${product.minPrice}–${product.maxPrice}`;

    const variants = product.variants
      .slice(0, 8)
      .map((variant) =>
        [
          variant.title,
          variant.price == null ? null : `${product.currencyCode || ""} ${variant.price}`,
          variant.availableForSale ? "available" : "sold out",
          variant.optionSummary || null,
        ].filter(Boolean).join(" | "),
      )
      .join("; ");

    return [
      `PRODUCT_ID: ${product.id}`,
      `TITLE: ${product.title}`,
      `TYPE: ${product.productType || "N/A"}`,
      `VENDOR: ${product.vendor || "N/A"}`,
      `PRICE: ${price}`,
      `AVAILABILITY: ${product.availableForSale ? "Available" : "Sold out"}`,
      `TAGS: ${product.tags || "N/A"}`,
      `DESCRIPTION: ${product.description || "N/A"}`,
      variants ? `VARIANTS: ${variants}` : null,
      product.knowledge ? `RICH SHOPIFY KNOWLEDGE:\n${product.knowledge.slice(0, 7000)}` : null,
      product.url ? `URL: ${product.url}` : null,
    ].filter(Boolean).join("\n");
  }).join("\n\n---\n\n");
}
