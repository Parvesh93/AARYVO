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

export function verifyShopifyWebhookHmac(
  rawBody: string,
  receivedHmac: string | null,
) {
  if (!receivedHmac || !apiSecret()) return false;

  const expected = crypto
    .createHmac("sha256", apiSecret())
    .update(rawBody, "utf8")
    .digest("base64");

  const a = Buffer.from(receivedHmac, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function registerShopifyUninstallWebhook(
  shop: string,
  accessToken: string,
) {
  const callbackUrl = `${shopifyAppUrl()}/api/webhooks/shopify/app-uninstalled`;
  const response = await fetch(
    `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: `mutation AaryvoRegisterUninstallWebhook($callbackUrl: URL!) {
          webhookSubscriptionCreate(
            topic: APP_UNINSTALLED
            webhookSubscription: {
              callbackUrl: $callbackUrl
              format: JSON
            }
          ) {
            webhookSubscription {
              id
              topic
              uri
            }
            userErrors {
              field
              message
            }
          }
        }`,
        variables: { callbackUrl },
      }),
      cache: "no-store",
    },
  );

  const payload = (await response.json()) as {
    data?: {
      webhookSubscriptionCreate?: {
        webhookSubscription?: { id?: string; topic?: string; uri?: string } | null;
        userErrors?: Array<{ message?: string }>;
      };
    };
    errors?: Array<{ message?: string }>;
  };

  const userErrors =
    payload.data?.webhookSubscriptionCreate?.userErrors
      ?.map((error) => error.message)
      .filter(Boolean) || [];

  if (!response.ok || payload.errors?.length || userErrors.length) {
    throw new Error(
      payload.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
        userErrors.join("; ") ||
        "Unable to register Shopify uninstall webhook.",
    );
  }

  return payload.data?.webhookSubscriptionCreate?.webhookSubscription || null;
}

export async function cleanupShopifyAfterUninstall(shopInput: string) {
  const shop = normalizeShopDomain(shopInput);
  const store = await prisma.shopifyStore.findUnique({
    where: { shopDomain: shop },
    include: {
      business: {
        select: {
          id: true,
          razorpaySubscriptionId: true,
        },
      },
    },
  });

  if (!store) return { cleaned: false, reason: "not_found" as const };

  const agentIds = (
    await prisma.agent.findMany({
      where: { businessId: store.businessId },
      select: { id: true },
    })
  ).map((agent) => agent.id);

  await prisma.$transaction(async (tx) => {
    if (agentIds.length) {
      await tx.knowledgeItem.deleteMany({
        where: {
          agentId: { in: agentIds },
          source: { startsWith: "shopify://" },
        },
      });
    }

    await tx.shopifyStore.delete({ where: { id: store.id } });

    if (!store.business.razorpaySubscriptionId) {
      await tx.business.update({
        where: { id: store.businessId },
        data: {
          plan: "FREE",
          subscriptionStatus: "FREE",
          monthlyConversationLimit: 50,
          subscriptionCurrentStart: null,
          subscriptionCurrentEnd: null,
          subscriptionCancelAtEnd: false,
          usagePeriodStart: null,
          usagePeriodEnd: null,
        },
      });
    }
  });

  return {
    cleaned: true,
    businessId: store.businessId,
    shopDomain: shop,
  };
}

async function readShopifyTokenResponse(response: Response) {
  const raw = await response.text();
  let data: {
    access_token?: string;
    scope?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    error?: string;
    error_description?: string;
  } = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    const plain = raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);

    throw new Error(
      plain ||
        `Shopify token endpoint returned an invalid response (${response.status}).`,
    );
  }

  return data;
}

export async function exchangeShopifyCode(shop: string, code: string) {
  const form = new URLSearchParams({
    client_id: apiKey(),
    client_secret: apiSecret(),
    code,
    expiring: "1",
  });

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });

  const data = await readShopifyTokenResponse(response);

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Shopify authorization failed.");
  }

  return {
    accessToken: data.access_token,
    scope: data.scope || "",
    expiresIn: data.expires_in || null,
    refreshToken: data.refresh_token || null,
    refreshTokenExpiresIn: data.refresh_token_expires_in || null,
  };
}

export async function saveShopifyConnection(params: {
  businessId: string;
  shop: string;
  accessToken: string;
  scope: string;
  expiresIn?: number | null;
  refreshToken?: string | null;
  refreshTokenExpiresIn?: number | null;
}) {
  const encryptedToken = encryptToken(params.accessToken);
  const encryptedRefreshToken = params.refreshToken ? encryptToken(params.refreshToken) : null;
  const connectedAt = new Date();
  const accessTokenExpiresAt = params.expiresIn
    ? new Date(Date.now() + params.expiresIn * 1000)
    : null;
  const refreshTokenExpiresAt = params.refreshTokenExpiresIn
    ? new Date(Date.now() + params.refreshTokenExpiresIn * 1000)
    : null;

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
          refreshTokenEncrypted: encryptedRefreshToken,
          accessTokenExpiresAt,
          refreshTokenExpiresAt,
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
        refreshTokenEncrypted: encryptedRefreshToken,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        scope: params.scope,
        status: "CONNECTED",
        connectedAt,
      },
      update: {
        shopDomain: params.shop,
        accessTokenEncrypted: encryptedToken,
        refreshTokenEncrypted: encryptedRefreshToken,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        scope: params.scope,
        status: "CONNECTED",
        connectedAt,
        lastSyncError: null,
      },
    });
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshShopifyAccessToken(store: {
  id: string;
  shopDomain: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  accessTokenExpiresAt: Date | null;
}) {
  const now = Date.now();
  const needsRefresh =
    !store.accessTokenExpiresAt ||
    store.accessTokenExpiresAt.getTime() <= now + 5 * 60 * 1000;

  if (!needsRefresh) return decryptToken(store.accessTokenEncrypted);

  const currentAccessToken = decryptToken(store.accessTokenEncrypted);
  const refreshToken = store.refreshTokenEncrypted
    ? decryptToken(store.refreshTokenEncrypted)
    : null;

  const form = refreshToken
    ? new URLSearchParams({
        client_id: apiKey(),
        client_secret: apiSecret(),
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      })
    : new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        client_id: apiKey(),
        client_secret: apiSecret(),
        subject_token: currentAccessToken,
        subject_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
        requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
        expiring: "1",
      });

  const response = await fetch(`https://${store.shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });

  const data = await readShopifyTokenResponse(response);

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        "Shopify access token refresh failed. Reconnect Shopify and try again.",
    );
  }

  const accessTokenExpiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : null;
  const refreshTokenExpiresAt = data.refresh_token_expires_in
    ? new Date(Date.now() + data.refresh_token_expires_in * 1000)
    : null;

  await prisma.shopifyStore.update({
    where: { id: store.id },
    data: {
      accessTokenEncrypted: encryptToken(data.access_token),
      refreshTokenEncrypted: data.refresh_token
        ? encryptToken(data.refresh_token)
        : store.refreshTokenEncrypted,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    },
  });

  return data.access_token;
}


async function graphql<T>(shop: string, token: string, query: string, variables: Record<string, unknown>) {
  let lastError = "Shopify API request failed.";

  for (let attempt = 0; attempt < 5; attempt++) {
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
      errors?: unknown;
      error?: unknown;
      message?: unknown;
      extensions?: {
        cost?: {
          throttleStatus?: {
            currentlyAvailable?: number;
            restoreRate?: number;
          };
        };
      };
    };

    const normalizedErrors: Array<{
      message?: string;
      extensions?: { code?: string };
    }> = Array.isArray(payload.errors)
      ? payload.errors.map((error) => {
          if (typeof error === "string") return { message: error };
          if (error && typeof error === "object") {
            const value = error as {
              message?: unknown;
              extensions?: { code?: unknown };
            };
            return {
              message:
                typeof value.message === "string"
                  ? value.message
                  : JSON.stringify(error),
              extensions:
                typeof value.extensions?.code === "string"
                  ? { code: value.extensions.code }
                  : undefined,
            };
          }
          return { message: String(error) };
        })
      : payload.errors
        ? [
            {
              message:
                typeof payload.errors === "string"
                  ? payload.errors
                  : JSON.stringify(payload.errors),
            },
          ]
        : [];

    const fallbackApiError =
      typeof payload.error === "string"
        ? payload.error
        : typeof payload.message === "string"
          ? payload.message
          : "";

    const throttled =
      response.status === 429 ||
      normalizedErrors.some(
        (error) =>
          error.extensions?.code === "THROTTLED" ||
          /throttled/i.test(error.message || ""),
      );

    if (
      !throttled &&
      response.ok &&
      normalizedErrors.length === 0 &&
      payload.data
    ) {
      return payload.data;
    }

    lastError =
      normalizedErrors
        .map((error) => error.message)
        .filter(Boolean)
        .join("; ") ||
      fallbackApiError ||
      `Shopify API request failed (${response.status}).`;

    if (!throttled || attempt === 4) break;

    const restoreRate =
      payload.extensions?.cost?.throttleStatus?.restoreRate || 50;
    const currentlyAvailable =
      payload.extensions?.cost?.throttleStatus?.currentlyAvailable || 0;

    const adaptiveWait = Math.max(
      900,
      Math.min(5000, Math.ceil(((100 - currentlyAvailable) / restoreRate) * 1000)),
    );
    await sleep(adaptiveWait * (attempt + 1));
  }

  throw new Error(lastError);
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
  featuredImage: { url: string; altText?: string | null } | null;
  seo: { title: string | null; description: string | null };
  category: { name: string; fullName: string } | null;
  options: Array<{ name: string; values: string[] }>;
  collections: {
    nodes: Array<{ id: string; title: string; handle: string; description: string }>;
  };
  metafields: {
    nodes: Array<{ namespace: string; key: string; type: string; value: string }>;
  };
  media: {
    nodes: Array<{
      alt: string | null;
      image?: { url: string; altText?: string | null } | null;
    }>;
  };
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
        featuredImage { url altText }
        seo { title description }
        category { name fullName }
        options { name values }
        collections(first: 20) {
          nodes { id title handle description }
        }
        metafields(first: 30) {
          nodes { namespace key type value }
        }
        media(first: 8, query: "media_type:IMAGE", sortKey: POSITION) {
          nodes {
            alt
            ... on MediaImage {
              image { url altText }
            }
          }
        }
        priceRangeV2 {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
        variants(first: 60) {
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

function clip(value: string | null | undefined, max = 1400) {
  return (value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function buildShopifyProductKnowledge(product: ProductNode) {
  const collections = product.collections.nodes
    .map((item) => [item.title, item.handle ? `[${item.handle}]` : null, clip(item.description, 300) || null].filter(Boolean).join(" · "))
    .join("; ");

  const metafields = product.metafields.nodes
    .map((item) => `${item.namespace}.${item.key} (${item.type}): ${clip(item.value, 700)}`)
    .join("; ");

  const options = product.options
    .map((option) => `${option.name}: ${option.values.join(", ")}`)
    .join("; ");

  const variants = product.variants.nodes
    .map((variant) => {
      const selected = variant.selectedOptions.map((option) => `${option.name}: ${option.value}`).join(", ");
      return [
        variant.title,
        selected || null,
        variant.sku ? `SKU ${variant.sku}` : null,
        `price ${variant.price}`,
        variant.compareAtPrice ? `compare-at ${variant.compareAtPrice}` : null,
        variant.availableForSale ? "available" : "sold out",
        variant.inventoryQuantity == null ? null : `inventory ${variant.inventoryQuantity}`,
      ].filter(Boolean).join(" | ");
    })
    .join("; ");

  const images = product.media.nodes
    .map((item) => {
      const url = item.image?.url || "";
      const alt = item.image?.altText || item.alt || "";
      return [alt ? `alt: ${clip(alt, 180)}` : null, url || null].filter(Boolean).join(" | ");
    })
    .filter(Boolean)
    .join("; ");

  const price = product.priceRangeV2.minVariantPrice.amount === product.priceRangeV2.maxVariantPrice.amount
    ? `${product.priceRangeV2.minVariantPrice.currencyCode} ${product.priceRangeV2.minVariantPrice.amount}`
    : `${product.priceRangeV2.minVariantPrice.currencyCode} ${product.priceRangeV2.minVariantPrice.amount}-${product.priceRangeV2.maxVariantPrice.amount}`;

  return [
    "SOURCE: Shopify product catalogue",
    `SHOPIFY_PRODUCT_ID: ${product.id}`,
    `TITLE: ${product.title}`,
    `STATUS: ${product.status}`,
    `VENDOR: ${product.vendor || "N/A"}`,
    `PRODUCT TYPE: ${product.productType || "N/A"}`,
    `CATEGORY: ${product.category?.fullName || product.category?.name || "N/A"}`,
    `PRICE: ${price}`,
    `TAGS: ${product.tags.length ? product.tags.join(", ") : "N/A"}`,
    `COLLECTIONS: ${collections || "N/A"}`,
    `OPTIONS: ${options || "N/A"}`,
    `DESCRIPTION: ${clip(product.description, 3500) || "N/A"}`,
    `SEO TITLE: ${clip(product.seo?.title, 500) || "N/A"}`,
    `SEO DESCRIPTION: ${clip(product.seo?.description, 1000) || "N/A"}`,
    `METAFIELDS: ${metafields || "N/A"}`,
    `VARIANTS: ${variants || "N/A"}`,
    `IMAGES: ${images || product.featuredImage?.url || "N/A"}`,
    `ONLINE STORE URL: ${product.onlineStoreUrl || "N/A"}`,
  ].join("\n").slice(0, 24000);
}

function shopifyKnowledgeSource(productId: string) {
  return `shopify://product/${encodeURIComponent(productId)}`;
}

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
  const token = await refreshShopifyAccessToken(store);
  const agents = await prisma.agent.findMany({
    where: { businessId },
    select: { id: true },
  });
  const agentIds = agents.map((agent) => agent.id);
  const collectionNames = new Set<string>();
  const categoryNames = new Set<string>();
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
      const first = Math.min(5, remaining);
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

        for (const collection of product.collections.nodes) {
          if (collection.title?.trim()) collectionNames.add(collection.title.trim());
        }
        const category = product.category?.fullName || product.category?.name;
        if (category?.trim()) categoryNames.add(category.trim());

        if (agentIds.length) {
          const source = shopifyKnowledgeSource(product.id);
          await prisma.knowledgeItem.deleteMany({
            where: { agentId: { in: agentIds }, source },
          });
          await prisma.knowledgeItem.createMany({
            data: agentIds.map((agentId) => ({
              agentId,
              source,
              title: product.title,
              content: buildShopifyProductKnowledge(product),
            })),
          });
        }

        synced++;
        if (synced >= limit) break;
      }

      cursor = data.products.pageInfo.endCursor;
      await sleep(250);
      if (!data.products.pageInfo.hasNextPage) cursor = null;
    } while (cursor && synced < limit);

    if (agentIds.length) {
      const summarySource = "shopify://catalog-summary";
      await prisma.knowledgeItem.deleteMany({
        where: { agentId: { in: agentIds }, source: summarySource },
      });
      await prisma.knowledgeItem.createMany({
        data: agentIds.map((agentId) => ({
          agentId,
          source: summarySource,
          title: "Shopify catalogue summary",
          content: [
            `SYNCED PRODUCTS: ${synced}`,
            `COLLECTIONS: ${[...collectionNames].slice(0, 120).join(", ") || "N/A"}`,
            `CATEGORIES: ${[...categoryNames].slice(0, 120).join(", ") || "N/A"}`,
          ].join("\n"),
        })),
      });
    }

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


type ShopifyPricingSubscription = {
  shop: { id: string; myshopifyDomain: string };
  billingPeriod: "EVERY_30_DAYS" | "ANNUAL";
  cancelAtEndOfCycle: boolean;
  trialEndsAt: string | null;
  currentBillingCycle: { startTime: string; endTime: string } | null;
  items: Array<{ handle: string; description: string | null }>;
};

function partnerPricingConfigured() {
  return Boolean(
    process.env.SHOPIFY_PARTNER_ORG_ID?.trim() &&
      process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN?.trim() &&
      process.env.SHOPIFY_PARTNER_APP_ID?.trim(),
  );
}


export function isShopifyPartnerPricingConfigured() {
  return partnerPricingConfigured();
}

export async function testShopifyPartnerPricingConnection() {
  if (!partnerPricingConfigured()) {
    throw new Error(
      "Add SHOPIFY_PARTNER_ORG_ID, SHOPIFY_PARTNER_APP_ID and SHOPIFY_PARTNER_API_ACCESS_TOKEN first.",
    );
  }

  const orgId = process.env.SHOPIFY_PARTNER_ORG_ID!.trim();
  const appId = process.env.SHOPIFY_PARTNER_APP_ID!.trim();
  const response = await fetch(
    `https://partners.shopify.com/${orgId}/api/2026-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token":
          process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN!.trim(),
      },
      body: JSON.stringify({
        query: `query AaryvoPartnerApp($appId: ID!) {
          app(id: $appId) {
            id
            name
          }
        }`,
        variables: { appId },
      }),
      cache: "no-store",
    },
  );

  const raw = await response.text();
  let payload: {
    data?: { app?: { id?: string; name?: string } | null };
    errors?: Array<{ message?: string }>;
  } = {};

  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      `Shopify Partner API returned an invalid response (${response.status}).`,
    );
  }

  if (!response.ok || payload.errors?.length) {
    throw new Error(
      payload.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
        `Shopify Partner API request failed (${response.status}).`,
    );
  }

  const app = payload.data?.app;
  if (!app?.id) {
    throw new Error(
      "Partner API connected, but the configured SHOPIFY_PARTNER_APP_ID was not found.",
    );
  }

  return {
    ok: true,
    appId: app.id,
    appName: app.name || "AARYVO",
    orgId,
  };
}

export function shopifyPricingPageUrl(shopDomain: string, appHandle?: string | null) {
  const handle = appHandle?.trim() || process.env.SHOPIFY_APP_HANDLE?.trim();
  if (!handle) return null;
  const storeHandle = normalizeShopDomain(shopDomain).replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${storeHandle}/charges/${handle}/pricing_plans`;
}

function slugifyShopifyAppHandle(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function resolveShopifyAppHandle(
  shopDomain: string,
  token: string,
  expectedAppId: string,
  appName: string,
) {
  const configured = process.env.SHOPIFY_APP_HANDLE?.trim();
  const generated = slugifyShopifyAppHandle(appName);
  const candidates = Array.from(
    new Set(
      [configured, generated, "aaryvo-ai-shopping-assistant"]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim()),
    ),
  );

  for (const handle of candidates) {
    const response = await fetch(
      `https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({
          query: `query AaryvoAppByHandle($handle: String!) {
            appByHandle(handle: $handle) {
              id
              title
            }
          }`,
          variables: { handle },
        }),
        cache: "no-store",
      },
    );

    const payload = (await response.json()) as {
      data?: { appByHandle?: { id?: string; title?: string } | null };
      errors?: Array<{ message?: string }>;
    };

    if (!response.ok || payload.errors?.length) continue;
    if (payload.data?.appByHandle?.id === expectedAppId) return handle;
  }

  throw new Error(
    "Unable to resolve the Shopify app handle automatically. Add SHOPIFY_APP_HANDLE to the server configuration.",
  );
}

async function getShopifyBillingIds(shopDomain: string, token: string) {
  const response = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({
      query: `query AaryvoBillingIds {
        shop { id }
        app { id apiKey title }
      }`,
    }),
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    data?: {
      shop?: { id?: string };
      app?: { id?: string; apiKey?: string; title?: string };
    };
    errors?: Array<{ message?: string }>;
  };
  const shopId = payload.data?.shop?.id;
  const appId = payload.data?.app?.id;
  if (!response.ok || !shopId || !appId) {
    throw new Error(
      payload.errors?.[0]?.message ||
        "Unable to identify the connected Shopify store and app.",
    );
  }
  return {
    shopId,
    appId,
    appName: payload.data?.app?.title || "AARYVO",
    apiKey: payload.data?.app?.apiKey || "",
  };
}

export async function getShopifyHostedPricingUrl(businessId: string) {
  const store = await prisma.shopifyStore.findUnique({ where: { businessId } });
  if (!store) throw new Error("Connect a Shopify store before opening Shopify App Pricing.");

  const token = await refreshShopifyAccessToken(store);
  const billingIds = await getShopifyBillingIds(store.shopDomain, token);
  const appHandle = await resolveShopifyAppHandle(
    store.shopDomain,
    token,
    billingIds.appId,
    billingIds.appName,
  );
  const url = shopifyPricingPageUrl(store.shopDomain, appHandle);
  if (!url) throw new Error("Unable to create the Shopify App Pricing URL.");

  return {
    url,
    appHandle,
    appId: billingIds.appId,
    shopDomain: store.shopDomain,
  };
}

async function fetchShopifyPricingSubscription(appId: string, shopId: string) {
  if (!partnerPricingConfigured()) {
    throw new Error("Shopify App Pricing verification is not configured on AARYVO.");
  }

  const orgId = process.env.SHOPIFY_PARTNER_ORG_ID!.trim();
  const response = await fetch(`https://partners.shopify.com/${orgId}/api/2026-07/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN!.trim(),
    },
    body: JSON.stringify({
      query: `query AaryvoActiveSubscription($appId: ID!, $shopId: ID!) {
        activeSubscription(appId: $appId, shopId: $shopId) {
          shop { id myshopifyDomain }
          billingPeriod
          cancelAtEndOfCycle
          trialEndsAt
          currentBillingCycle { startTime endTime }
          items { handle description }
        }
      }`,
      variables: { appId, shopId },
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    data?: { activeSubscription?: ShopifyPricingSubscription | null };
    errors?: Array<{ message?: string }>;
  };
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message || "Unable to verify Shopify App Pricing subscription.");
  }
  return payload.data?.activeSubscription || null;
}

async function readShopifyPricingState(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      razorpaySubscriptionId: true,
      shopifyStore: true,
    },
  });

  if (!business?.shopifyStore) {
    return { managed: false as const, reason: "not_connected" as const };
  }

  if (business.razorpaySubscriptionId) {
    return { managed: false as const, reason: "razorpay_managed" as const };
  }

  const store = business.shopifyStore;
  const token = await refreshShopifyAccessToken(store);
  const billingIds = await getShopifyBillingIds(store.shopDomain, token);
  const subscription = await fetchShopifyPricingSubscription(
    billingIds.appId,
    billingIds.shopId,
  );

  return {
    managed: true as const,
    store,
    subscription,
  };
}

async function applyShopifyPricingState(params: {
  businessId: string;
  subscription: ShopifyPricingSubscription | null;
  expectedPlanHandle?: string | null;
}) {
  const subscription = params.subscription;

  if (!subscription) {
    await prisma.business.update({
      where: { id: params.businessId },
      data: {
        plan: "FREE",
        subscriptionStatus: "FREE",
        monthlyConversationLimit: 50,
        subscriptionCurrentStart: null,
        subscriptionCurrentEnd: null,
        subscriptionCancelAtEnd: false,
        usagePeriodStart: null,
        usagePeriodEnd: null,
      },
    });

    return {
      plan: "FREE" as const,
      handle: null,
      subscription: null,
      active: false,
      cancelAtEnd: false,
    };
  }

  const handle = subscription.items.find((item) =>
    ["starter", "growth", "pro"].includes(item.handle.toLowerCase()),
  )?.handle.toLowerCase();

  if (!handle) {
    throw new Error("The active Shopify subscription does not map to an AARYVO plan.");
  }

  if (
    params.expectedPlanHandle &&
    params.expectedPlanHandle.toLowerCase() !== handle
  ) {
    throw new Error("Shopify returned a different active plan than the selected plan.");
  }

  const plan = handle.toUpperCase() as "STARTER" | "GROWTH" | "PRO";
  const limits = { STARTER: 500, GROWTH: 2000, PRO: 5000 } as const;
  const now = new Date();
  const periodStart = subscription.currentBillingCycle?.startTime
    ? new Date(subscription.currentBillingCycle.startTime)
    : now;
  const periodEnd = subscription.currentBillingCycle?.endTime
    ? new Date(subscription.currentBillingCycle.endTime)
    : subscription.trialEndsAt
      ? new Date(subscription.trialEndsAt)
      : null;

  await prisma.business.update({
    where: { id: params.businessId },
    data: {
      plan,
      subscriptionStatus: "active",
      monthlyConversationLimit: limits[plan],
      subscriptionCurrentStart: periodStart,
      subscriptionCurrentEnd: periodEnd,
      usagePeriodStart: periodStart,
      usagePeriodEnd: periodEnd,
      subscriptionCancelAtEnd: subscription.cancelAtEndOfCycle,
    },
  });

  return {
    plan,
    handle,
    subscription,
    active: true,
    cancelAtEnd: subscription.cancelAtEndOfCycle,
  };
}

export async function cancelShopifyPricingSubscription(params: {
  businessId: string;
  deferCancellation?: boolean;
}) {
  const state = await readShopifyPricingState(params.businessId);

  if (!state.managed) {
    throw new Error("This workspace is not managed by Shopify App Pricing.");
  }

  if (!state.subscription) {
    throw new Error("No active Shopify App Pricing subscription was found.");
  }

  const store = state.store;
  const token = await refreshShopifyAccessToken(store);
  const billingIds = await getShopifyBillingIds(store.shopDomain, token);
  const orgId = process.env.SHOPIFY_PARTNER_ORG_ID!.trim();

  const response = await fetch(
    `https://partners.shopify.com/${orgId}/api/2026-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token":
          process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN!.trim(),
      },
      body: JSON.stringify({
        query: `mutation AaryvoCancelSubscription(
          $appId: ID!
          $shopId: ID!
          $deferCancellation: Boolean!
          $prorate: Boolean!
          $skipFinalUsageCharge: Boolean!
        ) {
          appSubscriptionCancel(
            appId: $appId
            shopId: $shopId
            deferCancellation: $deferCancellation
            prorate: $prorate
            skipFinalUsageCharge: $skipFinalUsageCharge
          ) {
            appSubscription {
              cancelAtEndOfCycle
              currentBillingCycle {
                startTime
                endTime
              }
              items {
                handle
                description
              }
            }
            userErrors {
              field
              message
            }
          }
        }`,
        variables: {
          appId: billingIds.appId,
          shopId: billingIds.shopId,
          deferCancellation: params.deferCancellation ?? true,
          prorate: false,
          skipFinalUsageCharge: false,
        },
      }),
      cache: "no-store",
    },
  );

  const payload = (await response.json()) as {
    data?: {
      appSubscriptionCancel?: {
        appSubscription?: ShopifyPricingSubscription | null;
        userErrors?: Array<{ field?: string[] | null; message?: string }>;
      };
    };
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok || payload.errors?.length) {
    throw new Error(
      payload.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
        "Unable to cancel Shopify App Pricing subscription.",
    );
  }

  const result = payload.data?.appSubscriptionCancel;
  if (result?.userErrors?.length) {
    throw new Error(
      result.userErrors
        .map((error) => error.message)
        .filter(Boolean)
        .join("; ") || "Shopify rejected the cancellation request.",
    );
  }

  const subscription = result?.appSubscription ?? null;

  if (subscription) {
    await applyShopifyPricingState({
      businessId: params.businessId,
      subscription,
    });
  } else {
    await syncShopifyPricingState(params.businessId);
  }

  return {
    ok: true,
    deferred: params.deferCancellation ?? true,
    subscription,
  };
}

export async function syncShopifyPricingState(businessId: string) {
  const state = await readShopifyPricingState(businessId);

  if (!state.managed) {
    return {
      managed: false as const,
      reason: state.reason,
    };
  }

  const applied = await applyShopifyPricingState({
    businessId,
    subscription: state.subscription,
  });

  return {
    managed: true as const,
    ...applied,
  };
}

export async function syncShopifyPricingSubscription(params: {
  businessId: string;
  shop: string;
  expectedPlanHandle?: string | null;
}) {
  const shop = normalizeShopDomain(params.shop);
  const store = await prisma.shopifyStore.findUnique({
    where: { businessId: params.businessId },
  });

  if (!store || store.shopDomain !== shop) {
    throw new Error("This Shopify store is not connected to the current AARYVO workspace.");
  }

  const state = await readShopifyPricingState(params.businessId);
  if (!state.managed) {
    throw new Error("This workspace is not managed by Shopify App Pricing.");
  }

  const applied = await applyShopifyPricingState({
    businessId: params.businessId,
    subscription: state.subscription,
    expectedPlanHandle: params.expectedPlanHandle,
  });

  if (!applied.active) {
    throw new Error("No active Shopify App Pricing subscription was found.");
  }

  return applied;
}
