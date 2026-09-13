import { prisma } from "@/lib/prisma";
import { getGoogleBusyIntervals, isGoogleCalendarConfigured } from "@/lib/google-calendar";

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
}
function offsetMinutes(date: Date,timeZone:string){const p=partsInZone(date,timeZone);return Math.round((Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second))-date.getTime())/60000);}
function zonedDateToUtc(year:number,month:number,day:number,hour:number,minute:number,timeZone:string){const guess=new Date(Date.UTC(year,month-1,day,hour,minute));return new Date(guess.getTime()-offsetMinutes(guess,timeZone)*60000);}
function addCalendarDays(year:number,month:number,day:number,amount:number){const d=new Date(Date.UTC(year,month-1,day+amount,12));return{year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),weekday:d.getUTCDay()};}

export type BookingSlot={startsAt:string;label:string;dateLabel:string};
export type BookingSettings={timeZone:string;slotMinutes:number;startHour:number;endHour:number;daysAhead:number;workingDays:Set<number>};

export async function getBusinessBookingSettings(businessId:string):Promise<BookingSettings>{
  const business=await prisma.business.findUnique({where:{id:businessId},select:{bookingTimeZone:true,bookingSlotMinutes:true,bookingStartHour:true,bookingEndHour:true,bookingDaysAhead:true,bookingWorkingDays:true}});
  if(!business)throw new Error("Business not found");
  return{timeZone:business.bookingTimeZone,slotMinutes:business.bookingSlotMinutes,startHour:business.bookingStartHour,endHour:business.bookingEndHour,daysAhead:business.bookingDaysAhead,workingDays:new Set(business.bookingWorkingDays.split(",").map(Number))};
}

export async function getAvailableSlots(businessId:string):Promise<BookingSlot[]>{
  const settings=await getBusinessBookingSettings(businessId); const {timeZone,slotMinutes,startHour,endHour,daysAhead,workingDays}=settings;
  const now=new Date();const zoned=partsInZone(now,timeZone);const base={year:Number(zoned.year),month:Number(zoned.month),day:Number(zoned.day)};const windowEnd=new Date(now.getTime()+(daysAhead+2)*86400000);
  const existing=await prisma.appointment.findMany({where:{businessId,startsAt:{gte:now,lte:windowEnd},status:{not:"CANCELLED"}},select:{startsAt:true}});const booked=new Set(existing.map(a=>a.startsAt.getTime()));
  let googleBusy:Array<{start:Date;end:Date}>=[];if(isGoogleCalendarConfigured()){try{googleBusy=await getGoogleBusyIntervals(now,windowEnd);}catch(error){console.error("AARYVO Google Calendar availability error",error);}}
  const slots:BookingSlot[]=[];
  for(let offset=0;offset<daysAhead;offset++){const date=addCalendarDays(base.year,base.month,base.day,offset);if(!workingDays.has(date.weekday))continue;for(let minutes=startHour*60;minutes+slotMinutes<=endHour*60;minutes+=slotMinutes){const start=zonedDateToUtc(date.year,date.month,date.day,Math.floor(minutes/60),minutes%60,timeZone);const end=new Date(start.getTime()+slotMinutes*60000);if(start.getTime()<now.getTime()+30*60000||booked.has(start.getTime()))continue;if(googleBusy.some(busy=>start<busy.end&&end>busy.start))continue;slots.push({startsAt:start.toISOString(),label:new Intl.DateTimeFormat("en-IN",{timeZone,hour:"numeric",minute:"2-digit",hour12:true}).format(start),dateLabel:new Intl.DateTimeFormat("en-IN",{timeZone,weekday:"short",day:"numeric",month:"short"}).format(start)});}}
  return slots;
}
export async function isSlotAvailable(businessId:string,startsAt:Date){const slots=await getAvailableSlots(businessId);return slots.some(slot=>slot.startsAt===startsAt.toISOString());}
