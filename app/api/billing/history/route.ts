import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { razorpayConfigured } from "@/lib/billing";
import { subscriptionIdsForBusiness } from "@/lib/billing-upgrade";
import { getStoredInvoices, syncRazorpayInvoices } from "@/lib/billing-invoice";

export async function GET(){
 const session=await getSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const member=await prisma.businessMember.findFirst({where:{userId:session.userId},include:{business:true}});if(!member)return NextResponse.json({error:"Workspace not found"},{status:404});
 try{
  let invoices=await getStoredInvoices(member.business.id);
  if(razorpayConfigured()){
   const ids=new Set<string>();if(member.business.razorpaySubscriptionId)ids.add(member.business.razorpaySubscriptionId);for(const id of await subscriptionIdsForBusiness(member.business.id))ids.add(id);
   if(ids.size)invoices=await syncRazorpayInvoices(member.business.id,[...ids]);
  }
  return NextResponse.json({invoices:invoices.map(i=>({id:i.id,invoiceNumber:i.invoiceNumber,paymentId:i.razorpayPaymentId,status:i.status,amount:i.totalPaise,amountPaid:i.totalPaise,taxAmount:i.taxPaise,taxableAmount:i.subtotalPaise,cgstAmount:i.cgstPaise,sgstAmount:i.sgstPaise,igstAmount:i.igstPaise,taxRate:i.taxRate,taxType:i.taxType,currency:i.currency,issuedAt:i.issuedAt.toISOString(),paidAt:i.paidAt?.toISOString()||null,shortUrl:`/api/billing/invoice/${encodeURIComponent(i.id)}`,customer:i.legalName,gstin:i.gstin,state:i.state}))});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to load billing history."},{status:500})}
}
