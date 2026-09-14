import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const PLANS={FREE:{name:"Free",price:0,conversations:50},STARTER:{name:"Starter",price:999,conversations:500},GROWTH:{name:"Growth",price:2499,conversations:2000},PRO:{name:"Pro",price:4999,conversations:5000}} as const;
export type PlanKey=keyof typeof PLANS;
export function isPlanKey(value:string):value is PlanKey{return value in PLANS}
export function razorpayPlanId(plan:Exclude<PlanKey,"FREE">){return process.env[`RAZORPAY_PLAN_${plan}`]||""}
export function razorpayConfigured(){return Boolean(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET)}
export async function razorpayRequest(path:string,init:RequestInit={}){const key=process.env.RAZORPAY_KEY_ID||"",secret=process.env.RAZORPAY_KEY_SECRET||"";const auth=Buffer.from(`${key}:${secret}`).toString("base64");const response=await fetch(`https://api.razorpay.com/v1${path}`,{...init,headers:{Authorization:`Basic ${auth}`,"Content-Type":"application/json",...(init.headers||{})},cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data?.error?.description||"Razorpay request failed");return data}
export function verifyWebhook(raw:string,signature:string){const secret=process.env.RAZORPAY_WEBHOOK_SECRET||"";if(!secret||!signature)return false;const expected=crypto.createHmac("sha256",secret).update(raw).digest("hex");try{return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature))}catch{return false}}
export function planFromRazorpayPlanId(id:string){for(const key of ["STARTER","GROWTH","PRO"] as const)if(razorpayPlanId(key)===id)return key;return null}

export function currentCalendarMonth(now=new Date()){
  const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
  const end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1));
  return{start,end};
}

export function businessUsagePeriod(business:{usagePeriodStart:Date|null;usagePeriodEnd:Date|null;subscriptionStatus:string;plan:string},now=new Date()){
  const paid=business.plan!=="FREE"&&["active","authenticated","charged","pending"].includes(String(business.subscriptionStatus||"").toLowerCase());
  if(paid&&business.usagePeriodStart&&business.usagePeriodEnd&&business.usagePeriodEnd>now)return{start:business.usagePeriodStart,end:business.usagePeriodEnd};
  return currentCalendarMonth(now);
}

export async function getBusinessConversationUsage(businessId:string){
  const business=await prisma.business.findUnique({where:{id:businessId},select:{plan:true,subscriptionStatus:true,usagePeriodStart:true,usagePeriodEnd:true,monthlyConversationLimit:true,agents:{select:{id:true}}}});
  if(!business)throw new Error("Business not found");
  const period=businessUsagePeriod(business);
  const usage=business.agents.length?await prisma.conversation.count({where:{agentId:{in:business.agents.map(a=>a.id)},startedAt:{gte:period.start,lt:period.end}}}):0;
  return{usage,limit:business.monthlyConversationLimit,remaining:Math.max(0,business.monthlyConversationLimit-usage),allowed:usage<business.monthlyConversationLimit,periodStart:period.start,periodEnd:period.end,plan:business.plan,subscriptionStatus:business.subscriptionStatus};
}
