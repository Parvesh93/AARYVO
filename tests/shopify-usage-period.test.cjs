// Billing-cycle calculation and merchant usage contract regression tests.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const vm=require("node:vm");

function load(file,imports={}) {
  const filename=path.join(__dirname,"..",file);
  const source=fs.readFileSync(filename,"utf8");
  const js=ts.transpileModule(source,{
    fileName:filename,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
    reportDiagnostics:true,
  });
  assert.equal((js.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
  const mod={exports:{}};
  const wrapper=vm.runInNewContext("(function(require,module,exports){"+js.outputText+"\n})",
    {Date,Buffer,console,process:{env:{}}},{filename});
  wrapper((name)=>{
    if(name in imports)return imports[name];
    throw Error("Unexpected import: "+name);
  },mod,mod.exports);
  return mod.exports;
}
const pricing=load("lib/shopify-usage-period.ts");
const bill=load("lib/billing.ts",{
  "crypto":require("node:crypto"),
  "@/lib/prisma":{prisma:{}},
});
const now=new Date("2026-10-24T14:00:00Z");
const trialEnd="2026-11-04T00:00:00Z";
function snapshot(start,end,plan="GROWTH"){
  return {plan,usagePeriodStart:start?new Date(start):null,usagePeriodEnd:end?new Date(end):null};
}
test("Shopify refresh retains trial start instead of resetting to refresh time",()=>{
  const first=pricing.resolveShopifyUsageWindow({
    plan:"GROWTH",currentBillingCycle:null,trialEndsAt:trialEnd,
    previous:snapshot(null,null,"FREE"),now,
  });
  const later=pricing.resolveShopifyUsageWindow({
    plan:"GROWTH",currentBillingCycle:null,trialEndsAt:trialEnd,
    previous:snapshot(first.start,first.end),
    now:new Date("2026-10-26T14:00:00Z"),
  });
  assert.equal(first.start.toISOString(),"2026-10-24T14:00:00.000Z");
  assert.equal(later.start.toISOString(),first.start.toISOString());
  assert.equal(later.end.toISOString(),first.end.toISOString());
});
test("billing cycle takes priority over a stale or missing saved window",()=>{
  const result=pricing.resolveShopifyUsageWindow({
    plan:"GROWTH",currentBillingCycle:{
      startTime:"2026-10-20T00:00:00Z",endTime:"2026-11-20T00:00:00Z",
    },trialEndsAt:null,previous:snapshot("2026-10-24","2026-11-24"),now,
  });
  assert.equal(result.start.toISOString(),"2026-10-20T00:00:00.000Z");
});
test("missing cycle and no active trial uses calendar-month counting",()=>{
  const result=pricing.resolveShopifyUsageWindow({
    plan:"GROWTH",currentBillingCycle:null,trialEndsAt:null,
    previous:snapshot("2026-10-24T12:00:00Z",null),now,
  });
  assert.equal(result.start,null);
  assert.equal(result.end,null);
  const period=bill.businessUsagePeriod({
    plan:"GROWTH",subscriptionStatus:"active",
    usagePeriodStart:result.start,usagePeriodEnd:result.end,
  },now);
  assert.equal(period.start.toISOString(),"2026-10-01T00:00:00.000Z");
  assert.equal(period.end.toISOString(),"2026-11-01T00:00:00.000Z");
});
test("missing cycle retains valid known period only when plan unchanged",()=>{
  const previous=snapshot("2026-10-20T00:00:00Z","2026-11-20T00:00:00Z");
  const same=pricing.resolveShopifyUsageWindow({
    plan:"GROWTH",currentBillingCycle:null,trialEndsAt:null,previous,now,
  });
  assert.equal(same.start.toISOString(),previous.usagePeriodStart.toISOString());
  const changed=pricing.resolveShopifyUsageWindow({
    plan:"PRO",currentBillingCycle:null,trialEndsAt:null,previous,now,
  });
  assert.equal(changed.start,null);
});
test("future or expired periods do not hide current calendar-month usage",()=>{
  for(const [start,end] of [
    ["2026-11-01T00:00:00Z","2026-12-01T00:00:00Z"],
    ["2026-09-01T00:00:00Z","2026-10-01T00:00:00Z"],
  ]){
    const period=bill.businessUsagePeriod({
      plan:"GROWTH",subscriptionStatus:"active",
      usagePeriodStart:new Date(start),usagePeriodEnd:new Date(end),
    },now);
    assert.equal(period.start.toISOString(),"2026-10-01T00:00:00.000Z");
  }
});
test("Shopify dashboard counts from same bounded window as billing enforcement",()=>{
  const bridge=fs.readFileSync(path.join(__dirname,"..","app/api/internal/shopify-bridge/merchant/route.ts"),"utf8");
  const start=bridge.indexOf('if (resource === "overview"');
  const end=bridge.indexOf('if (resource === "products"',start);
  const snippet=bridge.slice(start,end);
  assert.match(snippet,/businessUsagePeriod\(business\)/);
  assert.match(snippet,/startedAt: \{ gte: period\.start, lt: period\.end \}/);
  assert.match(snippet,/usagePeriodStart: period\.start\.toISOString\(\)/);
});
test("Shopify pricing never persists a fresh now-based start for every refresh",()=>{
  const source=fs.readFileSync(path.join(__dirname,"..","lib/shopify.ts"),"utf8");
  assert.match(source,/resolveShopifyUsageWindow\(/);
  assert.doesNotMatch(source,/const periodStart = subscription\.currentBillingCycle\?\.startTime[\s\S]*?: now;/);
});
