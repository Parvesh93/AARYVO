import {
  isLikelyShopifyRefinement,
  type ShopifyCatalogOverview,
  type ShopifyCatalogProduct,
} from "@/lib/shopify-catalog";

export type CommerceMessage = { role: string; content: string };

export type CommerceState = {
  active: boolean;
  searchQuery: string;
  baseIntent: string;
  clarificationCount: number;
  requestedCount: number | null;
  flexible: boolean;
  broad: boolean;
  specificProductIntent: boolean;
};

export type CommerceUi = {
  type: "chips";
  options: Array<{ label: string; value: string }>;
};

const FLEXIBLE =
  /\b(any budget|no budget|budget flexible|no preference|anything|any color|any colour|any size|any style|any occasion|any material|any type|yes|yeah|yep|sure|ok|okay|go ahead|surprise me)\b/i;

const GREETING =
  /^(hi|hello|hey|hii|hiii|good morning|good afternoon|good evening)[!. ]*$/i;

const GENERIC_COMMERCE =
  /\b(product|products|item|items|collection|collections|buy|shop|shopping|price|cost|size|colour|color|variant|stock|available|gift|gifting|recommend|suggest|show me|looking for|need a|need an|browse|catalog|catalogue)\b/i;

const NON_COMMERCE =
  /\b(return policy|returns?|refund|shipping policy|delivery policy|privacy|terms|contact|address|location|opening hours|business hours|about us|who are you|company|support policy)\b/i;

