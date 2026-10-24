import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { getShopifyHostedPricingUrl, inspectShopifyPricingState, syncShopifyPricingState, type ShopifyPricingTimings } from "@/lib/shopify";

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
 // IDs must come from authenticate.admin() on the connected Shopify app.
 const shopId = typeof body.shopId === "string" ? body.shopId : "";
 const appId = typeof body.appId === "string" ? body.appId : "";
 const secret = process.env.AARYVO_BRIDGE_SECRET?.trim() || "";
 const allowed = (process.env.AARYVO_BRIDGE_ALLOWED_CLIENT_IDS || "").split(",").map(x=>x.trim());
 const timestamp = request.headers.get("x-aaryvo-bridge-timestamp") || "";
 const nonce = request.headers.get("x-aaryvo-bridge-nonce") || "";
 const signature = request.headers.get("x-aaryvo-bridge-signature") || "";
 if (!validShop(shop) || !/^[a-f0-9]{32}$/i.test(appClientId) ||
     !/^gid:\/\/shopify\/Shop\/[0-9]+$/.test(shopId) ||
     !/^gid:\/\/shopify\/App\/[0-9]+$/.test(appId) || secret.length < 32 ||
     !allowed.includes(appClientId) || !/^\d{13}$/.test(timestamp) ||
     !/^[0-9a-f-]{36}$/i.test(nonce) || !/^[0-9a-f]{64}$/i.test(signature) ||
     Math.abs(Date.now() - Number(timestamp)) > 120000) return NextResponse.json({ok:false,error:"Unauthorized"}, {status:401});
 // Bind both Shopify IDs into the signed request, not just the shop domain.
 const canonical = [timestamp,nonce,shop,appClientId,shopId,appId,"POST",PATH].join("\n");
 const expected = crypto.createHmac("sha256",secret).update(canonical).digest();
 const actual = Buffer.from(signature,"hex");
 if (actual.length !== expected.length || !crypto.timingSafeEqual(actual,expected)) return NextResponse.json({ok:false,error:"Unauthorized"}, {status:401});
 const action = body.action === "refresh" ? "refresh" : "status";
 // Only log after authenticating the signed server-to-server request.
 const trace = request.headers.get("x-aaryvo-perf-trace") || "";
 const traceId = /^[0-9a-f-]{36}$/i.test(trace) ? trace : crypto.randomUUID();
 const started = performance.now();
 const timings: ShopifyPricingTimings & {
   merchantLinkMs?: number; shopStoreMs?: number; pricingUrlMs?: number;
   pricingVerificationMs?: number;
 } = {};
 let outcome = "exception";
 try {
 const linkStarted = performance.now();
 const link = await prisma.shopifyMerchantLink.findUnique({where:{shopDomain_appClientId:{shopDomain:shop,appClientId}},select:{businessId:true,business:{select:{billingChannel:true}}}});
 timings.merchantLinkMs = Math.round(performance.now() - linkStarted);
 if (!link || link.business.billingChannel !== "SHOPIFY") {
  outcome = "not_provisioned";
  return NextResponse.json({ok:false,error:"Workspace not provisioned"},{status:409});
 }
 const storeStarted = performance.now();
 const store = await prisma.shopifyStore.findUnique({where:{shopDomain:shop},select:{businessId:true,status:true}});
 timings.shopStoreMs = Math.round(performance.now() - storeStarted);
 if (!store || store.businessId !== link.businessId || store.status !== "CONNECTED") {
  outcome = "store_not_connected";
  return NextResponse.json({ok:false,error:"Connect Shopify store first"},{status:409});
 }
 let pricingUrl: string | null = null;
 let pricingIssue: "APP_HANDLE_REQUIRED" | "PRICING_LOOKUP_FAILED" | null = null;
 const pricingStarted = performance.now();
 try {
  pricingUrl = (await getShopifyHostedPricingUrl(link.businessId)).url;
 } catch(e) {
  console.warn("Unable to resolve Shopify hosted pricing page",e instanceof Error ? e.message : "Unknown");
  pricingIssue = process.env.SHOPIFY_APP_HANDLE?.trim() ? "PRICING_LOOKUP_FAILED" : "APP_HANDLE_REQUIRED";
 } finally {
  timings.pricingUrlMs = Math.round(performance.now() - pricingStarted);
 }
 try {
  const identity = { shopId, appId };
  const verificationStarted = performance.now();
  const state = action === "refresh"
   ? await syncShopifyPricingState(link.businessId, identity, timings)
   : await inspectShopifyPricingState(link.businessId, identity, timings);
  timings.pricingVerificationMs = Math.round(performance.now() - verificationStarted);
  if (!state.managed) {
   outcome = "unmanaged";
   return NextResponse.json({ok:false,error:"Shopify App Pricing not available for this workspace",shop,pricingUrl,pricingIssue},{status:409});
  }
  outcome = "verified";
  return NextResponse.json({ok:true,shop,active:state.active === true,
   plan:"handle" in state ? state.handle : null,pricingUrl,pricingIssue,
   cancelAtEnd:state.cancelAtEnd === true},{headers:{"Cache-Control":"no-store"}});
 } catch(e) {
  outcome = "verification_unavailable";
  console.error("AARYVO Shopify billing verification failed",e instanceof Error ? e.message : "Unknown");
  return NextResponse.json({ok:true,shop,active:null,plan:null,pricingUrl,pricingIssue,
   verificationAvailable:false,verificationMessage:"Subscription verification is temporarily unavailable. You can select a plan in Shopify, but paid features remain locked until verification succeeds."},
   {headers:{"Cache-Control":"no-store"}});
 }
 } finally {
  if (process.env.AARYVO_BILLING_PERF_LOGS === "true") {
    console.info("AARYVO_PERF " + JSON.stringify({
      event: "backend_billing_verification", traceId,
      ...timings, totalMs: Math.round(performance.now() - started), outcome,
    }));
  }
 }
}
