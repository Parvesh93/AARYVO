import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { verifyShopifyAccountTicket } from "@/lib/shopify-account-link";
import MarketingHeader from "../../_components/MarketingHeader";
import MarketingFooter from "../../_components/MarketingFooter";
import { confirmShopifyAccountLink } from "./action";

export const dynamic="force-dynamic";
export const metadata:Metadata={
  title:"Link Shopify account | AARYVO",
  robots:{index:false,follow:false},
  referrer:"no-referrer",
};

export default async function LinkShopifyAccountPage({
  searchParams,
}:{
  searchParams:Promise<{ticket?:string;error?:string}>;
}){
  const {ticket,error}=await searchParams;
  const proof=ticket?verifyShopifyAccountTicket(ticket):null;
  const session=await getSession();
  if(proof&&!session)redirect("/login?next="+encodeURIComponent(
    "/account/link-shopify?ticket="+encodeURIComponent(ticket!)));
  const errors:Record<string,string>={
    used:"This account link has already been used. Generate a new one in Shopify Admin.",
    disconnected:"The Shopify store is no longer connected to AARYVO. Reopen Shopify and check your installation.",
    invalid:"The account link has expired or is invalid. Generate a new one in Shopify Admin.",
  };
  return <main className="min-h-screen bg-[#f4f1e8] text-[#151515]">
    <MarketingHeader/>
    <section className="mx-auto max-w-[680px] px-5 pb-24 pt-14 md:pt-20">
      <div className="rounded-[30px] border border-black/10 bg-white p-7 shadow-xl shadow-black/5 md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/40">SECURE ACCOUNT LINKING</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] md:text-4xl">Link your Shopify workspace</h1>
        {!proof?<div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          {errors[error||""]||"This Shopify link is invalid or has expired."}
          <p className="mt-3">Open AARYVO inside Shopify Admin → Integrations → Link website login to request a fresh, 10-minute link.</p>
        </div>:<>
          {error&&<div role="alert" className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            {errors[error]||errors.invalid}
          </div>}
          <p className="mt-5 text-sm leading-7 text-black/55">
            Shopify has authorized a request to link an AARYVO website account to
            the existing AARYVO workspace for this store.
          </p>
          <div className="mt-5 space-y-3 rounded-2xl border border-black/10 bg-[#f8f9fa] p-5">
            <div><span className="text-xs text-black/40">Shopify store</span>
              <p className="mt-1 break-words text-sm font-semibold">{proof.shop}</p></div>
            <div><span className="text-xs text-black/40">Website account</span>
              <p className="mt-1 break-words text-sm font-semibold">{session?.email}</p></div>
          </div>
          <div className="mt-5 rounded-2xl border border-black/10 bg-[#fffdf5] p-5 text-xs leading-6 text-black/65">
            Your existing website business and your Shopify store remain separate workspaces.
            Linking gives this signed-in account access to the Shopify workspace,
            without combining customer records, copying products, migrating billing,
            or canceling an existing direct subscription. Shopify billing stays on Shopify.
          </div>
          <form action={confirmShopifyAccountLink} className="mt-7">
            <input type="hidden" name="ticket" value={ticket}/>
            <button type="submit" className="w-full rounded-full bg-black px-6 py-4 text-sm font-semibold text-white">
              Yes, link this account
            </button>
          </form>
        </>}
        <Link href="/dashboard/integrations" className="mt-5 inline-block text-xs font-medium text-black/50 underline underline-offset-4">
          Cancel and return to AARYVO
        </Link>
      </div>
    </section>
    <MarketingFooter/>
  </main>;
}
