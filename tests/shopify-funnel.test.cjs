const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");

function loadTs(file, dependencies = {}) {
  const filename = path.join(__dirname, "..", file);
  const transpiled = ts.transpileModule(fs.readFileSync(filename,"utf8"),{
    fileName:filename,
    compilerOptions:{
      target:ts.ScriptTarget.ES2022,
      module:ts.ModuleKind.CommonJS,
      esModuleInterop:true,
    },
    reportDiagnostics:true,
  });
  const errors=(transpiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")).join("\n"));
  const mod={exports:{}};
  vm.runInThisContext("(function(require,module,exports){" + transpiled.outputText + "\n})",{
    filename,
  })(name=>{
    if(name==="node:crypto")return crypto;
    if(name in dependencies)return dependencies[name];
    throw new Error("Unrecognized dependency: "+name);
  },mod,mod.exports);
  return mod.exports;
}

const secret="ci-private-signed-engagement-secret-of-adequate-length";
const previousSecret=process.env.AARYVO_BRIDGE_SECRET;
process.env.AARYVO_BRIDGE_SECRET=secret;
const signed=loadTs("lib/shopify-attribution.ts");
process.env.AARYVO_BRIDGE_SECRET=previousSecret;

const validParams={
  shop:"example.myshopify.com",
  conversationId:"cmiabcdefghijklmnopqrst",
  productId:"gid://shopify/Product/123456789",
};
function makeSigned(){
  const previous=process.env.AARYVO_BRIDGE_SECRET;
  process.env.AARYVO_BRIDGE_SECRET=secret;
  try{return signed.createShopifyRecommendationMarker(validParams)}
  finally{
    if(previous===undefined)delete process.env.AARYVO_BRIDGE_SECRET;
    else process.env.AARYVO_BRIDGE_SECRET=previous;
  }
}
function verify(token,now){
  const previous=process.env.AARYVO_BRIDGE_SECRET;
  process.env.AARYVO_BRIDGE_SECRET=secret;
  try{return signed.verifyShopifyRecommendationMarker(token,now)}
  finally{
    if(previous===undefined)delete process.env.AARYVO_BRIDGE_SECRET;
    else process.env.AARYVO_BRIDGE_SECRET=previous;
  }
}
test("signed Shopify product recommendation is accepted with correct shop, conversation and product",()=>{
  const token=makeSigned();
  const proof=verify(token);
  assert.ok(proof);
  assert.equal(proof.shop,validParams.shop);
  assert.equal(proof.conversationId,validParams.conversationId);
  assert.equal(proof.productId,validParams.productId);
});
test("tampering with product, signature or shop invalidates engagement proof",()=>{
  const token=makeSigned();
  const [payload,signature]=token.split(".");
  const decoded=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
  for(const patch of [{p:"gid://shopify/Product/456"},{s:"different.myshopify.com"},{c:"cmiwrongconversation1234"}]){
    const tampered=Buffer.from(JSON.stringify({...decoded,...patch})).toString("base64url")+"."+signature;
    assert.equal(verify(tampered),null);
  }
  assert.equal(verify(token+"x"),null);
  assert.equal(verify("invalid"),null);
});
test("expired and future issued recommendations never count as current engagement",()=>{
  const token=makeSigned();
  const proof=verify(token);
  assert.ok(proof);
  assert.equal(verify(token,proof.issuedAt+8*24*60*60*1000),null);
  assert.equal(verify(token,proof.issuedAt-6*60*1000),null);
});
test("funnel backend deduplicates signed product-stage events and counts distinct conversations",async()=>{
  const calls=[];
  const prisma={
    $executeRawUnsafe:async(sql,...args)=>{calls.push({sql,args});return 1},
    $queryRawUnsafe:async(sql,...args)=>{
      calls.push({sql,args});
      if(sql.includes("COUNT(DISTINCT conversationId)"))
        return [
          {eventType:"RECOMMENDATION_VIEW",total:8n,sessions:4n},
          {eventType:"PRODUCT_CLICK",total:3n,sessions:2n},
          {eventType:"ADD_TO_CART",total:1n,sessions:1n},
        ];
      if(sql.includes("DATE_FORMAT"))return [];
      if(sql.includes("GROUP BY shopifyProductId"))
        return [{shopifyProductId:validParams.productId,clicks:3n,carts:1n,views:8n}];
      throw new Error("Unexpected SQL select");
    },
    shopifyProduct:{
      findMany:async({where})=>{
        assert.equal(where.storeId,"store-1");
        return [{shopifyProductId:validParams.productId,title:"Scarlett Frill"}];
      },
    },
  };
  const funnel=loadTs("lib/shopify-funnel.ts",{"@/lib/prisma":{prisma}});
  const token=makeSigned();
  await funnel.recordShopifyFunnelEvent({
    businessId:"business-1",agentId:"agent-1",
    conversationId:validParams.conversationId,
    shopifyProductId:validParams.productId,
    eventType:"PRODUCT_CLICK",signedToken:token,
  });
  assert.ok(calls.some(call=>call.sql.startsWith("CREATE TABLE IF NOT EXISTS")));
  const inserted=calls.find(call=>call.sql.includes("INSERT INTO shopify_funnel_event"));
  assert.ok(inserted);
  assert.equal(inserted.args[1],"business-1");
  assert.equal(inserted.args[6],crypto.createHash("sha256").update(token).digest("hex"));
  assert.equal(inserted.args.some(v=>v===token),false);
  assert.ok(inserted.sql.includes("ON DUPLICATE KEY UPDATE"));
  const result=await funnel.readShopifyFunnelSummary("business-1","store-1");
  assert.equal(result.recommendations.events,8);
  assert.equal(result.recommendations.conversations,4);
  assert.equal(result.clicks.events,3);
  assert.equal(result.clicks.conversations,2);
  assert.equal(result.carts.events,1);
  assert.equal(result.clickThroughRate,50);
  assert.equal(result.addToCartRate,50);
  assert.equal(result.trend.length,30);
  assert.equal(result.topProducts[0].title,"Scarlett Frill");
  const selectCalls=calls.filter(call=>call.sql.startsWith("SELECT"));
  assert.ok(selectCalls.every(call=>call.args[0]==="business-1"));
});
