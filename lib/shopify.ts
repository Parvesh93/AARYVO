import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptToken, encryptToken } from "@/lib/token-crypto";
import { normalizePlan } from "@/lib/plan-entitlements";

const API_VERSION = "2026-07";
const DEFAULT_SCOPES = ["read_products", "read_inventory"];

export function shopifyAppUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://aaryvo.ppdesigntech.com").replace(/\/$/, "");
}

function apiKey() {
  return process.env.SHOPIFY_API_KEY?.trim() || "";
}

function apiSecret() {
  return process.env.SHOPIFY_API_SECRET?.trim() || "";
}

function scopes() {
  return (process.env.SHOPIFY_SCOPES || DEFAULT_SCOPES.join(","))
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function stateSecret() {
  return process.env.AUTH_SECRET || process.env.INTEGRATION_ENCRYPTION_KEY || "";
}

export function isShopifyConfigured() {
  return Boolean(apiKey() && apiSecret() && stateSecret());
}

export function normalizeShopDomain(input: string) {
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!value.endsWith(".myshopify.com")) value = `${value}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) {
    throw new Error("Enter a valid Shopify store domain.");
  }
  return value;
}

function signState(payload: string) {
  return crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

export function createShopifyState(businessId: string, userId: string, shop: string) {
  if (!stateSecret()) throw new Error("Shopify state signing is not configured.");
  const payload = Buffer.from(
    JSON.stringify({
      businessId,
      userId,
      shop,
      exp: Date.now() + 10 * 60 * 1000,
    }),
  ).toString("base64url");
  return `${payload}.${signState(payload)}`;
}

export function verifyShopifyState(state: string) {
  try {
    const [payload, signature] = state.split(".");
    if (!payload || !signature || !stateSecret()) return null;
    const expected = signState(payload);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      businessId: string;
      userId: string;
      shop: string;
      exp: number;
    };
    if (!parsed.businessId || !parsed.userId || !parsed.shop || parsed.exp <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function shopifyAuthorizationUrl(params: {
  businessId: string;
  userId: string;
  shop: string;
}) {
  if (!isShopifyConfigured()) throw new Error("Shopify integration is not configured.");
  const shop = normalizeShopDomain(params.shop);
  const state = createShopifyState(params.businessId, params.userId, shop);
  const query = new URLSearchParams({
    client_id: apiKey(),
    scope: scopes().join(","),
    redirect_uri: `${shopifyAppUrl()}/api/integrations/shopify/callback`,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${query.toString()}`;
}

export function verifyShopifyCallbackHmac(url: URL) {
  const received = url.searchParams.get("hmac");
  if (!received || !apiSecret()) return false;

  const entries = [...url.searchParams.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const expected = crypto.createHmac("sha256", apiSecret()).update(entries).digest("hex");
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function exchangeShopifyCode(shop: string, code: string) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: apiKey(),
      client_secret: apiSecret(),
      code,
    }),
    cache: "no-store",
  });

  const data = (await response.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Shopify authorization failed.");
  }

  return {
    accessToken: data.access_token,
    scope: data.scope || "",
  };
}

export async function saveShopifyConnection(params: {
  businessId: string;
  shop: string;
  accessToken: string;
  scope: string;
}) {
  const encryptedToken = encryptToken(params.accessToken);
  const connectedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const [storeForBusiness, storeForDomain] = await Promise.all([
      tx.shopifyStore.findUnique({ where: { businessId: params.businessId } }),
      tx.shopifyStore.findUnique({ where: { shopDomain: params.shop } }),
    ]);

    // Completing Shopify OAuth proves control of this store. If the same store
    // was previously linked to another AARYVO workspace (for example during
    // testing/re-onboarding), safely transfer that connection to the workspace
    // that just completed OAuth instead of failing the unique shop-domain key.
    if (storeForDomain && storeForDomain.businessId !== params.businessId) {
      if (storeForBusiness && storeForBusiness.id !== storeForDomain.id) {
        await tx.shopifyStore.delete({ where: { id: storeForBusiness.id } });
      }

      return tx.shopifyStore.update({
        where: { id: storeForDomain.id },
        data: {
          businessId: params.businessId,
          accessTokenEncrypted: encryptedToken,
          scope: params.scope,
          status: "CONNECTED",
          connectedAt,
          lastSyncError: null,
        },
      });
    }

    return tx.shopifyStore.upsert({
      where: { businessId: params.businessId },
      create: {
        businessId: params.businessId,
        shopDomain: params.shop,
        accessTokenEncrypted: encryptedToken,
        scope: params.scope,
        status: "CONNECTED",
        connectedAt,
      },
      update: {
        shopDomain: params.shop,
        accessTokenEncrypted: encryptedToken,
        scope: params.scope,
        status: "CONNECTED",
        connectedAt,
        lastSyncError: null,
      },
    });
  });
}

async function graphql<T>(shop: string, token: string, query: string, variables: Record<string, unknown>) {
  const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok || payload.errors?.length || !payload.data) {
    throw new Error(
      payload.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
        `Shopify API request failed (${response.status}).`,
    );
  }

  return payload.data;
}

type ProductNode = {
  id: string;
  title: string;
  handle: string;
  description: string;
  vendor: string;
  productType: string;
  status: string;
  tags: string[];
  onlineStoreUrl: string | null;
  updatedAt: string;
  featuredImage: { url: string } | null;
  priceRangeV2: {
    minVariantPrice: { amount: string; currencyCode: string };
    maxVariantPrice: { amount: string; currencyCode: string };
  };
  variants: {
    nodes: Array<{
      id: string;
      title: string;
      sku: string | null;
      price: string;
      compareAtPrice: string | null;
      availableForSale: boolean;
      inventoryQuantity: number | null;
      image: { url: string } | null;
      selectedOptions: Array<{ name: string; value: string }>;
    }>;
  };
};

