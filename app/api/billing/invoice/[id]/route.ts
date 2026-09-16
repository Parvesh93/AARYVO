import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoredInvoice } from "@/lib/billing-invoice";
import { createInvoicePdf } from "@/lib/invoice-pdf";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const session=await getSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const member=await prisma.businessMember.findFirst({where:{userId:session.userId},select:{businessId:true}});if(!member)return NextResponse.json({error:"Workspace not found"},{status:404});
 const{id}=await params;const invoice=await getStoredInvoice(member.businessId,id);if(!invoice)return NextResponse.json({error:"Invoice not found"},{status:404});
 const pdf=createInvoicePdf({...invoice,invoiceNumber:invoice.invoiceNumber||invoice.id});
 const filename=`AARYVO-${(invoice.invoiceNumber||invoice.id).replace(/[^a-zA-Z0-9_-]/g,"-")}.pdf`;
 return new NextResponse(new Uint8Array(pdf),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${filename}"`,"Cache-Control":"private, no-store"}});
}
