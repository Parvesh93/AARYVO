// Regression checks execute production TypeScript with a stubbed Prisma catalog.
// No Shopify credentials, database, or OpenAI requests are required.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadTs(filename, mocks) {
  const source = fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  const diagnostics = (output.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  assert.equal(diagnostics.length, 0,
    diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n"));
  const module = { exports: {} };
  vm.runInNewContext(
    "(function (require, module, exports) {\n" + output.outputText + "\n})",
    { console, URL, process, Buffer, setTimeout, clearTimeout },
    { filename },
  )((name) => {
    assert.ok(Object.hasOwn(mocks, name), "Unexpected dependency: " + name);
    return mocks[name];
  }, module, module.exports);
  return module.exports;
}

function product(id, title, type, price, tags, description) {
  return {
    id, shopifyProductId: id, title, productType: type, minPrice: price, maxPrice: price,
    handle: id, description: description || title, vendor: "Test",
    tags: tags || "", status: "ACTIVE", currencyCode: "INR",
    featuredImageUrl: null, onlineStoreUrl: null,
    syncedAt: new Date(),
    variants: [{
      id: id + "-v", shopifyVariantId: id + "-v", title: "Default Title",
      price, compareAtPrice: null, availableForSale: true,
      inventoryQuantity: 3, optionSummary: null,
    }],
  };
}
const catalogRows = [
  product("dress", "Floral Printed Dress", "Dresses", 4500, "floral,dress", "A floral party dress"),
  product("top", "Floral Sweetheart Top", "Tops", 4500, "floral,top", "A floral printed top"),
  product("swim", "Brown Marble Printed Manokini", "Swimwear", 3400, "swim", "Swimsuit"),
  product("gown", "One Shoulder Ruffled Gown", "Gowns", 7699, "evening", "Formal floor length gown"),
  product("other", "Plain Black Dress", "Dresses", 3900, "dress", "A plain dress"),
];
const prisma = {
  shopifyStore: {
    findUnique: async () => ({
      id: "test-store", shopDomain: "example.myshopify.com",
      status: "CONNECTED", business: { websiteUrl: "https://example.myshopify.com" },
    }),
  },
  shopifyProduct: { findMany: async () => catalogRows },
  knowledgeItem: { findMany: async () => [] },
};
const catalog = loadTs("lib/shopify-catalog.ts", { "@/lib/prisma": { prisma } });
const commerce = loadTs("lib/commerce-assistant.ts", {
  "@/lib/shopify-catalog": { isLikelyShopifyRefinement: catalog.isLikelyShopifyRefinement },
});
const overview = {
  shopDomain: "example.myshopify.com", productCount: catalogRows.length,
  productTypes: ["Tops", "Dresses", "Gowns", "Swimwear"],
  vendors: ["Test"], currencyCode: "INR", minPrice: 3400, maxPrice: 7699,
};
const user = (content) => ({ role: "user", content });
const assistant = (content) => ({ role: "assistant", content });
const derive = (messages) => commerce.deriveCommerceState({
  messages, currentMessage: messages.at(-1).content, overview, priorCommerceActive: true,
});

test("floral dresses under ₹5000 match only genuine floral dresses", async () => {
  const state = derive([user("Show me floral dresses under ₹5,000.")]);
  const query = commerce.buildCommerceRecommendationQuery(state);
  assert.match(query, /floral/i);
  assert.match(query, /dresses/i);
  assert.equal(state.intent.budgetMax, 5000);
  const results = await catalog.searchShopifyCatalog("test-business", query);
  assert.deepEqual(Array.from(results, (p) => p.id), ["dress"]);
});

test("switching to gowns clears previous floral category and budget", async () => {
  const state = derive([
    user("Show me floral dresses under ₹5,000."),
    assistant("Here are your results."),
    user("Do you have any gowns available?"),
  ]);
  const query = commerce.buildCommerceRecommendationQuery(state);
  assert.equal(state.intent.budgetMax, null);
  assert.match(query, /gowns/i);
  assert.doesNotMatch(query, /floral|5000/i);
  const results = await catalog.searchShopifyCatalog("test-business", query);
  assert.deepEqual(Array.from(results, (p) => p.id), ["gown"]);
});

test("exact gown budget with no matching stock has no unrelated alternatives", async () => {
  const results = await catalog.searchShopifyCatalog("test-business", "gowns under 5000");
  assert.equal(results.length, 0);
});

test("wedding context survives recipient clarification without stale budget", () => {
  const state = derive([
    user("Show me floral dresses under ₹5,000."),
    assistant("I found a dress."),
    user("Do you have any gowns available?"),
    assistant("Here are the gowns."),
    user("Can you recommend something for a wedding?"),
    assistant("Who are you shopping for?"),
    user("It's for a female"),
  ]);
  assert.match(state.baseIntent, /wedding/i);
  assert.equal(state.intent.occasion, "wedding");
  assert.equal(state.intent.recipient, "female");
  assert.equal(state.intent.budgetMax, null);
  assert.equal(commerce.shouldClarifyCommerceBeforeProducts(state), false);
});

test("short refinements keep their category and an explicit new budget", () => {
  const state = derive([
    user("Do you have gowns?"),
    assistant("Here are the options."),
    user("Under ₹9,000"),
  ]);
  assert.match(commerce.buildCommerceRecommendationQuery(state), /gowns/i);
  assert.equal(state.intent.budgetMax, 9000);
});

test("any budget explicitly removes the previous price ceiling", () => {
  const state = derive([
    user("Show me gowns under ₹5,000."),
    assistant("Want to widen your budget?"),
    user("Any budget"),
  ]);
  assert.equal(state.intent.budgetMax, null);
  assert.match(commerce.buildCommerceRecommendationQuery(state), /gowns/i);
});
