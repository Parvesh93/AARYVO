"use client";

// OAuth support is not offered during the current product launch.
// Retain this component solely to make legacy references harmless.
export default function CalendarConnection() {
  return <section className="rounded-3xl border border-black/10 bg-white p-6 md:p-8">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-xl font-semibold">Google Calendar</h2>
      <span className="rounded-full bg-black/5 px-3 py-1 text-[11px] font-semibold text-black/55">Coming soon</span>
    </div>
    <p className="mt-2 text-sm leading-6 text-black/55">
      External Google Calendar connection is not available yet. Consultation requests
      and availability are managed directly in AARYVO for now.
    </p>
  </section>;
}
