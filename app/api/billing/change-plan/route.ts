import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlanKey, PLANS, razorpayPlanId, razorpayRequest } from "@/lib/billing";
import { gstRate } from "@/lib/billing-profile";
import { activeTransitionForBusiness, createBillingTransition, updateBillingTransition } from "@/lib/billing-upgrade";

function proratedUpgradePaise(currentPrice:number,targetPrice:number,periodStart:Date|null,periodEnd:Date|null){if(targetPrice<=currentPrice)return 0;const now=Date.now(),start=periodStart?.getTime()||now,end=periodEnd?.getTime()||now,total=Math.max(1,end-start),remaining=Math.max(0,Math.min(total,end-now));const basePaise=Math.max(0,Math.round((targetPrice-currentPrice)*100*(remaining/total)));return Math.round(basePaise*(1+gstRate()/100))}

export async function POST(request:Request){
 const session=await getSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const member=await prisma.businessMember.findFirst({where:{userId:session.userId},include:{business:{include:{shopifyStore:{select:{id:true}}}},user:true}});if(!member)return NextResponse.json({error:"Workspace not found"},{status:404});
 if(member.business.shopifyStore)return NextResponse.json({error:"This workspace is connected to Shopify. Manage plan changes through Shopify."},{status:409});
 const body=await request.json(),plan=String(body.plan||"").toUpperCase();if(!isPlanKey(plan)||plan==="FREE")return NextResponse.json({error:"Choose a paid plan."},{status:400});
 const business=member.business;if(!business.razorpaySubscriptionId||business.plan==="FREE")return NextResponse.json({error:"No active paid subscription found."},{status:400});if(business.plan===plan)return NextResponse.json({error:"This is already your current plan."},{status:400});if(business.subscriptionCancelAtEnd)return NextResponse.json({error:"Your subscription is already scheduled for cancellation. Resolve that before changing plans."},{status:409});
 const pending=await activeTransitionForBusiness(business.id);
 if(pending){
   try{
     const sub=await razorpayRequest(`/subscriptions/${pending.newSubscriptionId}`),status=String(sub.status||"").toLowerCase();
     if(pending.direction==="UPGRADE"&&isPlanKey(pending.toPlan)&&pending.toPlan!=="FREE"&&["authenticated","active","pending"].includes(status)){
       await prisma.business.update({where:{id:business.id},data:{plan:pending.toPlan,monthlyConversationLimit:PLANS[pending.toPlan].conversations,subscriptionCancelAtEnd:false}});
       try{await razorpayRequest(`/subscriptions/${pending.oldSubscriptionId}/cancel`,{method:"POST",body:JSON.stringify({cancel_at_cycle_end:true})})}catch{}
       await updateBillingTransition(pending.newSubscriptionId,status==="active"?"ACTIVE":"AUTHENTICATED",pending.paymentId);
       return NextResponse.json({ok:true,recovered:true,effective:"now",plan:pending.toPlan,limit:PLANS[pending.toPlan].conversations,message:`${PLANS[pending.toPlan].name} is active now.`});
     }
     const age=Date.now()-(pending.createdAt?.getTime()||Date.now());
     if(["cancelled","completed","expired","halted"].includes(status)||age>30*60*1000){try{if(!["cancelled","completed","expired"].includes(status))await razorpayRequest(`/subscriptions/${pending.newSubscriptionId}/cancel`,{method:"POST",body:JSON.stringify({cancel_at_cycle_end:false})})}catch{}await updateBillingTransition(pending.newSubscriptionId,"ABANDONED",pending.paymentId)}
     else return NextResponse.json({error:"A plan change checkout is already pending. Complete the existing Razorpay checkout or try again after 30 minutes."},{status:409});
   }catch{return NextResponse.json({error:"A plan change is already pending. Please refresh the page and try again shortly."},{status:409})}
 }
 const planId=razorpayPlanId(plan);if(!planId)return NextResponse.json({error:`Razorpay ${plan} plan is not configured.`},{status:503});
 const keyId=process.env.RAZORPAY_KEY_ID||"";if(!keyId)return NextResponse.json({error:"Razorpay checkout key is not configured."},{status:503});
 const currentPrice=isPlanKey(business.plan)?PLANS[business.plan].price:0,targetPrice=PLANS[plan].price,isUpgrade=targetPrice>currentPrice,startAt=business.subscriptionCurrentEnd&&business.subscriptionCurrentEnd.getTime()>Date.now()?business.subscriptionCurrentEnd:new Date(Date.now()+5*60*1000),upfrontPaise=isUpgrade?proratedUpgradePaise(currentPrice,targetPrice,business.subscriptionCurrentStart,business.subscriptionCurrentEnd):0;
 try{
  const subscription=await razorpayRequest("/subscriptions",{method:"POST",body:JSON.stringify({plan_id:planId,total_count:120,quantity:1,start_at:Math.floor(startAt.getTime()/1000),customer_notify:1,notes:{aaryvo_business_id:business.id,aaryvo_from_plan:business.plan,aaryvo_to_plan:plan,aaryvo_change:isUpgrade?"upgrade":"downgrade",aaryvo_pricing:"base_plus_gst"},...(upfrontPaise>0?{addons:[{item:{name:`${PLANS[plan].name} immediate upgrade access`,amount:upfrontPaise,currency:"INR",description:`Prorated upgrade from ${business.plan} to ${plan}, including ${gstRate()}% GST, until the next billing date.`}}]}:{})})});
  if(!subscription?.id)throw new Error("Razorpay did not create the replacement subscription.");
  await createBillingTransition({id:crypto.randomUUID(),businessId:business.id,oldSubscriptionId:business.razorpaySubscriptionId,newSubscriptionId:String(subscription.id),fromPlan:business.plan,toPlan:plan,direction:isUpgrade?"UPGRADE":"DOWNGRADE",upfrontPaise,startAt,status:"CREATED",paymentId:null});
  return NextResponse.json({keyId,subscriptionId:subscription.id,plan,planName:PLANS[plan].name,direction:isUpgrade?"upgrade":"downgrade",effective:isUpgrade?"after_authorization":"cycle_end",startAt:startAt.toISOString(),upfrontPaise,name:member.user.name||business.name,email:member.user.email});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to prepare plan change."},{status:500})}
}
