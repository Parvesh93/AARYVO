import Script from "next/script";

const AGENT_ID = "cmtzgapy20003x0u6b2agrw0p";

export default function WidgetTestPage() {
  return (
    <main className="min-h-screen bg-[#f4efe7] text-[#171717]">
      <section className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
        <p className="text-sm uppercase tracking-[0.22em] text-black/45">AARYVO Widget Test</p>
        <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[0.95] tracking-[-0.055em] md:text-7xl">This page behaves like a normal external website.</h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-black/55">The AARYVO widget below is loaded through the same one-line script that will eventually be installed on PP DESIGN AND TECH, Shopify, WordPress, Next.js or any other website.</p>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {[
            ["Independent styling", "The widget uses Shadow DOM so it should not inherit this page’s visual styles."],
            ["Real AI agent", "Messages go through the public widget API and use the selected AARYVO agent knowledge."],
            ["Real conversion data", "Conversations, qualified leads and appointments should appear back in the AARYVO dashboard."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-[28px] border border-black/10 bg-white/70 p-6 backdrop-blur">
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-black/55">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 rounded-[32px] bg-[#1f332b] p-8 text-white md:p-10">
          <p className="text-sm text-white/50">Test instructions</p>
          <ol className="mt-5 space-y-3 text-base text-white/80">
            <li>1. Open the AARYVO bubble in the bottom-right corner.</li>
            <li>2. Ask about PP DESIGN AND TECH services.</li>
            <li>3. Continue as a genuine prospect and provide dummy contact details.</li>
            <li>4. Qualify strongly enough to reveal appointment booking.</li>
            <li>5. Return to the dashboard and confirm the conversation, lead and appointment counts increased.</li>
          </ol>
        </div>
      </section>

      <Script src="/widget.js" data-agent={AGENT_ID} strategy="afterInteractive" />
    </main>
  );
}
