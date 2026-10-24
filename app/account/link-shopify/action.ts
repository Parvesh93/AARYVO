"use server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { redeemShopifyAccountTicket } from "@/lib/shopify-account-link";

export async function confirmShopifyAccountLink(form:FormData) {
  const session=await getSession();
  const token=form.get("ticket");
  if(!session)redirect("/login");
  if(typeof token!=="string"||token.length>1500)
    redirect("/account/link-shopify?error=invalid");
  try{
    await redeemShopifyAccountTicket(token,session.userId);
  }catch(error){
    const reason=error instanceof Error?error.message:"";
    const code=reason==="USED"?"used":reason==="NOT_CONNECTED"?"disconnected":"invalid";
    redirect("/account/link-shopify?ticket="+encodeURIComponent(token)+"&error="+code);
  }
  redirect("/dashboard/integrations?accountLink=success");
}
