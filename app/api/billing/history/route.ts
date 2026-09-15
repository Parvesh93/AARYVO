import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { razorpayConfigured, razorpayRequest } from "@/lib/billing";
import { subscriptionIdsForBusiness } from "@/lib/billing-upgrade";

type InvoiceView={id:string;invoiceNumber:string|null;paymentId:string|null;status:string;amount:number;amountPaid:number;taxAmount:number;taxableAmount:number;currency:string;issuedAt:string|null;paidAt:string|null;shortUrl:string|null};

export async function GET(){
 const session=await getSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const member=await prisma.businessMember.findFirst({where:{userId:session.userId},include:{business:true}});if(!member)return NextResponse.json({error:"Workspace not found"},{status:404});
 if(!razorpayConfigured())return NextResponse.json({error:"Billing is not configured yet."},{status:503});
 try{
  const ids=new Set<string>();if(member.business.razorpaySubscriptionId)ids.add(member.business.razorpaySubscriptionId);for(const id of await subscriptionIdsForBusiness(member.business.id))ids.add(id);
  const all:InvoiceView[]=[];
  for(const subscriptionId of ids){
   try{
    const result=await razorpayRequest(`/invoices?subscription_id=${encodeURIComponent(subscriptionId)}`);
    for(const invoice of Array.isArray(result?.items)?result.items:[]){all.push({id:String(invoice.id||""),invoiceNumber:invoice.invoice_number?String(invoice.invoice_number):null,paymentId:invoice.payment_id?String(invoice.payment_id):null,status:String(invoice.status||"unknown"),amount:Number(invoice.amount||0),amountPaid:Number(invoice.amount_paid||0),taxAmount:Number(invoice.tax_amount||0),taxableAmount:Number(invoice.taxable_amount||0),currency:String(invoice.currency||"INR"),issuedAt:invoice.issued_at?new Date(Number(invoice.issued_at)*1000).toISOString():null,paidAt:invoice.paid_at?new Date(Number(invoice.paid_at)*1000).toISOString():null,shortUrl:invoice.short_url?String(invoice.short_url):null})}
   }catch{}
  }
  const invoices=[...new Map(all.filter(x=>x.id).map(x=>[x.id,x])).values()];invoices.sort((a,b)=>(b.issuedAt||"").localeCompare(a.issuedAt||""));return NextResponse.json({invoices});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to load billing history."},{status:500})}
}
