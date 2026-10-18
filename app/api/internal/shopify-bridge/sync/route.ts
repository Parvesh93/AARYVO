import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/plan-entitlements";
import { syncShopifyCatalog } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PATH = "/api/internal/shopify-bridge/sync";
const validShop = (s: string) => /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s);

export async function POST(request: Request) {
 if (!(request.headers.get("content-type") || "").startsWith("application/json")) return NextResponse.json({ok:false,error:"Invalid content type"}, {status:415});
 let input: unknown;
 try { input = await request.json(); } catch { return NextResponse.json({ok:false,error:"Invalid JSON"}, {status:400}); }
 const body = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string,unknown> : {};
 const shop = typeof body.shop === "string" ? body.shop.trim().toLowerCase() : "";
 const appClientId = typeof body.appClientId === "string" ? body.appClientId : "";
 const secret = process.env.AARYVO_BRIDGE_SECRET?.trim() || "";
 const allowed = (process.env.AARYVO_BRIDGE_ALLOWED_CLIENT_IDS || "").split(",").map(x=>x.trim());
 const timestamp = request.headers.get("x-aaryvo-bridge-timestamp") || "";
 const nonce = request.headers.get("x-aaryvo-bridge-nonce") || "";
 const signature = request.headers.get("x-aaryvo-bridge-signature") || "";
 if (!validShop(shop) || !/^[a-f0-9]{32}$/i.test(appClientId) || secret.length < 32 ||
     !allowed.includes(appClientId) || !/^\d{13}$/.test(timestamp) ||
     !/^[0-9a-f-]{36}$/i.test(nonce) || !/^[0-9a-f]{64}$/i.test(signature) ||
     Math.abs(Date.now() - Number(timestamp)) > 120000) return NextResponse.json({ok:false,error:"Unauthorized"}, {status:401});
 const canonical = [timestamp,nonce,shop,appClientId,"POST",PATH].join("\n");
 const expected = crypto.createHmac("sha256",secret).update(canonical).digest();
 const actual = Buffer.from(signature,"hex");
 if (actual.length !== expected.length || !crypto.timingSafeEqual(actual,expected)) return NextResponse.json({ok:false,error:"Unauthorized"}, {status:401});
 const link = await prisma.shopifyMerchantLink.findUnique({where:{shopDomain_appClientId:{shopDomain:shop,appClientId}},select:{businessId:true,business:{select:{plan:true,billingChannel:true,subscriptionStatus:true}}}});
 if (!link || link.business.billingChannel !== "SHOPIFY") return NextResponse.json({ok:false,error:"Workspace not provisioned"}, {status:409});
 const store = await prisma.shopifyStore.findUnique({where:{shopDomain:shop},select:{businessId:true,status:true,lastSyncStatus:true}});
 if (!store || store.businessId !== link.businessId || store.status !== "CONNECTED") return NextResponse.json({ok:false,error:"Store not connected"}, {status:409});
 if (!hasFeature(link.business.plan,"shopifyIntegration") || !["ACTIVE","active"].includes(link.business.subscriptionStatus)) {
   return NextResponse.json({ok:false,error:"A paid active plan with Shopify integration is required.",code:"PLAN_REQUIRED"}, {status:403});
 }
 if (store.lastSyncStatus === "SYNCING") return NextResponse.json({ok:false,error:"A synchronization is already in progress."}, {status:409});
 try {
   const result = await syncShopifyCatalog(link.businessId);
   return NextResponse.json({ok:true,shop,...result},{headers:{"Cache-Control":"no-store"}});
 } catch (error) {
   console.error("AARYVO bridge sync failed",error instanceof Error ? error.message : "Unknown error");
   return NextResponse.json({ok:false,error:"Product synchronization failed. Check backend logs."},{status:500});
 }
}
