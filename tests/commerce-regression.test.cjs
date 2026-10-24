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


test("gifting for her remains a broad inventory search after recipient clarification", async () => {
  const state = derive([
    user("I'm looking for an outfit for gifting"),
    assistant("Who are you shopping for?"),
    user("It's for a female"),
  ]);
  assert.equal(state.active, true);
  assert.equal(state.intent.recipient, "female");
  assert.equal(state.intent.occasion, "gifting");
  assert.equal(commerce.shouldClarifyCommerceBeforeProducts(state), false);
  const query = commerce.buildCommerceRecommendationQuery(state);
  assert.equal(query, "products available");
  const products = await catalog.searchShopifyCatalog("test-business", query);
  assert.ok(products.length >= 3, "Available Shopify products are discovered");
  assert.ok(products.some(p => p.id === "dress"), "A dress without a gifting tag can be surfaced");
});

test("gifting with a budget honors the price ceiling without requiring gift tags", async () => {
  const state = derive([
    user("Suggest something for gifting under ₹5,000"),
    assistant("Who are you shopping for?"),
    user("It's for a female"),
  ]);
  const query = commerce.buildCommerceRecommendationQuery(state);
  assert.equal(state.intent.budgetMax, 5000);
  assert.doesNotMatch(query, /gift|gifting|female/i);
  const results = await catalog.searchShopifyCatalog("test-business", query);
  assert.ok(results.length > 0);
  assert.ok(results.every(item => item.minPrice <= 5000));
  assert.ok(results.every(item => item.id !== "gown"), "Above-budget gown is excluded");
});

test("Shopify widget booking CTA requires an explicit server action", () => {
  const widget = fs.readFileSync(path.join(__dirname, "..", "public/widget.js"), "utf8");
  assert.match(widget, /const canBook=Boolean\(inChat&&config\.bookingEnabled&&next\?\.booking===true\)/);
  assert.match(widget, /setActions\(d\.actions\|\|\{booking:false,whatsapp:false\}\)/);
});

const knowledge = loadTs("lib/widget-knowledge.ts", {});

test("manual return policy answers a shopper even when old site pages fill the context", () => {
  const items = [
    {title:"Old website page",source:"https://example.com/about",
     content:"Archived general information ".repeat(1600),createdAt:new Date("2026-01-01")},
    {title:"Returns & Refund Policy",source:"manual:shopify-admin:entry1",
     content:"We accept returns within 7 days for unused items with tags.",
     createdAt:new Date("2026-10-24")},
    {title:"Old other page",source:"https://example.com/other",
     content:"Unrelated old page ".repeat(900),createdAt:new Date("2026-02-01")},
  ];
  const ordered=knowledge.rankWidgetKnowledge(items,"Do you provide returns?");
  assert.equal(ordered[0].title,"Returns & Refund Policy");
  const item=knowledge.matchingManualPolicy(items,"Do you provide returns?");
  assert.equal(item.source,"manual:shopify-admin:entry1");
  assert.match(knowledge.verifiedManualPolicyReply(item),/accept returns within 7 days/i);
});
test("manual negative policy is never turned into a claim that returns are offered",()=>{
  const item={title:"Return Policy",source:"manual:shopify-admin:no-returns",
    content:"We do not accept returns or exchanges.",createdAt:new Date()};
  assert.match(knowledge.verifiedManualPolicyReply(item),/do not accept returns/i);
  assert.equal(knowledge.matchingManualPolicy([item],"Can I return a purchase?"),item);
});
test("unverified Shopify product knowledge cannot become a manual return-policy answer",()=>{
  const item={title:"Return Policy",source:"shopify://product/123",
    content:"Returns available",createdAt:new Date()};
  assert.equal(knowledge.matchingManualPolicy([item],"Do you provide returns?"),null);
  assert.equal(knowledge.rankWidgetKnowledge([item],"Do you provide returns?").length,0);
});
test("policy clarification does not invent an unrelated policy",()=>{
  const items=[{title:"Shipping Policy",source:"manual:123",
    content:"Dispatch within 48 hours",createdAt:new Date()}];
  assert.equal(knowledge.matchingManualPolicy(items,"Do you provide returns?"),null);
  assert.equal(knowledge.matchingManualPolicy(items,"When do you ship?"),items[0]);
});
test("chat route checks for verified manual policy before generic AI fallback",()=>{
  const source=fs.readFileSync(path.join(__dirname,"..","app/api/widget/chat/route.ts"),"utf8");
  assert.match(source,/matchingManualPolicy\(websiteKnowledgeItems, message\)/);
  assert.match(source,/if \(directPolicyReply\) \{/);
});
test("Shopify knowledge CRUD selects the storefront's active assistant",()=>{
  const bridge=fs.readFileSync(path.join(__dirname,"..","app/api/internal/shopify-bridge/merchant/route.ts"),"utf8");
  const start=bridge.indexOf('if (resource === "knowledge")');
  const end=bridge.indexOf('if (resource === "appointments")',start);
  const source=bridge.slice(start,end);
  assert.match(source,/where: \{ businessId, isActive: true \}/);
  assert.match(source,/activeKnowledgeAgent\.id/);
  assert.doesNotMatch(source,/agent\.id/);
});
