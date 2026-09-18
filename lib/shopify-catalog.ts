import { prisma } from "@/lib/prisma";

const STOP_WORDS = new Set([
  "the","and","for","with","that","this","from","have","has","your","you","our","are","was","were",
  "can","could","would","should","want","need","show","find","give","tell","about","looking","something",
  "product","products","item","items","please","under","below","above","over","than","into","some","any",
  "what","which","where","when","how","there","their","them","they","its","also","only","more","less",
]);

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9₹$€£.%\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function searchTerms(query: string) {
  return [...new Set(
    normalize(query)
      .split(" ")
      .map((term) => term.trim())
      .filter((term) => term.length >= 3 && !STOP_WORDS.has(term) && !/^\d+$/.test(term)),
  )].slice(0, 8);
}

function safeStorefrontUrl(websiteUrl: string | null, shopDomain: string, handle: string | null, onlineStoreUrl: string | null) {
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

export async function searchShopifyCatalog(
  businessId: string,
  query: string,
  limit = 8,
): Promise<ShopifyCatalogProduct[]> {
  const terms = searchTerms(query);
  if (!terms.length) return [];

  const store = await prisma.shopifyStore.findUnique({
    where: { businessId },
    select: {
      id: true,
      shopDomain: true,
      status: true,
      business: { select: { websiteUrl: true } },
    },
  });
  if (!store || store.status !== "CONNECTED") return [];

  const products = await prisma.shopifyProduct.findMany({
    where: {
      storeId: store.id,
      status: "ACTIVE",
      OR: terms.flatMap((term) => [
        { title: { contains: term } },
        { vendor: { contains: term } },
        { productType: { contains: term } },
        { tags: { contains: term } },
        { description: { contains: term } },
      ]),
    },
    include: {
      variants: {
        orderBy: { price: "asc" },
        take: 12,
      },
    },
    take: 40,
  });

  const scored = products.map((product) => {
    const title = normalize(product.title);
    const type = normalize(product.productType || "");
    const vendor = normalize(product.vendor || "");
    const tags = normalize(product.tags || "");
    const description = normalize(product.description || "").slice(0, 2500);

    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += 8;
      if (type.includes(term)) score += 5;
      if (tags.includes(term)) score += 4;
      if (vendor.includes(term)) score += 3;
      if (description.includes(term)) score += 1;
    }
    if (product.variants.some((variant) => variant.availableForSale)) score += 2;
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
