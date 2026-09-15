import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EmailDeliveryForm from "./EmailDeliveryForm";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage(){
  const session=await requireSession();
  const member=await prisma.businessMember.findFirst({where:{userId:session.userId},include:{business:true}});
  if(!member)notFound();
  const b=member.business;
  return <div className="mx-auto max-w-[1100px]"><p className="text-xs font-semibold uppercase tracking-[.16em] text-black/35">Workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Settings</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">Manage notifications, email delivery and booking availability for {b.name}.</p><div className="mt-7 space-y-5"><EmailDeliveryForm initial={{customSmtpEnabled:b.customSmtpEnabled,smtpHost:b.smtpHost||"",smtpPort:b.smtpPort||587,smtpSecure:b.smtpSecure,smtpUser:b.smtpUser||"",smtpFromName:b.smtpFromName||b.name,smtpFromEmail:b.smtpFromEmail||"",passwordSaved:Boolean(b.smtpPasswordEncrypted),notificationEmail:b.notificationEmail||""}}/><SettingsForm initial={{notificationEmail:b.notificationEmail,notifyNewLead:b.notifyNewLead,notifyHotLead:b.notifyHotLead,notifyAppointment:b.notifyAppointment,notifyHumanAttention:b.notifyHumanAttention,bookingTimeZone:b.bookingTimeZone,bookingSlotMinutes:b.bookingSlotMinutes,bookingStartHour:b.bookingStartHour,bookingEndHour:b.bookingEndHour,bookingDaysAhead:b.bookingDaysAhead,bookingWorkingDays:b.bookingWorkingDays}}/></div></div>
}
