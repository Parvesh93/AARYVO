import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { getShopifyHostedPricingUrl, inspectShopifyPricingState, syncShopifyPricingState } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PATH = "/api/internal/shopify-bridge/billing";
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
 const action = body.action === "refresh" ? "refresh" : "status";
 const link = await prisma.shopifyMerchantLink.findUnique({where:{shopDomain_appClientId:{shopDomain:shop,appClientId}},select:{businessId:true,business:{select:{billingChannel:true}}}});
 if (!link || link.business.billingChannel !== "SHOPIFY") return NextResponse.json({ok:false,error:"Workspace not provisioned"},{status:409});
 const store = await prisma.shopifyStore.findUnique({where:{shopDomain:shop},select:{businessId:true,status:true}});
 if (!store || store.businessId !== link.businessId || store.status !== "CONNECTED") return NextResponse.json({ok:false,error:"Connect Shopify store first"},{status:409});
 try {
  const state = action === "refresh" ? await syncShopifyPricingState(link.businessId) : await inspectShopifyPricingState(link.businessId);
  if (!state.managed) return NextResponse.json({ok:false,error:"Shopify App Pricing not available for this workspace"},{status:409});
  let pricingUrl: string | null = null;
  let pricingIssue: "APP_HANDLE_REQUIRED" | "PRICING_LOOKUP_FAILED" | null = null;
  try {pricingUrl = (await getShopifyHostedPricingUrl(link.businessId)).url;} catch(e) {
   console.warn("Unable to resolve Shopify hosted pricing page",e instanceof Error ? e.message : "Unknown");
   pricingIssue = process.env.SHOPIFY_APP_HANDLE?.trim() ? "PRICING_LOOKUP_FAILED" : "APP_HANDLE_REQUIRED";
  }
  return NextResponse.json({ok:true,shop,active:state.active === true,
   plan: "handle" in state ? state.handle : null,pricingUrl,pricingIssue,
   cancelAtEnd:state.cancelAtEnd === true},{headers:{"Cache-Control":"no-store"}});
 } catch(e) {
  console.error("AARYVO Shopify billing verification failed",e instanceof Error ? e.message : "Unknown");
  return NextResponse.json({ok:false,error:"Shopify billing verification unavailable. Check backend configuration."},{status:503});
 }
}