type ProductsResponse = {
  products: {
    nodes: ProductNode[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

const PRODUCTS_QUERY = `
  query AaryvoProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: UPDATED_AT) {
      nodes {
        id
        title
        handle
        description
        vendor
        productType
        status
        tags
        onlineStoreUrl
        updatedAt
        featuredImage { url }
        priceRangeV2 {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
        variants(first: 100) {
          nodes {
            id
            title
            sku
            price
            compareAtPrice
            availableForSale
            inventoryQuantity
            image { url }
            selectedOptions { name value }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export function shopifyProductLimit(plan: string | null | undefined) {
  const normalized = normalizePlan(plan);
  if (normalized === "STARTER") return 500;
  if (normalized === "GROWTH") return 5000;
  if (normalized === "PRO") return 25000;
  return 0;
}

export async function syncShopifyCatalog(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      plan: true,
      shopifyStore: true,
    },
  });

  if (!business?.shopifyStore) throw new Error("Shopify is not connected.");

  const limit = shopifyProductLimit(business.plan);
  if (limit <= 0) throw new Error("Shopify integration requires Starter or higher.");

  const store = business.shopifyStore;
  const token = decryptToken(store.accessTokenEncrypted);
  let cursor: string | null = null;
  let synced = 0;

  await prisma.shopifyStore.update({
    where: { id: store.id },
    data: { lastSyncStatus: "SYNCING", lastSyncError: null },
  });

  try {
    do {
      const remaining = limit - synced;
      if (remaining <= 0) break;
      const first = Math.min(50, remaining);
      const data: ProductsResponse = await graphql<ProductsResponse>(
        store.shopDomain,
        token,
        PRODUCTS_QUERY,
        { first, after: cursor },
      );

      for (const product of data.products.nodes) {
        const saved = await prisma.shopifyProduct.upsert({
          where: {
            storeId_shopifyProductId: {
              storeId: store.id,
              shopifyProductId: product.id,
            },
          },
          create: {
            storeId: store.id,
            shopifyProductId: product.id,
            title: product.title,
            handle: product.handle,
            description: product.description || null,
            vendor: product.vendor || null,
            productType: product.productType || null,
            status: product.status,
            tags: product.tags.join(", "),
            featuredImageUrl: product.featuredImage?.url || null,
            onlineStoreUrl: product.onlineStoreUrl,
            minPrice: Number(product.priceRangeV2.minVariantPrice.amount),
            maxPrice: Number(product.priceRangeV2.maxVariantPrice.amount),
            currencyCode: product.priceRangeV2.minVariantPrice.currencyCode,
            shopifyUpdatedAt: new Date(product.updatedAt),
            syncedAt: new Date(),
          },
          update: {
            title: product.title,
            handle: product.handle,
            description: product.description || null,
            vendor: product.vendor || null,
            productType: product.productType || null,
            status: product.status,
            tags: product.tags.join(", "),
            featuredImageUrl: product.featuredImage?.url || null,
            onlineStoreUrl: product.onlineStoreUrl,
            minPrice: Number(product.priceRangeV2.minVariantPrice.amount),
            maxPrice: Number(product.priceRangeV2.maxVariantPrice.amount),
            currencyCode: product.priceRangeV2.minVariantPrice.currencyCode,
            shopifyUpdatedAt: new Date(product.updatedAt),
            syncedAt: new Date(),
          },
        });

        for (const variant of product.variants.nodes) {
          await prisma.shopifyVariant.upsert({
            where: {
              productId_shopifyVariantId: {
                productId: saved.id,
                shopifyVariantId: variant.id,
              },
            },
            create: {
              productId: saved.id,
              shopifyVariantId: variant.id,
              title: variant.title,
              sku: variant.sku,
              price: Number(variant.price),
              compareAtPrice: variant.compareAtPrice ? Number(variant.compareAtPrice) : null,
              availableForSale: variant.availableForSale,
              inventoryQuantity: variant.inventoryQuantity,
              imageUrl: variant.image?.url || null,
              optionSummary: variant.selectedOptions
                .map((option) => `${option.name}: ${option.value}`)
                .join(" · "),
              syncedAt: new Date(),
            },
            update: {
              title: variant.title,
              sku: variant.sku,
              price: Number(variant.price),
              compareAtPrice: variant.compareAtPrice ? Number(variant.compareAtPrice) : null,
              availableForSale: variant.availableForSale,
              inventoryQuantity: variant.inventoryQuantity,
              imageUrl: variant.image?.url || null,
              optionSummary: variant.selectedOptions
                .map((option) => `${option.name}: ${option.value}`)
                .join(" · "),
              syncedAt: new Date(),
            },
          });
        }

        synced++;
        if (synced >= limit) break;
      }

      cursor = data.products.pageInfo.endCursor;
      if (!data.products.pageInfo.hasNextPage) cursor = null;
    } while (cursor && synced < limit);

    await prisma.shopifyStore.update({
      where: { id: store.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: "SUCCESS",
        lastSyncError: null,
      },
    });

    return {
      synced,
      limit,
      capped: synced >= limit,
    };
  } catch (error) {
    await prisma.shopifyStore.update({
      where: { id: store.id },
      data: {
        lastSyncStatus: "FAILED",
        lastSyncError: String(error instanceof Error ? error.message : error).slice(0, 4000),
      },
    });
    throw error;
  }
}

export async function disconnectShopify(businessId: string) {
  const store = await prisma.shopifyStore.findUnique({ where: { businessId } });
  if (!store) return;
  await prisma.shopifyStore.delete({ where: { id: store.id } });
}
