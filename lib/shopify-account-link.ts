import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const PURPOSE="aaryvo-website-account-link/v1:";
const LINK_TTL=10*60*1000;
const MAX_LENGTH=1500;
type ShopifyAccountTicket={
  v:1;shop:string;appId:string;iat:number;nonce:string;
};
export function verifyShopifyAccountTicket(token:string):ShopifyAccountTicket|null{
  if(typeof token!=="string"||token.length>MAX_LENGTH||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))return null;
  const secret=process.env.AARYVO_BRIDGE_SECRET?.trim()||"";
  const allow=(process.env.AARYVO_BRIDGE_ALLOWED_CLIENT_IDS||"")
    .split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(secret.length<32||!allow.length)return null;
  const [encoded,signature]=token.split(".");
  const expected=crypto.createHmac("sha256",secret)
    .update(PURPOSE+encoded).digest();
  const provided=Buffer.from(signature,"base64url");
  if(expected.length!==provided.length||!crypto.timingSafeEqual(expected,provided))return null;
  let value:unknown;
  try{value=JSON.parse(Buffer.from(encoded,"base64url").toString("utf8"));}
  catch{return null}
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const entry=value as Record<string,unknown>;
  const now=Date.now();
  if(entry.v!==1||typeof entry.shop!=="string"||
    !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(entry.shop)||
    typeof entry.appId!=="string"||!/^[a-f0-9]{32}$/i.test(entry.appId)||
    !allow.includes(entry.appId.toLowerCase())||
    typeof entry.iat!=="number"||!Number.isSafeInteger(entry.iat)||
    entry.iat>now+60000||now-entry.iat>LINK_TTL||
    typeof entry.nonce!=="string"||
    !/^[0-9a-f]{8}-[0-9a-f-]{27,40}$/i.test(entry.nonce))return null;
  return entry as ShopifyAccountTicket;
}

async function ensureRedemptionsTable(){
  await prisma.$executeRawUnsafe(
    "CREATE TABLE IF NOT EXISTS aaryvo_shopify_account_link_redemption ("+
    "tokenHash CHAR(64) NOT NULL PRIMARY KEY,"+
    "redeemedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)"+
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  );
}

export async function redeemShopifyAccountTicket(token:string,userId:string){
  const proof=verifyShopifyAccountTicket(token);
  if(!proof)throw new Error("EXPIRED");
  await ensureRedemptionsTable();
  const digest=crypto.createHash("sha256").update(token).digest("hex");
  // Both the Shopify-authenticated ticket and AARYVO-authenticated user must
  // be present. A store URL, matching email or website domain is never proof.
  return prisma.$transaction(async tx=>{
    const linked=await tx.shopifyMerchantLink.findUnique({
      where:{shopDomain_appClientId:{shopDomain:proof.shop,appClientId:proof.appId}},
      select:{businessId:true},
    });
    const store=await tx.shopifyStore.findUnique({
      where:{shopDomain:proof.shop},
      select:{businessId:true,status:true,
        business:{select:{billingChannel:true}}}
    });
    if(!linked||!store||linked.businessId!==store.businessId||
      store.status!=="CONNECTED"||store.business.billingChannel!=="SHOPIFY")
      throw new Error("NOT_CONNECTED");

    const used=await tx.$executeRawUnsafe(
      "INSERT IGNORE INTO aaryvo_shopify_account_link_redemption (tokenHash) VALUES (?)",
      digest,
    );
    if(used!==1)throw new Error("USED");
    // Do not transfer billing or replace the existing standalone workspace.
    // Add access only, under the existing verified Shopify business.
    await tx.businessMember.upsert({
      where:{userId_businessId:{userId,businessId:linked.businessId}},
      update:{},
      create:{userId,businessId:linked.businessId,role:"MEMBER"},
    });
    return {shop:proof.shop};
  });
}
