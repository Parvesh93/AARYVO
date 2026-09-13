import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function membership(){const session=await getSession();if(!session)return null;return prisma.businessMember.findFirst({where:{userId:session.userId},include:{business:true}});}
function validTimeZone(value:string){try{new Intl.DateTimeFormat("en-US",{timeZone:value});return true;}catch{return false;}}

export async function GET(){const member=await membership();if(!member)return NextResponse.json({error:"Unauthorized"},{status:401});const b=member.business;return NextResponse.json({settings:{notificationEmail:b.notificationEmail,bookingTimeZone:b.bookingTimeZone,bookingSlotMinutes:b.bookingSlotMinutes,bookingStartHour:b.bookingStartHour,bookingEndHour:b.bookingEndHour,bookingDaysAhead:b.bookingDaysAhead,bookingWorkingDays:b.bookingWorkingDays}});}

export async function PUT(request:Request){
  const member=await membership();if(!member)return NextResponse.json({error:"Unauthorized"},{status:401});
  try{
    const body=await request.json();const notificationEmail=String(body.notificationEmail||"").trim()||null;const bookingTimeZone=String(body.bookingTimeZone||"").trim();const bookingSlotMinutes=Number(body.bookingSlotMinutes);const bookingStartHour=Number(body.bookingStartHour);const bookingEndHour=Number(body.bookingEndHour);const bookingDaysAhead=Number(body.bookingDaysAhead);const days=Array.isArray(body.bookingWorkingDays)?body.bookingWorkingDays.map(Number):String(body.bookingWorkingDays||"").split(",").map(Number);const uniqueDays=[...new Set(days.filter(d=>Number.isInteger(d)&&d>=0&&d<=6))].sort();
    if(notificationEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmail))return NextResponse.json({error:"Enter a valid notification email."},{status:400});if(!validTimeZone(bookingTimeZone))return NextResponse.json({error:"Choose a valid timezone."},{status:400});if(![15,30,45,60].includes(bookingSlotMinutes))return NextResponse.json({error:"Slot duration must be 15, 30, 45 or 60 minutes."},{status:400});if(!Number.isInteger(bookingStartHour)||!Number.isInteger(bookingEndHour)||bookingStartHour<0||bookingEndHour>24||bookingStartHour>=bookingEndHour)return NextResponse.json({error:"Choose valid business hours."},{status:400});if(!Number.isInteger(bookingDaysAhead)||bookingDaysAhead<1||bookingDaysAhead>30)return NextResponse.json({error:"Booking window must be between 1 and 30 days."},{status:400});if(!uniqueDays.length)return NextResponse.json({error:"Select at least one working day."},{status:400});
    const updated=await prisma.business.update({where:{id:member.businessId},data:{notificationEmail,bookingTimeZone,bookingSlotMinutes,bookingStartHour,bookingEndHour,bookingDaysAhead,bookingWorkingDays:uniqueDays.join(",")}});return NextResponse.json({ok:true,settings:updated});
  }catch(error){console.error("AARYVO settings update error",error);return NextResponse.json({error:"Settings could not be saved."},{status:500});}
}
