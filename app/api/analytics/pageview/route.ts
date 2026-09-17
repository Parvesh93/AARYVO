import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { ensurePlatformAnalyticsTables } from "@/lib/platform-analytics";

export async function POST(request:Request){
  try{
    const body=await request.json();
    if(!body?.visitorId||!body?.sessionId||!body?.path)return NextResponse.json({ok:false},{status:400});
    await ensurePlatformAnalyticsTables();
    const value=(v:unknown,n=1000)=>typeof v==="string"?v.slice(0,n):null;
    await prisma.$executeRawUnsafe(`INSERT INTO platform_pageview (id,visitorId,sessionId,path,referrer,utmSource,utmMedium,utmCampaign,utmContent,utmTerm,userAgent) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,randomUUID(),value(body.visitorId,191),value(body.sessionId,191),value(body.path,500),value(body.referrer),value(body.utmSource,191),value(body.utmMedium,191),value(body.utmCampaign,191),value(body.utmContent,191),value(body.utmTerm,191),value(request.headers.get("user-agent")));
    return NextResponse.json({ok:true});
  }catch{return NextResponse.json({ok:false},{status:500});}
}
