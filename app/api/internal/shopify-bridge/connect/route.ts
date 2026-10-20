import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/token-crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PATH = "/api/internal/shopify-bridge/connect";
const validShop = (s: string) => /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s);

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") || "").startsWith("application/json")) return NextResponse.json({error:"Invalid content type"}, {status:415});
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({error:"Invalid JSON"}, {status:400}); }
  const shop = typeof body.shop === "string" ? body.shop.toLowerCase() : "";
  const appClientId = typeof body.appClientId === "string" ? body.appClientId : "";
  const token = typeof body.accessToken === "string" ? body.accessToken : "";
  const scope = typeof body.scope === "string" ? body.scope : "";
  const secret = process.env.AARYVO_BRIDGE_SECRET || "";
  const allowed = (process.env.AARYVO_BRIDGE_ALLOWED_CLIENT_IDS || "").split(",").map(x=>x.trim());
  const timestamp = request.headers.get("x-aaryvo-bridge-timestamp") || "";
  const nonce = request.headers.get("x-aaryvo-bridge-nonce") || "";
  const signature = request.headers.get("x-aaryvo-bridge-signature") || "";
  if (!validShop(shop) || !/^[a-f0-9]{32}$/i.test(appClientId) || !token || token.length > 2048 || scope.length > 2048 ||
      secret.length < 32 || !allowed.includes(appClientId) || !/^\d{13}$/.test(timestamp) ||
      !/^[0-9a-f-]{36}$/i.test(nonce) || !/^[0-9a-f]{64}$/i.test(signature) ||
      Math.abs(Date.now() - Number(timestamp)) > 120000) return NextResponse.json({error:"Unauthorized"}, {status:401});
  const canonical = [timestamp,nonce,shop,appClientId,"POST",PATH].join("\n");
  const expected = crypto.createHmac("sha256",secret).update(canonical).digest();
  const supplied = Buffer.from(signature,"hex");
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied,expected)) return NextResponse.json({error:"Unauthorized"}, {status:401});
  const link = await prisma.shopifyMerchantLink.findUnique({where:{shopDomain_appClientId:{shopDomain:shop,appClientId}},select:{businessId:true}});
  if (!link) return NextResponse.json({error:"Workspace not provisioned"}, {status:409});
  const existing = await prisma.shopifyStore.findUnique({where:{shopDomain:shop},select:{id:true,businessId:true,status:true}});
  // Existing connections are refreshed only after validating the replacement token.
  // Never move a connection between workspaces.
  if (existing && existing.businessId !== link.businessId) {
    return NextResponse.json({error:"Store already linked to another workspace"}, {status:409});
  }
  const other = await prisma.shopifyStore.findUnique({where:{businessId:link.businessId},select:{id:true}});
  if (other && !existing) return NextResponse.json({error:"Workspace already has a Shopify connection"}, {status:409});
  // Verify the token with Shopify before persisting. Never accept an arbitrary token for a signed shop name.
  const verification = await fetch(`https://${shop}/admin/api/2026-10/graphql.json`,{
    method:"POST",headers:{"Content-Type":"application/json","X-Shopify-Access-Token":token},
    body:JSON.stringify({query:"{ shop { myshopifyDomain } }"}),signal:AbortSignal.timeout(8000),cache:"no-store"
  }).catch(()=>null);
  if (!verification?.ok) return NextResponse.json({error:"Shopify token verification failed"}, {status:403});
  const result = await verification.json().catch(()=>null);
  if (result?.data?.shop?.myshopifyDomain?.toLowerCase() !== shop) return NextResponse.json({error:"Token belongs to a different store"}, {status:403});
  try {
    if (existing) {
      await prisma.shopifyStore.update({where:{id:existing.id},data:{accessTokenEncrypted:encryptToken(token),scope,status:"CONNECTED",accessTokenExpiresAt:null,refreshTokenEncrypted:null}});
    } else {
      await prisma.shopifyStore.create({data:{businessId:link.businessId,shopDomain:shop,accessTokenEncrypted:encryptToken(token),scope,status:"CONNECTED"}});
    }
  } catch {
    return NextResponse.json({error:"Connection already exists or could not be saved"}, {status:409});
  }
  return NextResponse.json({ok:true,shop,connected:true,created:!existing,refreshed:Boolean(existing)});
}
