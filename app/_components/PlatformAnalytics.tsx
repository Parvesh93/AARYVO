"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

function id(key:string,session=false){const store=session?window.sessionStorage:window.localStorage;let value=store.getItem(key);if(!value){value=crypto.randomUUID();store.setItem(key,value)}return value}
const marketingParams=new Set(["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","fbclid"]);
function cleanPath(pathname:string,search:string){const input=new URLSearchParams(search),output=new URLSearchParams();for(const [key,value] of input.entries()){if(marketingParams.has(key.toLowerCase()))output.set(key,value)}const qs=output.toString();return pathname+(qs?`?${qs}`:"")}
export default function PlatformAnalytics(){
  const pathname=usePathname(),search=useSearchParams();
  useEffect(()=>{
    if(pathname.startsWith("/admin")||pathname.startsWith("/dashboard")||pathname.startsWith("/api"))return;
    const q=new URLSearchParams(search.toString());
    fetch("/api/analytics/pageview",{method:"POST",headers:{"content-type":"application/json"},keepalive:true,body:JSON.stringify({visitorId:id("aaryvo_visitor"),sessionId:id("aaryvo_session_visit",true),path:cleanPath(pathname,search.toString()),referrer:document.referrer||null,utmSource:q.get("utm_source"),utmMedium:q.get("utm_medium"),utmCampaign:q.get("utm_campaign"),utmContent:q.get("utm_content"),utmTerm:q.get("utm_term")})}).catch(()=>{});
  },[pathname,search]);
  return null;
}
