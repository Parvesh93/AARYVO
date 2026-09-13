import { prisma } from "@/lib/prisma";
import { getGoogleBusyIntervals, isGoogleCalendarConfigured } from "@/lib/google-calendar";

const TIME_ZONE = process.env.BOOKING_TIMEZONE || "Asia/Kolkata";
const SLOT_MINUTES = Math.max(15, Math.min(120, Number(process.env.BOOKING_SLOT_MINUTES || 30)));
const START_HOUR = Math.max(0, Math.min(23, Number(process.env.BOOKING_START_HOUR || 10)));
const END_HOUR = Math.max(1, Math.min(24, Number(process.env.BOOKING_END_HOUR || 18)));
const DAYS_AHEAD = Math.max(1, Math.min(30, Number(process.env.BOOKING_DAYS_AHEAD || 7)));
const WORKING_DAYS = new Set((process.env.BOOKING_WORKING_DAYS || "1,2,3,4,5").split(",").map((v) => Number(v.trim())).filter((v) => v >= 0 && v <= 6));

function partsInZone(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, weekday: "short" }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
}
function offsetMinutes(date: Date) { const p=partsInZone(date); return Math.round((Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second))-date.getTime())/60000); }
function zonedDateToUtc(year:number,month:number,day:number,hour:number,minute:number){const guess=new Date(Date.UTC(year,month-1,day,hour,minute,0));return new Date(guess.getTime()-offsetMinutes(guess)*60000);}
function addCalendarDays(year:number,month:number,day:number,amount:number){const d=new Date(Date.UTC(year,month-1,day+amount,12));return{year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),weekday:d.getUTCDay()};}

export type BookingSlot={startsAt:string;label:string;dateLabel:string};

export async function getAvailableSlots(businessId:string):Promise<BookingSlot[]>{
  const now=new Date(); const zoned=partsInZone(now); const base={year:Number(zoned.year),month:Number(zoned.month),day:Number(zoned.day)}; const windowEnd=new Date(now.getTime()+(DAYS_AHEAD+2)*86400000);
  const existing=await prisma.appointment.findMany({where:{businessId,startsAt:{gte:now,lte:windowEnd},status:{not:"CANCELLED"}},select:{startsAt:true}});
  const booked=new Set(existing.map(a=>a.startsAt.getTime()));
  let googleBusy:Array<{start:Date;end:Date}>=[];
  if(isGoogleCalendarConfigured()){
    try{googleBusy=await getGoogleBusyIntervals(now,windowEnd);}catch(error){console.error("AARYVO Google Calendar availability error",error);}
  }
  const slots:BookingSlot[]=[];
  for(let offset=0;offset<DAYS_AHEAD;offset++){
    const date=addCalendarDays(base.year,base.month,base.day,offset); if(!WORKING_DAYS.has(date.weekday))continue;
    for(let minutes=START_HOUR*60;minutes+SLOT_MINUTES<=END_HOUR*60;minutes+=SLOT_MINUTES){
      const start=zonedDateToUtc(date.year,date.month,date.day,Math.floor(minutes/60),minutes%60); const end=new Date(start.getTime()+SLOT_MINUTES*60000);
      if(start.getTime()<now.getTime()+30*60000||booked.has(start.getTime()))continue;
      if(googleBusy.some(busy=>start<busy.end&&end>busy.start))continue;
      slots.push({startsAt:start.toISOString(),label:new Intl.DateTimeFormat("en-IN",{timeZone:TIME_ZONE,hour:"numeric",minute:"2-digit",hour12:true}).format(start),dateLabel:new Intl.DateTimeFormat("en-IN",{timeZone:TIME_ZONE,weekday:"short",day:"numeric",month:"short"}).format(start)});
    }
  }
  return slots;
}
export async function isSlotAvailable(businessId:string,startsAt:Date){const slots=await getAvailableSlots(businessId);return slots.some(slot=>slot.startsAt===startsAt.toISOString());}
export const bookingSettings={timeZone:TIME_ZONE,slotMinutes:SLOT_MINUTES};
