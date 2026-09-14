import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { isGoogleOAuthConfigured } from "@/lib/google-oauth";
import { prisma } from "@/lib/prisma";
import CalendarConnection from "./CalendarConnection";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage(){const session=await requireSession();const member=await prisma.businessMember.findFirst({where:{userId:session.userId},include:{business:true}});if(!member)notFound();const b=member.business;return <main className="min-h-screen bg-[#f6f6f3] text-[#111319]"><div className="mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-12"><div className="mb-9"><Link href="/dashboard" className="text-sm text-black/50 hover:text-black">← Dashboard</Link><p className="mt-7 text-xs font-bold tracking-[.22em]">AARYVO</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Workspace settings</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-black/55">Control how {b.name} receives lead alerts, manages availability and connects its calendar.</p></div><div className="space-y-8"><CalendarConnection connected={Boolean(b.googleRefreshToken&&b.googleCalendarId)} accountEmail={b.googleAccountEmail} calendarName={b.googleCalendarName} oauthReady={isGoogleOAuthConfigured()}/><SettingsForm initial={{notificationEmail:b.notificationEmail,bookingTimeZone:b.bookingTimeZone,bookingSlotMinutes:b.bookingSlotMinutes,bookingStartHour:b.bookingStartHour,bookingEndHour:b.bookingEndHour,bookingDaysAhead:b.bookingDaysAhead,bookingWorkingDays:b.bookingWorkingDays}}/></div></div></main>}
