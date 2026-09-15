import MarketingFooter from "./MarketingFooter";
import MarketingHeader from "./MarketingHeader";

export default function LegalPage({ eyebrow = "Legal", title, effective, intro, sections, footerNote }: { eyebrow?: string; title: string; effective: string; intro: React.ReactNode; sections: Array<[string, React.ReactNode]>; footerNote?: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f4f1e8] text-[#151515]">
      <MarketingHeader />
      <section className="px-5 pb-20 pt-16 md:px-8 md:pb-28 md:pt-24">
        <div className="mx-auto max-w-[1180px]">
          <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr]">
            <div className="lg:sticky lg:top-32 lg:self-start">
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/35">{eyebrow}</p>
              <h1 className="premium-display mt-4 text-5xl font-semibold leading-[.94] tracking-[-.055em] sm:text-6xl">{title}</h1>
              <p className="mt-5 inline-flex rounded-full bg-[#ffdf67] px-4 py-2 text-xs font-medium">Effective {effective}</p>
            </div>
            <div>
              <div className="rounded-[32px] bg-[#171717] p-7 text-white md:p-10"><p className="max-w-2xl text-lg leading-8 text-white/65">{intro}</p></div>
              <div className="mt-4 overflow-hidden rounded-[32px] border border-black/10 bg-[#f9f7f1]">
                {sections.map(([heading, body], index) => <section key={heading} className="grid gap-4 border-b border-black/[.07] p-6 last:border-0 md:grid-cols-[48px_1fr] md:p-8"><div className="text-xs font-semibold text-black/25">{String(index + 1).padStart(2, "0")}</div><div><h2 className="text-xl font-semibold tracking-[-.025em]">{heading}</h2><div className="mt-3 text-sm leading-7 text-black/55">{body}</div></div></section>)}
              </div>
              {footerNote ? <div className="mt-5 rounded-[24px] bg-[#ffdf67] px-6 py-5 text-sm leading-6 text-black/65">{footerNote}</div> : null}
            </div>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}
