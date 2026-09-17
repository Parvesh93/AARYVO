import { NextResponse } from "next/server";
import { markEmailClicked } from "@/lib/email-analytics";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){const{id}=await params;const current=new URL(request.url),raw=current.searchParams.get("url"),base=(process.env.NEXT_PUBLIC_APP_URL||"https://aaryvo.ppdesigntech.com").replace(/\/$/,"");let target=base;try{if(raw){const parsed=new URL(raw);if(parsed.origin===new URL(base).origin)target=parsed.toString()}}catch{}try{await markEmailClicked(id)}catch{}return NextResponse.redirect(target,302)}
