import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, ShoppingBag, Globe2, ShieldCheck } from "lucide-react";
import MarketingFooter from "../_components/MarketingFooter";
import MarketingHeader from "../_components/MarketingHeader";

function shopifyInstallationUrl() {
  // Do not invent a Shopify App Store listing for a development app.
  const explicit=process.env.SHOPIFY_APP_STORE_URL?.trim();
  if(explicit){
    try {
      const url=new URL(explicit);
      if(url.protocol==="https:"&&url.hostname==="apps.shopify.com"&&
        url.pathname!=="/"&&!url.username&&!url.password)
        return url.toString();
    } catch {}
  }
  const handle=process.env.SHOPIFY_APP_HANDLE?.trim();
  if(handle&&/^[a-z0-9][a-z0-9-]{1,80}$/.test(handle))
    return "https://apps.shopify.com/"+handle;
  return null;
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{next?:string}>;
}) {
  const {next}=await searchParams;
  // Preserve verified first-party callbacks that expect a normal website login
  // after signing up. Shopify install never needs an AARYVO password.
  if(next?.startsWith("/")&&!next.startsWith("//"))
    redirect("/signup/website?next="+encodeURIComponent(next));
  const install=shopifyInstallationUrl();
  return <main className="min-h-screen bg-[#f4f1e8] text-[#151515]">
    <MarketingHeader/>
    <section className="mx-auto max-w-[1130px] px-5 pb-20 pt-14 md:px-8 md:pb-28 md:pt-20">
      <div className="mx-auto max-w-[690px] text-center">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-black/40">GET STARTED WITH AARYVO</p>
        <h1 className="premium-display mt-4 text-4xl font-semibold leading-[1.06] tracking-[-.055em] sm:text-6xl">
          One AI shopping assistant. The right setup for your store.
        </h1>
        <p className="mx-auto mt-5 max-w-[570px] text-base leading-7 text-black/55">
          Choose your website platform and we'll guide you through the correct installation and billing process.
        </p>
      </div>
      <div className="mt-11 grid gap-5 md:grid-cols-2">
        <article className="flex flex-col rounded-[30px] border border-black/10 bg-[#f9f7f1] p-7 shadow-[0_18px_55px_rgba(0,0,0,.045)] sm:p-9">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#e6f1df] text-[#327f53]"><ShoppingBag size={26}/></span>
          <span className="mt-7 text-xs font-semibold uppercase tracking-[.15em] text-black/40">FOR SHOPIFY STORES</span>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-.035em]">Connect through Shopify</h2>
          <p className="mt-3 text-sm leading-7 text-black/55">
            Install AARYVO directly from Shopify, authorize your store, and choose your subscription through Shopify App Pricing.
          </p>
          <div className="mt-6 space-y-3 text-sm text-black/65">
            <p className="flex items-center gap-2"><CheckCircle2 size={17} className="text-[#40845b]"/> No separate AARYVO signup</p>
            <p className="flex items-center gap-2"><CheckCircle2 size={17} className="text-[#40845b]"/> Billing stays inside Shopify</p>
            <p className="flex items-center gap-2"><CheckCircle2 size={17} className="text-[#40845b]"/> Manage your assistant from Shopify Admin</p>
          </div>
          <div className="mt-auto pt-9">
            {install?<a href={install} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#171b20] px-6 py-4 text-sm font-semibold text-white" rel="noopener noreferrer">
              Continue to Shopify <ArrowRight size={16}/>
            </a>:<div className="rounded-2xl border border-amber-200 bg-[#fff9e9] px-4 py-4 text-sm leading-6 text-amber-950">
              Shopify public installation is not available yet. Contact our team for assistance.
              <Link className="ml-1 font-semibold underline" href="/contact">Contact AARYVO →</Link>
            </div>}
            <p className="mt-3 text-center text-xs leading-5 text-black/40">Your Shopify account handles installation and authorization.</p>
          </div>
        </article>
        <article className="flex flex-col rounded-[30px] border border-black/10 bg-white p-7 shadow-[0_18px_55px_rgba(0,0,0,.04)] sm:p-9">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#eff0f3] text-[#3f4b5e]"><Globe2 size={26}/></span>
          <span className="mt-7 text-xs font-semibold uppercase tracking-[.15em] text-black/40">FOR OTHER WEBSITES</span>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-.035em]">Create your AARYVO workspace</h2>
          <p className="mt-3 text-sm leading-7 text-black/55">
            Using WordPress, WooCommerce, a custom website, or another platform? Create your account and set up your AI assistant.
          </p>
          <div className="mt-6 space-y-3 text-sm text-black/65">
            <p className="flex items-center gap-2"><CheckCircle2 size={17} className="text-[#40845b]"/> Create your website workspace</p>
            <p className="flex items-center gap-2"><CheckCircle2 size={17} className="text-[#40845b]"/> Configure your assistant</p>
            <p className="flex items-center gap-2"><CheckCircle2 size={17} className="text-[#40845b]"/> Manage your plan directly with AARYVO</p>
          </div>
          <div className="mt-auto pt-9">
            <Link href="/signup/website" className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-black/15 bg-white px-6 py-4 text-sm font-semibold text-black">
              Create an account <ArrowRight size={16}/>
            </Link>
            <p className="mt-3 text-center text-xs text-black/40">Start with the available free website plan.</p>
          </div>
        </article>
      </div>
      <div className="mx-auto mt-9 max-w-[770px] rounded-2xl border border-black/10 bg-white/75 p-5 text-center">
        <div className="flex items-center justify-center gap-2 text-sm font-semibold"><ShieldCheck size={18}/> Already have an AARYVO account?</div>
        <p className="mt-2 text-xs leading-6 text-black/55">
          Sign in to your existing account instead of registering again. After installing AARYVO on Shopify,
          you can securely link your Shopify workspace from its Integrations page.
          Linking never transfers an active subscription automatically.
        </p>
        <Link className="mt-3 inline-block text-sm font-semibold underline underline-offset-4" href="/login">Sign in →</Link>
      </div>
    </section>
    <MarketingFooter/>
  </main>;
}
