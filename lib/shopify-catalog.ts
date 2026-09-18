import { prisma } from "@/lib/prisma";

const STOP_WORDS = new Set([
  "the","and","for","with","that","this","from","have","has","your","you","our","are","was","were",
  "can","could","would","should","want","need","show","find","give","tell","about","looking","something",
  "product","products","item","items","please","under","below","above","over","than","into","some","any",
  "what","which","where","when","how","there","their","them","they","its","also","only","more","less",
  "type","types","sell","selling","sold","store","shop","catalog","catalogue","collection","collections",
  "recommend","recommended","recommendation","options","option","available","availability","stock","price","prices",
]);

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9₹$€£.%\s-]/g, " ").replace(/\s+/g, " ").trim();
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
  return [...new Set(
    normalize(query)
      .split(" ")
      .map((term) => term.trim())
      .filter((term) => term.length >= 3)
      .filter((term) => !STOP_WORDS.has(term))
      .filter((term) => !/^[₹$€£]?\d+(?:\.\d+)?$/.test(term)),
  )].slice(0, 8);
}

function isBroadDiscoveryQuery(query: string) {
  return /\b(what.*sell|what.*product|what.*collection|show.*product|show.*item|browse|recommend|suggest|catalog(?:ue)?|shop|collection|products?|items?)\b/i.test(query);
}

export function isShopifyCommerceQuery(query: string) {
  if (priceCeiling(query) !== null) return true;
  if (/\b(product|products|item|items|collection|collections|buy|shop|price|cost|size|colour|color|variant|stock|available|gift|gifting|recommend|suggest)\b/i.test(query)) return true;
  const terms = searchTerms(query);
  return terms.length > 0 && query.trim().split(/\s+/).length >= 2;
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

  const [productCount, sample] = await Promise.all([
    prisma.shopifyProduct.count({
      where: { storeId: store.id, status: "ACTIVE" },
    }),
    prisma.shopifyProduct.findMany({
      where: { storeId: store.id, status: "ACTIVE" },
      select: {
        productType: true,
        vendor: true,
        currencyCode: true,
        minPrice: true,
        maxPrice: true,
      },
      take: 250,
    }),
  ]);

  const productTypes = [...new Set(sample.map((item) => item.productType?.trim()).filter(Boolean) as string[])]
    .slice(0, 30);
  const vendors = [...new Set(sample.map((item) => item.vendor?.trim()).filter(Boolean) as string[])]
    .slice(0, 20);
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
): Promise<ShopifyCatalogProduct[]> {
  const terms = searchTerms(query);
  const maxPrice = priceCeiling(query);
  const broadDiscovery = isBroadDiscoveryQuery(query);
  const wantsAvailable = /\b(in stock|available now|available|ready to ship)\b/i.test(query);

  if (!terms.length && maxPrice === null && !broadDiscovery) return [];

  const store = await connectedStore(businessId);
  if (!store || store.status !== "CONNECTED") return [];

  const where = {
    storeId: store.id,
    status: "ACTIVE",
    ...(terms.length
      ? {
          OR: terms.flatMap((term) => [
            { title: { contains: term } },
            { vendor: { contains: term } },
            { productType: { contains: term } },
            { tags: { contains: term } },
            { description: { contains: term } },
            { variants: { some: { optionSummary: { contains: term } } } },
          ]),
        }
      : {}),
    ...(maxPrice !== null ? { minPrice: { lte: maxPrice } } : {}),
    ...(wantsAvailable ? { variants: { some: { availableForSale: true } } } : {}),
  };

  const products = await prisma.shopifyProduct.findMany({
    where,
    include: {
      variants: {
        orderBy: { price: "asc" },
        take: 12,
      },
    },
    orderBy: [{ syncedAt: "desc" }],
    take: 60,
  });

  const scored = products.map((product) => {
    const title = normalize(product.title);
    const type = normalize(product.productType || "");
    const vendor = normalize(product.vendor || "");
    const tags = normalize(product.tags || "");
    const description = normalize(product.description || "").slice(0, 2500);
    const variantText = normalize(product.variants.map((variant) => variant.optionSummary || variant.title).join(" "));

    let score = terms.length ? 0 : 1;
    for (const term of terms) {
      if (title.includes(term)) score += 8;
      if (type.includes(term)) score += 5;
      if (tags.includes(term)) score += 4;
      if (vendor.includes(term)) score += 3;
      if (variantText.includes(term)) score += 3;
      if (description.includes(term)) score += 1;
    }
    if (product.variants.some((variant) => variant.availableForSale)) score += 2;
    if (maxPrice !== null && product.minPrice !== null && product.minPrice <= maxPrice) score += 3;
    return { product, score };
  });

  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(limit, 12)))
    .map(({ product }) => ({
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
      product.url ? `URL: ${product.url}` : null,
    ].filter(Boolean).join("\n");
  }).join("\n\n---\n\n");
}
