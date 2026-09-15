import Link from "next/link";

export const metadata = { title: "Cancellation Policy | AARYVO", description: "Cancellation policy for AARYVO subscriptions provided by PP DESIGN AND TECH." };

const sections = [
  ["Cancelling a subscription", "You may request cancellation of recurring billing for an eligible paid AARYVO subscription from the Billing area of your account. You may also contact our support team for billing assistance."],
  ["Access after cancellation", "Unless otherwise stated, cancellation takes effect at the end of the current paid billing period. You can continue using the features and conversation limit of your current paid plan until that period ends."],
  ["After the billing period", "Once the paid billing period ends, recurring charges stop and your workspace may move to the Free plan and its applicable usage limits unless another plan has been arranged."],
  ["Downgrades", "If you downgrade to a lower paid plan, your existing higher plan remains available until the end of the current paid billing period. The lower plan is intended to begin from the next billing cycle after the required recurring payment authorization is completed."],
  ["Upgrades", "Eligible upgrades may provide higher plan access during the current billing period after successful payment or authorization. The replacement recurring subscription is intended to apply from the next billing cycle."],
  ["Support", "For cancellation or subscription questions, email ppdesignandtech@gmail.com from the email associated with your AARYVO account."],
];

export default function CancellationPolicyPage(){return <main className="min-h-screen bg-[#f6f7fb] px-6 py-10 md:px-10"><div className="mx-auto max-w-3xl"><Link href="/" className="text-sm font-semibold tracking-[.22em]">AARYVO</Link><p className="mt-16 text-xs font-semibold uppercase tracking-[.16em] text-black/35">Legal</p><h1 className="mt-3 text-5xl font-semibold tracking-[-.05em]">Cancellation Policy</h1><p className="mt-4 text-sm text-black/45">Effective: 16 September 2026</p><p className="mt-8 text-base leading-7 text-black/60">AARYVO subscriptions are provided by <strong>PP DESIGN AND TECH</strong>. This policy explains how cancellations and plan changes are handled.</p><div className="mt-10 space-y-9">{sections.map(([title,body])=><section key={title}><h2 className="text-lg font-semibold">{title}</h2><p className="mt-3 text-sm leading-7 text-black/55">{body}</p></section>)}</div><div className="mt-14 border-t border-black/[.07] pt-7 text-sm text-black/45">Billing entity: <strong className="text-black/70">PP DESIGN AND TECH</strong> · GSTIN: 07CQXPP5370D1ZB · <Link href="/contact" className="text-black underline underline-offset-4">Contact us</Link></div></div></main>}
