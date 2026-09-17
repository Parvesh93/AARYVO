import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { sendTrackedPlatformEmail } from "@/lib/email-delivery";

const categories=new Set(["OUTREACH","FOLLOW_UP","DEMO_INVITATION","RE_ENGAGEMENT","TEST"]);
function validEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}

export async function POST(request:Request){
  try{
    await requireAdmin();
    const body=await request.json();
    const to=typeof body?.to==="string"?body.to.trim():"";
    const subject=typeof body?.subject==="string"?body.subject.trim():"";
    const html=typeof body?.html==="string"?body.html:"";
    const text=typeof body?.text==="string"?body.text:"";
    const category=typeof body?.category==="string"?body.category.trim().toUpperCase():"OUTREACH";
    if(!validEmail(to)||!subject||(!html&&!text))return NextResponse.json({ok:false,error:"Recipient, subject and email content are required."},{status:400});
    if(!categories.has(category))return NextResponse.json({ok:false,error:"Unsupported email category."},{status:400});
    if(subject.length>500||html.length>250000||text.length>100000)return NextResponse.json({ok:false,error:"Email content is too large."},{status:413});
    const result=await sendTrackedPlatformEmail({to,subject,html:html||undefined,text:text||undefined,category});
    return NextResponse.json({ok:true,analyticsId:result.analyticsId,messageId:result.messageId||null});
  }catch(error){
    const message=error instanceof Error?error.message:"Unable to send email";
    const auth=message.toLowerCase().includes("admin")||message.toLowerCase().includes("unauthorized");
    return NextResponse.json({ok:false,error:auth?"Unauthorized":message},{status:auth?401:500});
  }
}
