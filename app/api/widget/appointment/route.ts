import { NextResponse } from "next/server";
import { getBusinessBookingSettings, isSlotAvailable } from "@/lib/availability";
import { createGoogleCalendarEvent, isGoogleCalendarConfigured } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";
import { sendLeadNotification } from "@/lib/notifications";
import { corsHeadersFor, isAllowedWidgetOrigin, rateLimitWidget } from "@/lib/widget-security";

export async function OPTIONS(request: Request) { return new NextResponse(null, { status: 204, headers: corsHeadersFor(request) }); }
export async function POST(request: Request) {
  const headers=corsHeadersFor(request);
  try{
    const rate=rateLimitWidget(request,"widget-appointment",8,60*60*1000);if(!rate.allowed)return NextResponse.json({error:"Too many booking attempts. Please try again later."},{status:429,headers});
    const body=await request.json();const agentId=typeof body.agentId==="string"?body.agentId:"";const visitorId=typeof body.visitorId==="string"?body.visitorId.slice(0,190):"";const conversationId=typeof body.conversationId==="string"?body.conversationId:"";const startsAt=new Date(typeof body.startsAt==="string"?body.startsAt:"");
    if(!agentId||!visitorId||!conversationId||Number.isNaN(startsAt.getTime())||startsAt.getTime()<=Date.now())return NextResponse.json({error:"Please choose a valid future date and time."},{status:400,headers});
    const conversation=await prisma.conversation.findFirst({where:{id:conversationId,agentId,visitorId},include:{agent:{include:{business:true}},lead:true}});if(!conversation?.agent.isActive)return NextResponse.json({error:"Conversation not found."},{status:404,headers});if(!isAllowedWidgetOrigin(request,conversation.agent.business.websiteUrl))return NextResponse.json({error:"This website is not authorized to use this AARYVO agent."},{status:403,headers});if(!conversation.lead?.name||(!conversation.lead.phone&&!conversation.lead.email))return NextResponse.json({error:"Contact details are required before booking."},{status:400,headers});
    if(!(await isSlotAvailable(conversation.agent.businessId,startsAt)))return NextResponse.json({error:"That time is no longer available. Please choose another slot."},{status:409,headers});
    const settings=await getBusinessBookingSettings(conversation.agent.businessId);
    const appointment=await prisma.appointment.create({data:{businessId:conversation.agent.businessId,leadId:conversation.lead.id,startsAt,status:"REQUESTED",notes:conversation.lead.requirement}});await prisma.lead.update({where:{id:conversation.lead.id},data:{status:"QUALIFIED",score:Math.max(conversation.lead.score,85)}});
    void sendLeadNotification({businessId:conversation.agent.businessId,leadId:conversation.lead.id,event:"APPOINTMENT",appointmentAt:startsAt});
    if(isGoogleCalendarConfigured())void createGoogleCalendarEvent({businessName:conversation.agent.business.name,leadName:conversation.lead.name,leadEmail:conversation.lead.email,leadPhone:conversation.lead.phone,requirement:conversation.lead.requirement,startsAt,durationMinutes:settings.slotMinutes,timeZone:settings.timeZone}).catch(error=>console.error("AARYVO Google Calendar event error",error));
    return NextResponse.json({appointment:{id:appointment.id,startsAt:appointment.startsAt,status:appointment.status}},{headers});
  }catch(error){console.error("AARYVO widget appointment error",error);return NextResponse.json({error:"Appointment could not be booked."},{status:500,headers});}
}
