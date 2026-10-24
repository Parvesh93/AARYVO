// Exercise the real Shopify merchant bridge POST path with signed requests.
// Uses mock Prisma so no production Shopify credentials or database is needed.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const crypto=require("node:crypto");
const ts=require("typescript");

const appClientId="68cb452f44c0123456789abcdef01234";
const shop="merchant-test.myshopify.com";
const secret="secure-knowledge-bridge-test-secret-abcdef1234";
const operations=[];
const sqlCalls=[];
let manualCount=0;
let writeError=null;
let selectedKnowledge={id:"manual-id",source:"manual:shopify-admin:manual-id"};

const prisma={
  shopifyMerchantLink:{findUnique:async()=>({businessId:"biz"})},
  shopifyStore:{findUnique:async()=>({id:"store",businessId:"biz",status:"CONNECTED"})},
  business:{findUnique:async()=>({
    id:"biz", name:"Test Store",plan:"FREE",subscriptionStatus:"ACTIVE",
    billingChannel:"SHOPIFY",monthlyConversationLimit:50,
  })},
  agent:{findFirst:async()=>({id:"agent-1",businessId:"biz"})},
  $queryRawUnsafe:async (sql,...params)=>{
    sqlCalls.push({sql,params});
    if(sql.includes("COUNT(*)"))return [{total:BigInt(manualCount)}];
    if(sql.includes("SELECT `id`"))return [{id:"manual-id"}];
    throw Error("Unexpected SQL query");
  },
  knowledgeItem:{
    count:async args=>{
      if(JSON.stringify(args).includes("startsWith"))
        throw Object.assign(new Error("Illegal mix of collations"),{code:"P2039"});
      return 1;
    },
    findFirst:async()=>selectedKnowledge,
    findMany:async()=>[{
      id:"manual-id",source:"manual:shopify-admin:manual-id",
      title:"Shipping",content:"Delivery in 7 days",createdAt:new Date(),
    }],
    deleteMany:async args=>{operations.push({delete:args});return {count:1};},
    updateMany:async args=>{operations.push({update:args});return {count:1};},
    create:async args=>{
      if(writeError)throw writeError;
      operations.push(args);
      return args.data;
    }
  },
};
const filepath=path.join(__dirname,"..","app/api/internal/shopify-bridge/merchant/route.ts");
const compiled=ts.transpileModule(fs.readFileSync(filepath,"utf8"),{
  fileName:filepath,
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},
  reportDiagnostics:true,
});
assert.equal((compiled.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const moduleObj={exports:{}};
const imports={
  "node:crypto":crypto,
  "next/server":{NextResponse:{json:(data,options)=>({status:options?.status||200,body:data})}},
  "@/lib/prisma":{prisma},
  "@/lib/plan-entitlements":{entitlementsForPlan:()=>({}),hasFeature:()=>true},
  "@/lib/shopify-funnel":{readShopifyFunnelSummary:async()=>({}),countShopifyPaidClickConversions:async()=>0},
  "@/lib/billing":{businessUsagePeriod:()=>({start:new Date("2026-10-01"),end:new Date("2026-11-01")})},
  "@/lib/shopify-merchant-list":{
    listQuery:data=>({page:data.page||0,pageSize:25,search:typeof data.search==="string"?data.search:""}),
    searchPage:(items,total,query,extra)=>({items,total,...query,...extra}),
  },
};
const wrapper=vm.runInNewContext(
  "(function(require,module,exports){"+compiled.outputText+"\n})",
  {console,process:{env:{AARYVO_BRIDGE_SECRET:secret,AARYVO_BRIDGE_ALLOWED_CLIENT_IDS:appClientId}},
    Buffer,Date,setTimeout,clearTimeout},
  {filename:filepath});
wrapper(name=>{assert.ok(imports[name],"Unexpected dependency "+name);return imports[name]},
  moduleObj,moduleObj.exports);
const api=moduleObj.exports;

async function call(data,operation="create"){
  const body={shop,appClientId,resource:"knowledge",operation,data};
  const timestamp=String(Date.now()),nonce=crypto.randomUUID();
  const digest=crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
  const canonical=[timestamp,nonce,shop,appClientId,"knowledge",operation,digest,
    "POST","/api/internal/shopify-bridge/merchant"].join("\n");
  const signature=crypto.createHmac("sha256",secret).update(canonical).digest("hex");
  return api.POST({
    headers:new Headers({
      "content-type":"application/json",
      "x-aaryvo-bridge-timestamp":timestamp,
      "x-aaryvo-bridge-nonce":nonce,
      "x-aaryvo-bridge-signature":signature,
    }),
    text:async()=>JSON.stringify(body),
  });
}

test("Shopify merchant creates only a manual scoped knowledge entry",async()=>{
  operations.length=0;manualCount=0;writeError=null;
  const result=await call({title:"Shipping policy",content:"Delivery within seven working days."});
  assert.equal(result.status,200);
  assert.equal(result.body.ok,true);
  assert.equal(operations.length,1);
  const d=operations[0].data;
  assert.equal(d.agentId,"agent-1");
  assert.match(d.id,/^[a-f0-9-]{36}$/);
  assert.equal(d.source,"manual:shopify-admin:"+d.id);
  assert.equal(d.title,"Shipping policy");
});
test("Maximum manual knowledge cap does not write a new row",async()=>{
  operations.length=0;manualCount=100;writeError=null;
  const result=await call({title:"Shipping policy",content:"Delivery in seven days."});
  assert.equal(result.status,400);
  assert.match(result.body.message,/Maximum 100/);
  assert.equal(operations.length,0);
});
test("Invalid manual knowledge content does not write a row",async()=>{
  operations.length=0;manualCount=0;writeError=null;
  const result=await call({title:"",content:"something"});
  assert.equal(result.status,400);
  assert.equal(operations.length,0);
});
test("A database error returns safe diagnostic code without leaking SQL",async()=>{
  operations.length=0;manualCount=0;
  writeError=Object.assign(new Error("sensitive mysql host details"),{code:"P2022"});
  const original=console.error;console.error=()=>{};
  try{
    const result=await call({title:"Store policy",content:"Approved content"});
    assert.equal(result.status,500);
    assert.equal(result.body.code,"KNOWLEDGE_WRITE_FAILED");
    assert.match(result.body.message,/database migrations/);
    assert.doesNotMatch(result.body.message,/mysql host|sensitive/);
  }finally{console.error=original;writeError=null}
});

test("manual knowledge cap query does not use LIKE and binds shop agent",async()=>{
  sqlCalls.length=0;manualCount=0;writeError=null;
  const result=await call({title:"Delivery",content:"Within seven days"});
  assert.equal(result.status,200);
  assert.ok(sqlCalls.some(item=>item.sql.includes("CAST(`source` AS BINARY)")));
  assert.ok(sqlCalls.every(item=>!item.sql.includes("LIKE")));
  assert.ok(sqlCalls.every(item=>item.params[0]==="agent-1"));
});
test("manual source filtering avoids mixed-collation LIKE with accurate pagination",async()=>{
  sqlCalls.length=0;manualCount=1;writeError=null;
  const result=await call({page:0,source:"manual",search:"Ship"},"read");
  assert.equal(result.status,200);
  assert.equal(result.body.data.total,1);
  assert.equal(result.body.data.items.length,1);
  assert.equal(result.body.data.items[0].editable,true);
  assert.ok(sqlCalls.some(item=>item.sql.includes("LOCATE(")));
  assert.ok(sqlCalls.every(item=>!item.sql.includes("LIKE")));
  assert.ok(sqlCalls.some(item=>item.params.includes("Ship")));
});
test("saving and deleting knowledge cannot modify Shopify-synced records",async()=>{
  operations.length=0;selectedKnowledge={id:"synced",source:"shopify://product/123"};
  let result=await call({id:"synced",title:"Changed",content:"Changed"},"save");
  assert.equal(result.status,404);
  result=await call({id:"synced"},"delete");
  assert.equal(result.status,404);
  assert.equal(operations.length,0);
  selectedKnowledge={id:"manual-id",source:"manual:shopify-admin:manual-id"};
  result=await call({id:"manual-id",title:"Changed",content:"New content"},"save");
  assert.equal(result.status,200);
  assert.equal(operations[0].update.where.source,"manual:shopify-admin:manual-id");
});
