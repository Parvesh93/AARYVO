"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

function id(key:string,session=false){const store=session?window.sessionStorage:window.localStorage;let value=store.getItem(key);if(!value){value=crypto.randomUUID();store.setItem(key,value)}return value}
export default function PlatformAnalytics(){
  const pathname=usePathname(),search=useSearchParams();
  useEffect(()=>{
    if(pathname.startsWith("/admin")||pathname.startsWith("/dashboard")||pathname.startsWith("/api"))return;
    const q=new URLSearchParams(search.toString());
    fetch("/api/analytics/pageview",{method:"POST",headers:{"content-type":"application/json"},keepalive:true,body:JSON.stringify({visitorId:id("aaryvo_visitor"),sessionId:id("aaryvo_session_visit",true),path:pathname+(search.toString()?`?${search}`:""),referrer:document.referrer||null,utmSource:q.get("utm_source"),utmMedium:q.get("utm_medium"),utmCampaign:q.get("utm_campaign"),utmContent:q.get("utm_content"),utmTerm:q.get("utm_term")})}).catch(()=>{});
  },[pathname,search]);
  return null;
}