const BROAD_COMMERCE =
  /\b(gift|gifting|something|anything|recommend|suggest|browse|explore|what.*sell|what.*product|catalog|catalogue|collection|collections|shopping)\b/i;

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/[^a-z0-9₹$€£.%\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phraseIn(text: string, phrase: string) {
  const haystack = ` ${normalize(text)} `;
  const needle = normalize(phrase);
  return Boolean(needle) && haystack.includes(` ${needle} `);
}

export function isFlexibleCommerceAnswer(message: string) {
  return FLEXIBLE.test(message);
}

export function isSimpleGreeting(message: string) {
  return GREETING.test(message.trim());
}

export function looksLikeCommerceIntent(
  message: string,
  overview: ShopifyCatalogOverview | null,
) {
  const text = message.trim();
  if (!text || GREETING.test(text) || NON_COMMERCE.test(text)) return false;
  if (GENERIC_COMMERCE.test(text)) return true;

  if (overview?.productTypes.some((type) => phraseIn(text, type))) return true;

  // Short noun-like queries such as "rings", "serum" or "office chair"
  // are safe to probe against the synced catalogue. A failed probe simply
  // falls back to the normal website conversation engine.
  const words = normalize(text).split(" ").filter(Boolean);
  return words.length > 0 && words.length <= 4;
}

export function hasSpecificCommerceProductIntent(
  message: string,
  overview: ShopifyCatalogOverview | null,
) {
  const text = normalize(message);
  if (!text) return false;

  if (
    overview?.productTypes.some(
      (type) => phraseIn(text, type) || phraseIn(type, text),
    )
  ) {
    return true;
  }

  // A concrete noun request such as "rings", "serum", "black top" or
  // "running shoes" should be treated as product-specific. Broad shopping
  // language such as gifts/recommendations should be clarified first.
  const broadOnly =
    BROAD_COMMERCE.test(message) &&
    !/\b(ring|rings|earring|earrings|necklace|necklaces|bangle|bangles|bracelet|bracelets|top|tops|shirt|shirts|dress|dresses|pants|trousers|skincare|serum|cleanser|cream|moisturizer|moisturiser|shoe|shoes|bag|bags)\b/i.test(
      message,
    );

  return !broadOnly && normalize(message).split(" ").filter(Boolean).length <= 5;
}

export function shouldClarifyCommerceBeforeProducts(state: CommerceState) {
  if (state.flexible || state.requestedCount) return false;
  if (state.specificProductIntent) return false;
  return state.broad && state.clarificationCount < 3;
}

function isBaseCommerceMessage(
  message: string,
  overview: ShopifyCatalogOverview | null,
) {
  return (
    !isFlexibleCommerceAnswer(message) &&
    !isLikelyShopifyRefinement(message) &&
    looksLikeCommerceIntent(message, overview)
  );
}

function requestedProductCount(message: string) {
  const match = message.match(
    /\b(?:recommend|show|give|suggest)?\s*(?:me\s*)?(\d{1,2})\b/i,
  );
  if (!match?.[1]) return null;
  return Math.max(1, Math.min(10, Number(match[1])));
}

export function deriveCommerceState(params: {
  messages: CommerceMessage[];
  currentMessage: string;
  overview: ShopifyCatalogOverview | null;
  priorCommerceActive?: boolean;
}): CommerceState {
  const { messages, currentMessage, overview } = params;
  const currentFlexible = isFlexibleCommerceAnswer(currentMessage);
  const currentRefinement = isLikelyShopifyRefinement(currentMessage);
  const currentWords = normalize(currentMessage).split(" ").filter(Boolean);
  const continuingCommerce =
    Boolean(params.priorCommerceActive) &&
    !NON_COMMERCE.test(currentMessage) &&
    !GREETING.test(currentMessage.trim()) &&
    currentWords.length > 0 &&
    currentWords.length <= 10;

  let baseIndex = -1;
  const searchFrom = continuingCommerce ? messages.length - 2 : messages.length - 1;

  for (let index = searchFrom; index >= 0; index--) {
    const item = messages[index];
    if (item.role === "assistant") continue;
    if (isBaseCommerceMessage(item.content, overview)) {
      baseIndex = index;
      break;
    }
  }

  if (baseIndex < 0 && !continuingCommerce) {
    for (let index = messages.length - 1; index >= 0; index--) {
      const item = messages[index];
      if (item.role === "assistant") continue;
      if (isBaseCommerceMessage(item.content, overview)) {
        baseIndex = index;
        break;
      }
    }
  }

  const active =
    looksLikeCommerceIntent(currentMessage, overview) ||
    continuingCommerce ||
    ((currentFlexible || currentRefinement) && baseIndex >= 0);

  if (!active) {
    return {
      active: false,
      searchQuery: currentMessage,
      baseIntent: "",
      clarificationCount: 0,
      requestedCount: null,
      flexible: false,
      broad: false,
      specificProductIntent: false,
    };
  }

  const baseIntent =
    baseIndex >= 0 ? messages[baseIndex].content : currentMessage;

  const userParts = (baseIndex >= 0 ? messages.slice(baseIndex) : messages.slice(-1))
    .filter((item) => item.role !== "assistant")
    .map((item) => item.content.trim())
    .filter(Boolean)
    .filter((item) => !isFlexibleCommerceAnswer(item));

  const searchQuery = [...new Set(userParts)].join(" ").trim() || baseIntent;

  const clarificationCount =
    baseIndex >= 0
      ? messages
          .slice(baseIndex)
          .filter(
            (item) =>
              item.role === "assistant" &&
              item.content.includes("?"),
          ).length
      : 0;

  return {
    active: true,
    searchQuery,
    baseIntent,
    clarificationCount,
    requestedCount: requestedProductCount(currentMessage),
    flexible: currentFlexible,
    broad: BROAD_COMMERCE.test(baseIntent) || BROAD_COMMERCE.test(currentMessage),
    specificProductIntent:
      hasSpecificCommerceProductIntent(baseIntent, overview) ||
      hasSpecificCommerceProductIntent(currentMessage, overview),
  };
}

function currencySymbol(code: string | null | undefined) {
  return (
    {
      INR: "₹",
      USD: "$",
      EUR: "€",
      GBP: "£",
      AUD: "A$",
      CAD: "C$",
    }[code || ""] || code || ""
  );
}

function categoryChips(overview: ShopifyCatalogOverview | null): CommerceUi | null {
  const options = (overview?.productTypes || [])
    .filter(Boolean)
    .slice(0, 6)
    .map((type) => ({ label: type, value: `Show me ${type}` }));
  return options.length ? { type: "chips", options } : null;
}

function budgetChips(overview: ShopifyCatalogOverview | null): CommerceUi {
  const symbol = currencySymbol(overview?.currencyCode);
  const max = overview?.maxPrice || 0;
  const raw =
    max > 6000
      ? [1000, 3000, 6000]
      : max > 3000
        ? [750, 1500, 3000]
        : [500, 1000, 2000];

  return {
    type: "chips",
    options: [
      ...raw.map((value) => ({
        label: `Under ${symbol}${value.toLocaleString()}`,
        value: `Under ${symbol}${value}`,
      })),
      { label: "Any budget", value: "Any budget" },
    ].slice(0, 4),
  };
}

function styleChips(): CommerceUi {
  return {
    type: "chips",
    options: [
      { label: "Minimal", value: "Minimal" },
      { label: "Classic", value: "Classic" },
      { label: "Statement", value: "Statement" },
      { label: "Any style", value: "Any style" },
    ],
  };
}

function occasionChips(): CommerceUi {
  return {
    type: "chips",
    options: [
      { label: "Everyday", value: "Everyday" },
      { label: "Gifting", value: "Gifting" },
      { label: "Occasion", value: "For an occasion" },
      { label: "Any occasion", value: "Any occasion" },
    ],
  };
}

export function buildCommerceClarification(params: {
  state: CommerceState;
  overview: ShopifyCatalogOverview | null;
}) {
  const { state, overview } = params;
  const query = normalize(state.searchQuery);

  if (state.broad && state.clarificationCount === 0) {
    return {
      reply:
        "Sure — what kind of gift or product would you like me to focus on? Pick a category, or tell me who it’s for and I’ll narrow it down.",
      ui: categoryChips(overview),
    };
  }

  if (
    !/\b(under|below|budget|price|₹|\$|€|£|\d{3,})\b/i.test(
      state.searchQuery,
    )
  ) {
    return {
      reply:
        "What budget range should I keep in mind? You can also choose any budget and I’ll show the strongest matches.",
      ui: budgetChips(overview),
    };
  }

  if (
    !/\b(minimal|simple|classic|modern|statement|premium|luxury|casual|formal)\b/i.test(
      query,
    )
  ) {
    return {
      reply:
        "Any style preference? If not, choose any style and I’ll pick the best options available.",
      ui: styleChips(),
    };
  }

  return {
    reply:
      "Is this mainly for everyday use, gifting, or a particular occasion? You can also leave it open.",
    ui: occasionChips(),
  };
}

function extractRefinementValues(products: ShopifyCatalogProduct[], query: string) {
  const seen = new Set<string>();
  const options: Array<{ label: string; value: string }> = [];
  const normalizedQuery = normalize(query);

  for (const product of products) {
    for (const variant of product.variants) {
      const summary = variant.optionSummary || "";
      for (const part of summary.split(/[·|,]/)) {
        const value = part.includes(":")
          ? part.split(":").slice(1).join(":").trim()
          : part.trim();
        if (!value || value.length < 2 || value.length > 24) continue;
        const key = normalize(value);
        if (!key || normalizedQuery.includes(key) || seen.has(key)) continue;
        seen.add(key);
        options.push({ label: value, value });
        if (options.length >= 4) return options;
      }
    }
  }

  for (const product of products) {
    for (const raw of (product.tags || "").split(",")) {
      const value = raw.trim();
      if (!value || value.length < 2 || value.length > 24) continue;
      const key = normalize(value);
      if (!key || normalizedQuery.includes(key) || seen.has(key)) continue;
      if (/^(new|sale|featured|shopify)$/i.test(value)) continue;
      seen.add(key);
      options.push({ label: value, value });
      if (options.length >= 4) return options;
    }
  }

  return options;
}

export function buildCommerceRefinementUi(
  products: ShopifyCatalogProduct[],
  query: string,
): CommerceUi | null {
  const typeCounts = new Map<string, number>();
  for (const product of products) {
    const type = product.productType?.trim();
    if (!type) continue;
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }

  const types = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => type);

  if (types.length >= 3) {
    return {
      type: "chips",
      options: types.slice(0, 5).map((type) => ({
        label: type,
        value: `Show me ${type}`,
      })),
    };
  }

  const options = extractRefinementValues(products, query).filter(
    (option) =>
      !/^(default title|default|one size|one-size)$/i.test(option.label.trim()),
  );
  if (!options.length) return null;
  return { type: "chips", options };
}

export function buildCommerceProductReply(params: {
  products: ShopifyCatalogProduct[];
  alternative: boolean;
  requestedCount: number | null;
}) {
  const count = Math.min(
    params.requestedCount || 8,
    params.products.length,
  );

  const first = params.products[0]?.title;
  const second = params.products[1]?.title;
  const startingPoint =
    first && second
      ? `I’d start with **${first}** and **${second}** based on what you told me.`
      : first
        ? `**${first}** is the strongest match I found.`
        : "";

  if (params.alternative) {
    return `I couldn’t find that exact combination, but I found ${count} close alternatives that are available now. ${startingPoint} I’ve shown the best alternatives below.`.trim();
  }

  return `I found ${count} good matches in the live catalogue. ${startingPoint} You can open any product below, or refine the selection further.`.trim();
}

export function desiredCommerceProductCount(state: CommerceState) {
  return state.requestedCount || 8;
}
