const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const vm=require("node:vm");
const ts=require("typescript");

const secret="account-link-test-bridge-secret-with-more-than-32-chars";
const appId="68cb452f44c0123456789abcdef01234";
const shop="demo-shop.myshopify.com";
const env={...process.env,AARYVO_BRIDGE_SECRET:secret,
  AARYVO_BRIDGE_ALLOWED_CLIENT_IDS:appId};
let redeemed=new Set();
const changes=[];
const tx={
  shopifyMerchantLink:{
    findUnique:async()=>({businessId:"shopify-biz"}),
  },
  shopifyStore:{
    findUnique:async()=>({businessId:"shopify-biz",status:"CONNECTED",
      business:{billingChannel:"SHOPIFY"}}),
  },
  $executeRawUnsafe:async(sql,hash)=>{
    assert.match(sql,/INSERT IGNORE/);
    if(redeemed.has(hash))return 0;
    redeemed.add(hash);return 1;
  },
  businessMember:{
    upsert:async(args)=>{changes.push(args);return {id:"member"};},
  },
};
const prisma={
  $executeRawUnsafe:async(sql)=>{assert.match(sql,/CREATE TABLE IF NOT EXISTS/);return 0;},
  $transaction:async(callback)=>callback(tx),
};
const filename=path.join(__dirname,"../lib/shopify-account-link.ts");
const js=ts.transpileModule(fs.readFileSync(filename,"utf8"),{
  fileName:filename,
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
    esModuleInterop:true},
  reportDiagnostics:true,
});
assert.equal((js.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const mod={exports:{}};
vm.runInNewContext("(function(require,module,exports){"+js.outputText+"\n})",
  {console,process:{env},Buffer,Date}, {filename})(
    name=>name==="node:crypto"?crypto:
      name==="@/lib/prisma"?{prisma}:
      (()=>{throw Error("Unknown import "+name)})(),
    mod,mod.exports,
  );
const account=mod.exports;
function ticket(overrides={}){
  const payload={v:1,shop,appId,iat:Date.now(),nonce:crypto.randomUUID(),...overrides};
  const body=Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig=crypto.createHmac("sha256",secret)
    .update("aaryvo-website-account-link/v1:"+body).digest("base64url");
  return body+"."+sig;
}

test("valid authorized Shopify ticket grants membership without moving billing",async()=>{
  redeemed=new Set();changes.length=0;
  const token=ticket();
  const proof=account.verifyShopifyAccountTicket(token);
  assert.equal(proof.shop,shop);
  const result=await account.redeemShopifyAccountTicket(token,"user-1");
  assert.equal(result.shop,shop);
  assert.equal(changes.length,1);
  assert.equal(changes[0].where.userId_businessId.businessId,"shopify-biz");
  assert.equal(changes[0].create.role,"MEMBER");
  await assert.rejects(
    ()=>account.redeemShopifyAccountTicket(token,"user-2"),
    /USED/,
  );
  assert.equal(changes.length,1);
});
test("tampered, wrong-app, expired and future tickets fail",()=>{
  const valid=ticket();
  assert.equal(account.verifyShopifyAccountTicket(valid+"x"),null);
  assert.equal(account.verifyShopifyAccountTicket(ticket({
    appId:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"})),null);
  assert.equal(account.verifyShopifyAccountTicket(ticket({
    iat:Date.now()-11*60*1000})),null);
  assert.equal(account.verifyShopifyAccountTicket(ticket({
    iat:Date.now()+2*60*1000})),null);
  assert.equal(account.verifyShopifyAccountTicket("invalid"),null);
});
test("missing Shopify connection prevents website membership",async()=>{
  const prev=tx.shopifyStore.findUnique;
  tx.shopifyStore.findUnique=async()=>null;
  changes.length=0;
  try{
    await assert.rejects(
      ()=>account.redeemShopifyAccountTicket(ticket(),"user-3"),
      /NOT_CONNECTED/,
    );
    assert.equal(changes.length,0);
  }finally{tx.shopifyStore.findUnique=prev;}
});
