import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function POST(){const session=await getSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});const member=await prisma.businessMember.findFirst({where:{userId:session.userId}});if(!member)return NextResponse.json({error:"Workspace not found"},{status:404});await prisma.business.update({where:{id:member.businessId},data:{googleAccessToken:null,googleRefreshToken:null,googleTokenExpiresAt:null,googleCalendarId:null,googleCalendarName:null,googleAccountEmail:null,googleCalendarConnectedAt:null}});return NextResponse.json({ok:true});}
