import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Context={params:Promise<{id:string}>};
export async function PATCH(request:Request,context:Context){
  const session=await getSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
  const member=await prisma.businessMember.findFirst({where:{userId:session.userId},select:{businessId:true}});if(!member)return NextResponse.json({error:"Workspace not found"},{status:404});
  const {id}=await context.params;const conversation=await prisma.conversation.findFirst({where:{id,agent:{businessId:member.businessId}},select:{id:true}});if(!conversation)return NextResponse.json({error:"Conversation not found"},{status:404});
  const body=await request.json();const resolved=body.resolved===true;
  await prisma.conversation.update({where:{id},data:resolved?{needsHuman:false,resolvedAt:new Date()}:{needsHuman:true,resolvedAt:null,attentionReason:typeof body.reason==="string"?body.reason.trim().slice(0,1000):"Flagged by team"}});
  return NextResponse.json({ok:true});
}
