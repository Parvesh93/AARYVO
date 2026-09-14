import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { googleAuthorizationUrl } from "@/lib/google-oauth";
import { prisma } from "@/lib/prisma";

export async function GET(){const session=await getSession();if(!session)return NextResponse.redirect(new URL("/login",process.env.NEXT_PUBLIC_APP_URL));const member=await prisma.businessMember.findFirst({where:{userId:session.userId}});if(!member)return NextResponse.redirect(new URL("/dashboard/settings?calendar=workspace",process.env.NEXT_PUBLIC_APP_URL));try{return NextResponse.redirect(googleAuthorizationUrl(member.businessId,session.userId));}catch{return NextResponse.redirect(new URL("/dashboard/settings?calendar=not-configured",process.env.NEXT_PUBLIC_APP_URL));}}
