(() => {
const script=document.currentScript;if(!script||script.dataset.aaryvoLoaded==="true")return;script.dataset.aaryvoLoaded="true";const agentId=script.dataset.agent;if(!agentId)return;const base=new URL(script.src).origin,key=`aaryvo:${agentId}:visitor`,conversationKey=`aaryvo:${agentId}:conversation`,richKey=`aaryvo:${agentId}:rich`;let visitorId=localStorage.getItem(key);if(!visitorId){visitorId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;localStorage.setItem(key,visitorId)}let conversationId=localStorage.getItem(conversationKey),lead=null,contactCaptured=false,busy=false;let config={title:"AARYVO",subtitle:"AI sales agent online",welcomeMessage:"Hi 👋 Thanks for sharing your details. How can I help you today?",startLabel:"Start conversation →",bookLabel:"Book a consultation",bookingEnabled:false,whatsappEnabled:false,whatsappNumber:"",whatsappLabel:"Continue on WhatsApp",whatsappMessage:"Hi, I would like to continue our conversation on WhatsApp.",accentColor:"#111319",theme:"LIGHT",position:"RIGHT",launcherStyle:"SPARKLE",launcherLabel:"Chat with us",launcherAnimation:"PULSE",launcherLabelEnabled:true,showPoweredBy:true,bookingScoreThreshold:65,conversationMode:"LEAD_FIRST"};
function aaryvoCommerceAllowed(){
  if(!window.Shopify)return false;
  try{
    const privacy=window.Shopify.customerPrivacy;
    return !privacy||typeof privacy.analyticsProcessingAllowed!=="function"||
      privacy.analyticsProcessingAllowed()===true;
  }catch{return false}
}
function sendShopifyFunnelEvent(eventType,token){
  if(!aaryvoCommerceAllowed()||typeof token!=="string"||token.length>900||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))return;
  fetch(base+"/api/widget/commerce-event",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({agentId,eventType,token}),keepalive:true
  }).catch(()=>{});
}
function attachShopifyCheckoutRef(){
  if(!window.Shopify)return;
  const isProduct=location.pathname.includes("/products/");
  const valid=v=>typeof v==="string"&&v.length<900&&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(v);
  const storageKey="aaryvo:product-ref";
  const hashRef=isProduct?new URLSearchParams(location.hash.slice(1)).get("aaryvo_ref"):null;
  let saved=null;
  try{
    if(valid(hashRef)){
      saved={path:location.pathname,value:hashRef,at:Date.now()};
      sessionStorage.setItem(storageKey,JSON.stringify(saved));
      history.replaceState(history.state,"",location.pathname+location.search);
    }else{
      const previous=JSON.parse(sessionStorage.getItem(storageKey)||"null");
      if(previous&&valid(previous.value)&&Date.now()-Number(previous.at)<604800000)
        saved=previous;
    }
  }catch{}
  if(!saved)return;
  const token=saved.value;
  const root=String(window.Shopify.routes?.root||"/");
  const cartUrl=(root.endsWith("/")?root:root+"/")+"cart.js";
  let checking=false;
  let alreadyReported=false;
  function checkCart(){
    if(checking||alreadyReported||!aaryvoCommerceAllowed())return;
    checking=true;
    fetch(cartUrl,{credentials:"same-origin",cache:"no-store"})
      .then(r=>r.ok?r.json():null)
      .then(cart=>{
        if(!Array.isArray(cart?.items))return;
        // Count only confirmed Shopify cart items carrying this exact signed
        // product-line reference. A stale cart attribute alone isn't enough.
        if(cart.items.some(item=>item.quantity>0&&
            item.properties?._aaryvo_attribution===token)){
          alreadyReported=true;
          sendShopifyFunnelEvent("ADD_TO_CART",token);
        }
      }).catch(()=>{}).finally(()=>{checking=false});
  }
  setTimeout(checkCart,450);
  window.addEventListener("pageshow",checkCart);
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible")checkCart();
  });
  if(!isProduct||saved.path!==location.pathname)return;
  function update(){
    document.querySelectorAll('form[action*="/cart/add"]').forEach(form=>{
      if(!form.querySelector('input[name="id"]'))return;
      let field=form.querySelector('input[name="properties[_aaryvo_attribution]"]');
      if(!field){
        field=document.createElement("input");
        field.type="hidden";
        field.name="properties[_aaryvo_attribution]";
        form.appendChild(field);
      }
      if(field.value!==token)field.value=token;
    });
  }
  update();
  document.addEventListener("submit",event=>{
    const form=event.target;
    if(form instanceof HTMLFormElement&&form.matches('form[action*="/cart/add"]')){
      update();
      setTimeout(checkCart,700);
      setTimeout(checkCart,1900);
    }
  },true);
  document.addEventListener("shopify:section:load",update);
  let scheduled=false;
  new MutationObserver(()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;update()});
  }).observe(document.body,{childList:true,subtree:true});
}
attachShopifyCheckoutRef();
const host=document.createElement("div");host.setAttribute("data-aaryvo-root","true");host.style.setProperty("display","block","important");host.style.setProperty("position","fixed","important");host.style.setProperty("inset","0","important");host.style.setProperty("width","0","important");host.style.setProperty("height","0","important");host.style.setProperty("overflow","visible","important");host.style.setProperty("visibility","visible","important");host.style.setProperty("opacity","1","important");host.style.setProperty("z-index","2147483647","important");host.style.setProperty("pointer-events","none","important");document.body.appendChild(host);const root=host.attachShadow({mode:"open"});root.innerHTML=`<style>*{box-sizing:border-box}button,input{font:inherit}.launcher-wrap{pointer-events:auto;position:fixed;right:22px;bottom:22px;z-index:2147483647;display:flex;align-items:center;gap:10px}.launcher-wrap.chat-open{visibility:hidden;opacity:0;pointer-events:none}.launcher-wrap.chat-open .launcher{animation:none!important}.left .launcher-wrap{left:22px;right:auto;flex-direction:row-reverse}.launcher-label{background:#fff;color:#17191f;border:1px solid rgba(0,0,0,.06);box-shadow:0 8px 28px rgba(0,0,0,.14);border-radius:999px;padding:10px 14px;font:700 12px Arial,sans-serif;white-space:nowrap;animation:labelIn .45s ease both}.launcher{position:relative;width:58px;height:58px;border:0;border-radius:50%;background:var(--accent);color:#fff;cursor:pointer;box-shadow:0 14px 40px rgba(0,0,0,.22);font-size:22px}.launcher.text{width:auto;padding:0 19px;font-size:12px;font-weight:700}.anim-pulse:before,.anim-glow:before{content:"";position:absolute;inset:-1px;border-radius:inherit;border:2px solid var(--accent);animation:ring 2.2s ease-out infinite}.anim-glow{animation:glow 2s ease-in-out infinite}.anim-bounce{animation:bounce 2.4s ease-in-out infinite}@keyframes ring{0%{transform:scale(1);opacity:.55}75%,100%{transform:scale(1.45);opacity:0}}@keyframes glow{0%,100%{box-shadow:0 14px 40px rgba(0,0,0,.22),0 0 0 0 var(--accent)}50%{box-shadow:0 14px 40px rgba(0,0,0,.22),0 0 22px 5px var(--accent)}}@keyframes bounce{0%,72%,100%{transform:translateY(0)}82%{transform:translateY(-8px)}91%{transform:translateY(0)}96%{transform:translateY(-3px)}}@keyframes labelIn{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:none}}.panel{pointer-events:auto;position:fixed;right:22px;bottom:22px;width:min(410px,calc(100vw - 28px));height:min(700px,calc(100vh - 44px));background:#fff;border-radius:24px;box-shadow:0 22px 70px rgba(0,0,0,.22);z-index:2147483647;display:none;overflow:hidden;font-family:Arial,sans-serif;color:#111319}.left .panel{left:22px;right:auto}.panel.open{display:flex;flex-direction:column}.head{background:var(--accent);color:#fff;padding:18px 20px;display:flex;justify-content:space-between}.brand{font-size:13px;letter-spacing:.12em;font-weight:700}.status{font-size:11px;color:#ffffffb8;margin-top:2px}.prechat{flex:1;overflow:auto;padding:24px;background:#f6f7fb}.prechat h3{font-size:24px;margin:0 0 8px}.prechat p{font-size:13px;line-height:1.5;color:#68707d}.field{display:block;margin:0 0 12px}.field span{display:block;font-size:12px;font-weight:600;margin-bottom:6px}.field input{width:100%;border:1px solid #dfe2e7;border-radius:13px;padding:12px 13px}.start,.book,.send{background:var(--accent)!important;color:#fff}.start{width:100%;border:0;border-radius:14px;padding:13px;font-weight:600}.preerror{font-size:12px!important;color:#b42318!important}.privacy{font-size:10px!important;color:#969ba5!important}.chat{display:none;min-height:0;flex:1;flex-direction:column}.chat.show{display:flex}.messages{flex:1;overflow:auto;padding:18px;background:#f6f7fb;scroll-behavior:smooth}.message-wrap{margin-bottom:13px}.user-wrap{display:flex;justify-content:flex-end}.msg{max-width:88%;padding:11px 14px;border-radius:18px;font-size:14px;line-height:1.5}.ai{background:#fff;border-bottom-left-radius:5px}.user{background:var(--accent);color:#fff;border-bottom-right-radius:5px}.rich p{margin:0 0 8px}.rich p:last-child{margin:0}.rich ul{padding-left:18px}.rich a{color:var(--accent);font-weight:650}.choice-row{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}.choice{border:1px solid #dfe2e7;background:#fff;border-radius:999px;padding:8px 12px;font-size:11px;font-weight:650;cursor:pointer}.choice:hover{border-color:var(--accent)}.quick-start{padding:0 18px 14px;background:#f6f7fb}.quick-start-title{font-size:10px;font-weight:700;color:#8a9099;margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em}.quick-start-row{display:flex;gap:7px;overflow-x:auto;padding-bottom:2px}.quick-start-row .choice{flex:0 0 auto}.choice.primary{border-radius:11px}.cards{display:grid;gap:8px;margin-top:9px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:15px;padding:13px}.card-title{font-size:12px;font-weight:750}.card-desc{font-size:11px;color:#68707d;margin-top:4px}.card-action{margin-top:9px;border:0;background:none;color:var(--accent);font-size:11px;font-weight:750;cursor:pointer}.product-carousel{display:flex;gap:10px;overflow-x:auto;margin-top:10px;padding:1px 1px 8px;scroll-snap-type:x mandatory;scrollbar-width:thin}.product-carousel::-webkit-scrollbar{height:5px}.product-carousel::-webkit-scrollbar-thumb{background:#d4d7dc;border-radius:999px}.product-card{flex:0 0 148px;scroll-snap-align:start;overflow:hidden;border:1px solid #e5e7eb;border-radius:14px;background:#fff;box-shadow:0 3px 12px rgba(0,0,0,.04)}.product-img{display:block;width:100%;height:104px;object-fit:cover;background:#f2f3f5}.product-body{padding:9px}.product-title{font-size:11px;font-weight:750;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:29px}.product-price{margin-top:5px;font-size:11px;font-weight:800}.product-stock{margin-top:3px;font-size:9px;color:#68707d}.product-link{display:flex;align-items:center;justify-content:center;height:32px;margin-top:8px;border-radius:9px;background:var(--accent);color:#fff!important;padding:0 9px;font:750 9px Arial,sans-serif;text-decoration:none;white-space:nowrap}.dark .product-card{background:#30343c;border-color:#424751}.dark .product-stock{color:#aab0ba}.thinking{display:inline-flex;gap:4px}.dot{width:5px;height:5px;border-radius:50%;background:#a4a9b2;animation:dots 1.1s infinite}.dot:nth-child(2){animation-delay:.16s}.dot:nth-child(3){animation-delay:.32s}@keyframes dots{0%,60%,100%{opacity:.3}30%{opacity:1;transform:translateY(-3px)}}.composer{padding:12px;border-top:1px solid #eee;display:flex;gap:8px}.composer input{flex:1;min-width:0;border:1px solid #ddd;border-radius:999px;padding:11px 14px}.send{border:0;border-radius:999px;padding:0 15px}.actions{display:none;gap:8px;padding:0 18px 12px}.actions.show{display:flex}.book,.whatsapp{flex:1;padding:11px;border-radius:14px;font-size:12px;font-weight:700}.book{border:0}.whatsapp{display:none;border:1px solid #20a95b;background:#fff;color:#128c4b}.whatsapp.show{display:block}.booking{display:none;padding:0 18px 14px}.booking.show{display:block}.booking-head{display:flex;justify-content:space-between;margin-bottom:9px}.booking-title{font-size:12px;font-weight:700}.booking-zone{font-size:10px;color:#8a9099}.slots{display:flex;gap:7px;overflow:auto}.slot{border:1px solid #dfe2e7;background:#fff;border-radius:11px;padding:8px 10px}.slot b,.slot span{display:block;font-size:11px}.slot span{font-size:10px;color:#737984}.slot-empty{font-size:12px;color:#737984}.foot{text-align:center;font:10px Arial;color:#999;padding:7px}.dark .panel{background:#17191f;color:#fff}.dark .prechat,.dark .messages{background:#20232a}.dark .ai,.dark .choice,.dark .card{background:#30343c;color:#fff;border-color:#424751}.dark .composer,.dark .booking,.dark .actions,.dark .foot{background:#17191f;color:#fff}.dark .composer input{background:#17191f;color:#fff;border-color:#333}.panel.open~*{}@media(max-width:520px){.launcher-wrap{right:14px;bottom:max(14px,env(safe-area-inset-bottom))}.left .launcher-wrap{left:14px}.launcher-label{font-size:11px;padding:9px 11px}.panel,.left .panel{left:10px;right:10px;top:max(10px,env(safe-area-inset-top));bottom:max(10px,env(safe-area-inset-bottom));width:auto;height:auto;max-height:none;border-radius:20px}.head{flex:0 0 auto;padding:14px 16px}.prechat{padding:18px;min-height:0}.prechat h3{font-size:22px}.field{margin-bottom:10px}.field input{padding:11px 12px}.actions{flex-direction:column}.messages{padding:14px}.composer{padding:10px}.foot{flex:0 0 auto}}@supports(height:100dvh){@media(max-width:520px){.panel,.left .panel{max-height:calc(100dvh - 20px - env(safe-area-inset-bottom))}}}@media(prefers-reduced-motion:reduce){.launcher,.launcher:before,.launcher-label{animation:none!important}}/* Commerce-first chat redesign, scoped entirely to the widget shadow root. */
.panel{width:min(var(--aaryvo-panel-width,494px),calc(100vw - 28px));border-radius:20px;border:1px solid #e5e7eb}
.head{background:#fff;color:#1c2028;padding:15px 17px;align-items:center;border-bottom:1px solid #e8eaee;gap:12px;min-height:72px}
.head-identity{display:flex;align-items:center;gap:11px;min-width:0}
.head-mark{width:39px;height:39px;flex:none;display:grid;place-items:center;border-radius:13px;background:var(--accent);color:#fff;font-size:21px}
.head .brand{font-size:13px;font-weight:750;letter-spacing:-.015em;overflow-wrap:anywhere}
.head .status{color:#328452;font-size:11px;margin-top:4px;letter-spacing:0}
.head .close{flex:none;width:32px;height:32px;display:grid;place-items:center;border:1px solid #e3e5e9!important;background:#f4f5f7!important;color:#59616c!important;border-radius:50%;font-size:21px;cursor:pointer;line-height:1}
.head .close:hover{background:#e7eaf0!important;color:#1b2431!important}
.messages{min-width:0;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#cbd0d8 transparent;padding:16px;background:#f5f6f8}
.message-wrap{max-width:100%;min-width:0}
.msg{overflow-wrap:anywhere;line-height:1.6;font-size:13px}
.ai{border:1px solid #ebedf0;border-radius:14px 14px 14px 4px}
.user{border-radius:14px 14px 4px 14px}
.product-carousel{display:flex;flex-wrap:nowrap;align-items:stretch;gap:10px;width:100%;min-width:0;max-width:100%;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scroll-padding:2px;margin-top:12px;padding:2px 2px 12px;scrollbar-width:thin;scrollbar-color:#c8ced8 transparent}
.product-carousel::-webkit-scrollbar{height:4px}
.product-carousel::-webkit-scrollbar-thumb{background:#c8ced8;border-radius:999px}
.product-carousel:focus-visible{outline:2px solid #8398b4;outline-offset:2px}
.product-card{display:flex;flex-direction:column;flex:0 0 clamp(153px,43%,188px);min-width:0;max-width:188px;scroll-snap-align:start;border:1px solid #e6e9ee;border-radius:13px;background:#fff;overflow:hidden;box-shadow:0 2px 8px rgba(24,32,45,.035)}
.product-img{display:block;width:100%;height:auto;aspect-ratio:1/1;object-fit:contain;background:#f7f8fa;padding:8px}
.product-img-empty{display:grid;place-items:center;aspect-ratio:1/1;background:#f7f8fa;color:#99a4b2;font-size:11px}
.product-body{display:flex;flex:1;min-width:0;flex-direction:column;gap:0;padding:11px 10px 10px}
.product-title{font-size:12px;font-weight:700;line-height:1.38;min-height:34px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.product-price{font-size:13px;font-weight:800;color:#151a23;margin-top:8px;letter-spacing:-.02em}
.product-stock{font-size:10px;color:#667588;margin:5px 0 9px}
.product-variant-label{display:block;color:#778397;font-size:10px;font-weight:650;margin:3px 0 8px}
.product-variant-select{display:block;margin-top:5px;width:100%;min-width:0;padding:8px 25px 8px 8px;border:1px solid #dce1e8;border-radius:8px;font-size:11px;color:#272e38;background:#fff}
.product-card-actions{display:flex;align-items:stretch;gap:6px;margin-top:auto}
.product-add,.product-link{appearance:none;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:8px;min-height:33px;height:auto;padding:7px 8px;font:700 10px/1.2 Arial,sans-serif;cursor:pointer;text-decoration:none;white-space:normal;transition:background .15s,border-color .15s}
.product-add{flex:1 1 auto;color:#fff;background:#15191f;border:1px solid #15191f}
.product-add:hover:not(:disabled){background:#303947}
.product-add:disabled{opacity:.58;cursor:not-allowed}
.product-link{flex:0 0 auto;margin:0;color:#252c35!important;background:#fff;border:1px solid #bfc7d1}
.product-link:hover{background:#f4f6f9}
.product-card.is-view-only .product-link{flex:1}
.product-cart-feedback{display:block;font-size:10px;line-height:1.45;color:#297347;margin:8px 0 0;overflow-wrap:anywhere}
.product-cart-feedback.is-error{color:#b14438}
.product-cart-feedback a{font-weight:750;color:inherit;text-decoration:underline;text-underline-offset:2px}
.choice-row{margin-top:10px;gap:7px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;padding:2px 0 7px}
.choice-row .choice{flex:0 0 auto;max-width:88%;white-space:normal}
.quick-start{background:#f5f6f8}
.composer{background:#fff;border-top:1px solid #e9ecf1;padding:12px}
.composer input{border-radius:11px;border-color:#dfe3e9}
.send{border-radius:10px;min-width:38px;padding:0 12px}
.dark .head{background:#22262e;color:#fff;border-color:#414751}
.dark .head .status{color:#81d5a2}
.dark .head .close{background:#353a43!important;border-color:#414751!important;color:#eee!important}
.dark .product-card{background:#30343c;border-color:#444a55}
.dark .product-img,.dark .product-img-empty{background:#282c34}
.dark .product-price{color:#fff}
.dark .product-stock{color:#bec6d0}
.dark .product-variant-select{color:#fff;background:#30343c;border-color:#555e69}
.dark .product-link{background:#343a43;color:#fff!important;border-color:#626975}
.dark .product-add{color:#fff;background:#11141a;border-color:#11141a}
.dark .product-cart-feedback{color:#9ddeba}
.dark .product-cart-feedback.is-error{color:#ffb3a9}
@media(max-width:520px){.panel{border-radius:18px}.head{padding:13px 15px}.messages{padding:13px}.product-card{flex-basis:clamp(146px,45%,188px)}.product-body{padding:10px 9px}.product-card-actions{gap:5px}.product-add,.product-link{font-size:10px}}
@media(max-width:365px){.product-carousel{gap:8px}.product-card{flex-basis:145px}.product-title{font-size:11px}.product-img{padding:5px}}
@media(prefers-reduced-motion:reduce){.product-add,.product-link{transition:none}}
/* Niche launcher animations, size overrides and public styling hooks. */
.launcher{width:var(--aaryvo-launcher-size,58px);height:var(--aaryvo-launcher-size,58px);border-radius:var(--aaryvo-launcher-radius,50%);background:var(--aaryvo-launcher-bg,var(--accent))}
.panel{width:min(var(--aaryvo-panel-width,410px),calc(100vw - 28px));border-radius:var(--aaryvo-panel-radius,24px)}
.launcher.niche svg{display:block;width:30px;height:30px;margin:auto;stroke:currentColor}
.launcher.niche-bag svg{animation:aaryvoBag 2.8s ease-in-out infinite;transform-origin:50% 20%}
.launcher.niche-fashion svg{animation:aaryvoFashion 3.2s ease-in-out infinite;transform-origin:50% 15%}
.launcher.niche-footwear svg{animation:aaryvoSneaker 2.7s ease-in-out infinite}
.launcher.niche-skincare svg{animation:aaryvoSkincare 3.1s ease-in-out infinite}
.launcher.niche-luggage svg{animation:aaryvoLuggage 3s ease-in-out infinite}
.launcher.niche-fmcg svg{animation:aaryvoFmcg 2.8s ease-in-out infinite}
.launcher.niche-robot svg{animation:aaryvoRobot 3.2s ease-in-out infinite}
@keyframes aaryvoLuggage{0%,65%,100%{transform:translateY(0) rotate(0)}78%{transform:translateY(-4px) rotate(-4deg)}88%{transform:translateY(0) rotate(3deg)}}
@keyframes aaryvoFmcg{0%,65%,100%{transform:scale(1)}78%{transform:scale(1.06)}88%{transform:scale(1)}}
@keyframes aaryvoRobot{0%,65%,100%{transform:rotate(0)}75%{transform:rotate(-6deg)}85%{transform:rotate(6deg)}}
@keyframes aaryvoBag{0%,65%,100%{transform:rotate(0)}76%{transform:rotate(-9deg)}87%{transform:rotate(8deg)}}
@keyframes aaryvoFashion{0%,65%,100%{transform:rotate(0)}80%{transform:rotate(9deg)}90%{transform:rotate(-6deg)}}
@keyframes aaryvoSneaker{0%,65%,100%{transform:translateY(0)}78%{transform:translateY(-4px)}89%{transform:translateY(0)}}
@keyframes aaryvoSkincare{0%,65%,100%{transform:translateY(0)}77%{transform:translateY(-4px)}88%{transform:translateY(0)}}
.launcher.niche:not(.anim-pulse):not(.anim-glow):not(.anim-bounce) svg{animation:none!important}
@media(prefers-reduced-motion:reduce){.launcher.niche svg{animation:none!important}}
/* The editor app block controls inline vs floating; the chat panel remains an overlay. */
:host(.left) .launcher-wrap{left:22px;right:auto;flex-direction:row-reverse}
:host(.left) .panel{left:22px;right:auto}
:host(.inline) .launcher-wrap,:host(.inline.left) .launcher-wrap{position:relative;inset:auto;left:auto;right:auto;bottom:auto;display:inline-flex;max-width:100%;z-index:auto;flex-direction:row;justify-content:var(--aaryvo-inline-align,flex-start)}
:host(.inline) .panel{position:fixed}
</style><div class="launcher-wrap" part="launcher-wrap"><span class="launcher-label" part="launcher-label">Chat with us</span><button class="launcher" part="launcher" aria-label="Open chat">✦</button></div><section class="panel" part="panel"><header class="head"><div class="head-identity"><span class="head-mark" aria-hidden="true">✦</span><div><div class="brand">AARYVO</div><div class="status">● AI sales agent online</div></div></div><button class="close" type="button" aria-label="Close conversation">×</button></header><form class="prechat"><h3>Let’s get started.</h3><p>Share your details so the team can follow up if the chat gets disconnected.</p><label class="field"><span>Name *</span><input name="name" required placeholder="Your name"></label><label class="field"><span>Phone</span><input name="phone" placeholder="Your phone number"></label><label class="field"><span>Email</span><input name="email" type="email" placeholder="you@example.com"></label><button class="start">Start conversation →</button><p class="preerror"></p><p class="privacy">By continuing, you agree that your details may be used to respond to your enquiry.</p></form><div class="chat"><div class="messages"><div class="message-wrap welcome-wrap"><div class="msg ai welcome"></div></div></div><div class="quick-start"><div class="quick-start-title">Popular questions</div><div class="quick-start-row"></div></div><div class="actions"><button class="book">Book a consultation</button><button class="whatsapp" type="button">Continue on WhatsApp</button></div><div class="booking"><div class="booking-head"><span class="booking-title">Available consultation slots</span><span class="booking-zone"></span></div><div class="slots"></div></div><form class="composer"><input maxlength="3000" placeholder="Type your message…"><button class="send">↑</button></form></div><div class="foot">Powered by AARYVO</div></section>`;
const panel=root.querySelector(".panel"),label=root.querySelector(".launcher-label"),launcher=root.querySelector(".launcher"),prechat=root.querySelector(".prechat"),chat=root.querySelector(".chat"),messages=root.querySelector(".messages"),quickStart=root.querySelector(".quick-start"),quickStartRow=root.querySelector(".quick-start-row"),input=root.querySelector(".composer input"),form=root.querySelector(".composer"),send=root.querySelector(".send"),actions=root.querySelector(".actions"),book=root.querySelector(".book"),whatsapp=root.querySelector(".whatsapp"),booking=root.querySelector(".booking"),slots=root.querySelector(".slots"),zone=root.querySelector(".booking-zone"),start=root.querySelector(".start"),preerror=root.querySelector(".preerror"),foot=root.querySelector(".foot");
const nicheIcons={
BAG:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 8h15l1 12h-17z"/><path d="M8.5 9V6a3.5 3.5 0 0 1 7 0v3"/></svg>',
FASHION:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6.5c-1.8 0-2.2-2.6 0-3.1 2.4-.6 3.4 2.1 1.1 3.6"/><path d="m12 9-8 7a2 2 0 0 0 1.3 3.5h13.4A2 2 0 0 0 20 16z"/></svg>',
FOOTWEAR:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 15.5c2.5 0 4.6-.8 6.2-2.5l1.8-1.9c.8 1.8 2.4 3.1 4.8 3.8l3 .9c1.4.4 2.2 1.2 2.2 2.7V20H3z"/><path d="M10.5 13.2l2 1M12.8 12.6l2 1M3 18.5h18"/></svg>',
SKINCARE:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 7h7v3H17v11H7V10h1.5zM9 3h6v4H9z"/><path d="M10 14h4M10 17h4"/></svg>',
LUGGAGE:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5V4a3 3 0 0 1 6 0v1"/><rect x="6" y="5" width="12" height="15" rx="2"/><path d="M9 9v7M15 9v7M8 20v2M16 20v2"/></svg>',
FMCG:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11a8 8 0 0 1 16 0"/><path d="M3 13h18M4 17h16M5 20h14"/><path d="m6 15 3 1 3-1 3 1 3-1"/><path d="M8 8h.01M12 7h.01M16 8h.01"/></svg>',
ROBOT:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v3"/><circle cx="12" cy="2.5" r=".5"/><rect x="5" y="6" width="14" height="11" rx="3"/><path d="M9 11h.01M15 11h.01M8 15h8M3 10h2M19 10h2M8 17v3M16 17v3"/></svg>'
};
function placeLauncher(){
 const slot=document.querySelector("[data-aaryvo-widget-inline]");
 const inline=Boolean(slot);
 if(slot&&host.parentNode!==slot)slot.appendChild(host);
 else if(!slot&&host.parentNode!==document.body)document.body.appendChild(host);
 host.classList.toggle("inline",inline);
 const props={position:inline?"relative":"fixed",inset:inline?"auto":"0",width:inline?"100%":"0",height:inline?"auto":"0","z-index":inline?"auto":"2147483647","pointer-events":inline?"auto":"none"};
 for(const [name,value] of Object.entries(props))host.style.setProperty(name,value,"important");
}
function apply(){placeLauncher();root.querySelector(".launcher-wrap").classList.toggle("chat-open",panel.classList.contains("open"));launcher.setAttribute("aria-expanded",String(panel.classList.contains("open")));host.style.setProperty("--accent",config.accentColor);host.classList.toggle("left",config.position==="LEFT");host.classList.toggle("dark",config.theme==="DARK");root.querySelector(".brand").textContent=config.title;root.querySelector(".status").textContent=`● ${config.subtitle}`;root.querySelector(".welcome").textContent=config.welcomeMessage;start.textContent=config.startLabel;book.textContent=config.bookLabel;whatsapp.textContent=config.whatsappLabel;foot.style.display=config.showPoweredBy?"block":"none";label.textContent=config.launcherLabel||"Chat with us";label.style.display=config.launcherLabelEnabled&&config.launcherStyle!=="TEXT"&&!panel.classList.contains("open")?"block":"none";launcher.className="launcher";if(config.launcherStyle==="TEXT")launcher.classList.add("text");if(config.launcherAnimation!=="NONE")launcher.classList.add(`anim-${config.launcherAnimation.toLowerCase()}`);if(Object.prototype.hasOwnProperty.call(nicheIcons,config.launcherStyle)){launcher.classList.add("niche","niche-"+config.launcherStyle.toLowerCase());launcher.innerHTML=nicheIcons[config.launcherStyle]}else launcher.textContent=config.launcherStyle==="CHAT"?"●":config.launcherStyle==="TEXT"?(config.launcherLabel||"Chat with us"):"✦"}
function quickPrompts(){const shopify=Array.isArray(config.quickPrompts)&&config.quickPrompts.length?config.quickPrompts:[{label:"Find a product",value:"Help me find a product"},{label:"Shipping & delivery",value:"Tell me about shipping and delivery"},{label:"Talk to someone",value:"I want to talk to someone"}];quickStartRow.innerHTML="";shopify.slice(0,4).forEach(o=>{const b=document.createElement("button");b.className="choice";b.type="button";b.textContent=o.label;b.onclick=()=>sendMessage(o.value);quickStartRow.appendChild(b)});quickStart.style.display=quickStartRow.children.length?"block":"none"}function showChat(){prechat.style.display="none";chat.classList.add("show");quickPrompts();setActions({})}function getRichHistory(){try{const x=JSON.parse(localStorage.getItem(richKey)||"{}");return x&&x.conversationId===conversationId&&Array.isArray(x.items)?x.items:[]}catch{return[]}}function saveRichReply(reply,ui,products){if(!conversationId||(!ui&&(!Array.isArray(products)||!products.length)))return;const items=getRichHistory();items.push({reply:String(reply||""),ui:ui||null,products:Array.isArray(products)?products.slice(0,10):[]});localStorage.setItem(richKey,JSON.stringify({conversationId,items:items.slice(-20)}))}function clearRichHistory(){localStorage.removeItem(richKey)}function restoreMessages(items){if(!Array.isArray(items)||!items.length)return;messages.innerHTML="";const richItems=getRichHistory(),used=new Set();items.forEach(m=>{let extra=m.ui||Array.isArray(m.products)&&m.products.length?{ui:m.ui||null,products:m.products||[]}:null;if(!extra&&m.role==="assistant"){for(let i=0;i<richItems.length;i++){if(!used.has(i)&&richItems[i]?.reply===m.content){extra=richItems[i];used.add(i);break}}}add(m.content,m.role==="assistant"?"ai":"user",extra?.ui,extra?.products)});quickStart.style.display="none"}function setActions(next){const digits=String(config.whatsappNumber||"").replace(/\D/g,"");const inChat=chat.classList.contains("show")&&Boolean(conversationId);const canBook=Boolean(inChat&&config.bookingEnabled);const canWhatsApp=Boolean(inChat&&config.whatsappEnabled&&/^[1-9][0-9]{7,14}$/.test(digits));book.style.display=canBook?"block":"none";whatsapp.classList.toggle("show",canWhatsApp);actions.classList.toggle("show",canBook||canWhatsApp);if(!canBook)booking.classList.remove("show")}
function esc(t){return String(t||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}function rich(t){let s=esc(t).replace(/\*\*([^*\n]+)\*\*/g,"<strong>$1</strong>").replace(/(https?:\/\/[^\s<]+)/g,u=>`<a href="${u}" target="_blank" rel="noopener">${u}</a>`);return s.split("\n").filter(Boolean).map(x=>`<p>${x}</p>`).join("")}function end(){messages.scrollTop=messages.scrollHeight}function add(t,r,ui,products){const w=document.createElement("div");w.className=`message-wrap ${r==="user"?"user-wrap":""}`;const e=document.createElement("div");e.className=`msg ${r}${r==="ai"?" rich":""}`;r==="ai"?e.innerHTML=rich(t):e.textContent=t;w.appendChild(e);messages.appendChild(w);if(r==="ai"&&Array.isArray(products)&&products.length)renderProducts(w,products);if(r==="ai"&&ui)renderUi(w,ui);end();return w}function money(p){if(p==null)return"";const c={INR:"₹",USD:"$",EUR:"€",GBP:"£",AUD:"A$",CAD:"C$"};return`${c[p.currencyCode]||`${p.currencyCode||""} `}${Number(p.minPrice).toLocaleString(undefined,{maximumFractionDigits:2})}${p.maxPrice!=null&&p.maxPrice!==p.minPrice?` – ${Number(p.maxPrice).toLocaleString(undefined,{maximumFractionDigits:2})}`:""}`}
function nativeVariantId(value){
  const matched=String(value||"").match(/^(?:gid:\/\/shopify\/ProductVariant\/)?([0-9]{5,20})$/);
  // The Ajax Cart API needs the variant ID, not the product ID or a
  // GraphQL global ID. Reject numbers that JS cannot represent exactly.
  if(!matched||!Number.isSafeInteger(Number(matched[1])))return null;
  return matched[1];
}
function shopifyCartUrl(resource){
  if(!window.Shopify||!window.Shopify.routes||!window.Shopify.routes.root)return null;
  try{
    const rootUrl=new URL(String(window.Shopify.routes.root),location.origin);
    if(rootUrl.origin!==location.origin||rootUrl.search||rootUrl.hash)return null;
    return (rootUrl.pathname.endsWith("/")?rootUrl.pathname:rootUrl.pathname+"/")+resource;
  }catch{return null}
}
function safeCartError(error,status){
  // Never display untrusted HTML, network traces or Shopify challenge pages
  // in the chat. Preserve actionable Shopify JSON error descriptions.
  const message=typeof error==="string"?error.trim():"";
  const plain=message&&message.length<=300&&!/[<>]/.test(message)?
    message.slice(0,170):"";
  if(status===429)return "Too many cart requests. Please retry shortly.";
  if(status===401||status===403)return "Shopify blocked this cart request (HTTP "+status+"). Open the product page to continue.";
  if(status===404)return "The Shopify cart endpoint was not found (HTTP 404). Open the product page to continue.";
  if(status===422){
    if(/cannot find variant/i.test(plain))
      return "This option is not currently available in the online store. Try another option or open the product page.";
    if(plain&&plain!=="Cart Error")return plain;
    return "Shopify could not add this variant (HTTP 422). Check stock or try another option.";
  }
  if(status>=500)return "Shopify cart is temporarily unavailable (HTTP "+status+"). Please try again.";
  if(status>=400)return plain&&plain!=="Cart Error"?plain:
    "Shopify rejected the cart request (HTTP "+status+"). Please open the product page.";
  if(plain)return plain;
  return "Could not reach the Shopify cart. Check your connection and try again.";
}
async function addProductToShopifyCart(product,variant,button,feedback){
  const variantId=nativeVariantId(variant?.id),url=shopifyCartUrl("cart/add.js");
  if(!variantId||!url)return;
  const marker=typeof product.attributionToken==="string" &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(product.attributionToken)
      ?product.attributionToken:null;
  const item={id:Number(variantId),quantity:1};
  if(marker)item.properties={_aaryvo_attribution:marker};
  const previousLabel=button.textContent;
  button.disabled=true;
  button.textContent="Adding...";
  feedback.textContent="";
  feedback.classList.remove("is-error");
  try{
    const abort=typeof AbortSignal!=="undefined"&&typeof AbortSignal.timeout==="function"
      ?{signal:AbortSignal.timeout(12000)}:{};
    const response=await fetch(url,{
      method:"POST",credentials:"same-origin",
      headers:{"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify({items:[item]}),...abort
    });
    const contentType=response.headers.get("content-type")||"";
    const payload=contentType.includes("application/json")?
      await response.json().catch(()=>null):null;
    if(!response.ok){
      console.warn("AARYVO cart add rejected",{status:response.status,
        json:contentType.includes("application/json"),variantId});
      throw Error(safeCartError(payload?.description||payload?.message,response.status));
    }
    let added=Array.isArray(payload?.items)&&payload.items.find(line=>
      String(line.variant_id||line.id)===variantId && Number(line.quantity)>0);
    if(!added){
      // Some themes or middleware return a non-standard success payload.
      // Verify the actual storefront cart rather than incorrectly reporting failure.
      const cartPath=shopifyCartUrl("cart.js");
      if(cartPath){
        const cartResponse=await fetch(cartPath,{credentials:"same-origin",cache:"no-store"});
        if(cartResponse.ok){
          const cart=await cartResponse.json();
          if(Array.isArray(cart?.items)){
            added=cart.items.find(line=>String(line.variant_id||line.id)===variantId &&
              Number(line.quantity)>0 &&
              (!marker||line.properties?._aaryvo_attribution===marker));
          }
        }
      }
    }
    if(!added)throw Error("Shopify did not confirm the cart change. Please check your cart before trying again.");
    if(marker&&added.properties?._aaryvo_attribution===marker)
      sendShopifyFunnelEvent("ADD_TO_CART",marker);
    feedback.textContent="Added to cart. ";
    const viewCart=document.createElement("a");
    viewCart.href=shopifyCartUrl("cart")||"/cart";
    viewCart.textContent="View cart ↗";
    feedback.appendChild(viewCart);
    button.textContent="Add again";
    // Let compatible themes refresh their cart drawer/badge without requiring
    // navigation. A visible View cart fallback works for other themes.
    document.dispatchEvent(new CustomEvent("cart:refresh",{detail:{source:"aaryvo"}}));
    window.dispatchEvent(new CustomEvent("aaryvo:cart-added",{
      detail:{variantId,quantity:1}
    }));
  }catch(error){
    const message=error?.name==="TimeoutError"?"Shopify took too long. Check your cart before retrying.":error?.message;
    feedback.textContent=safeCartError(message);
    feedback.classList.add("is-error");
    button.textContent=previousLabel;
  }finally{button.disabled=false}
}
function productPageUrl(product,variant){
  let target=String(product.url||"");
  try{
    const u=new URL(target,location.href);
    const id=nativeVariantId(variant?.id);
    if(window.Shopify&&id&&u.pathname.includes("/products/"))
      u.searchParams.set("variant",id);
    if(window.Shopify&&product.attributionToken&&u.protocol==="https:"&&u.pathname.includes("/products/"))
      u.hash="aaryvo_ref="+encodeURIComponent(product.attributionToken);
    target=u.href;
  }catch{}
  return target;
}
function renderProducts(w,products){
  const g=document.createElement("div");
  g.className="product-carousel";
  g.setAttribute("role","region");
  g.setAttribute("aria-label","Recommended products. Scroll horizontally for more choices.");
  g.tabIndex=0;
  const represented=[];
  products.slice(0,10).forEach(p=>{
    if(!p?.title)return;
    const c=document.createElement("article");
    c.className="product-card";
    if(p.imageUrl){
      const img=document.createElement("img");
      img.className="product-img";
      img.src=p.imageUrl;
      img.alt=p.title;
      img.loading="lazy";
      c.appendChild(img);
    }else{
      const fallback=document.createElement("span");
      fallback.className="product-img-empty";
      fallback.textContent="Image unavailable";
      c.appendChild(fallback);
    }
    const body=document.createElement("div");
    body.className="product-body";
    const title=document.createElement("div");
    title.className="product-title";
    title.textContent=p.title;
    title.title=p.title;
    body.appendChild(title);
    const variants=Array.isArray(p.variants)?p.variants.filter(v=>v&&
      v.availableForSale!==false&&nativeVariantId(v.id)): [];
    let selectedVariant=variants[0]||null;
    const price=document.createElement("div");
    price.className="product-price";
    function displayPrice(){
      const amount=Number(selectedVariant?.price);
      const variantWithPrice=selectedVariant&&selectedVariant.price!=null&&
        Number.isFinite(amount)?{...p,minPrice:amount,maxPrice:amount}:p;
      price.textContent=money(variantWithPrice)||"Price on product page";
    }
    displayPrice();
    body.appendChild(price);
    const stock=document.createElement("div");
    stock.className="product-stock";
    stock.textContent=!p.availableForSale?"Sold out":variants.length?
      "Available to order":"Select options on product page";
    body.appendChild(stock);
    let variantSelect=null;
    if(variants.length>1){
      const label=document.createElement("label");
      label.className="product-variant-label";
      label.textContent="Choose option";
      variantSelect=document.createElement("select");
      variantSelect.className="product-variant-select";
      variants.forEach((variant,index)=>{
        const option=document.createElement("option");
        option.value=String(index);
        option.textContent=variant.optionSummary||variant.title||"Option "+(index+1);
        variantSelect.appendChild(option);
      });
      variantSelect.addEventListener("change",()=>{
        selectedVariant=variants[Number(variantSelect.value)]||variants[0];
        displayPrice();
        if(viewLink)viewLink.href=productPageUrl(p,selectedVariant);
      });
      label.appendChild(variantSelect);
      body.appendChild(label);
    }
    const actions=document.createElement("div");
    actions.className="product-card-actions";
    const feedback=document.createElement("div");
    feedback.className="product-cart-feedback";
    feedback.setAttribute("role","status");
    feedback.setAttribute("aria-live","polite");
    const canAdd=Boolean(p.availableForSale&&variants.length&&shopifyCartUrl("cart/add.js"));
    if(canAdd){
      const addButton=document.createElement("button");
      addButton.className="product-add";
      addButton.type="button";
      addButton.textContent="Add to cart";
      addButton.setAttribute("aria-label","Add "+p.title+" to cart");
      addButton.onclick=()=>addProductToShopifyCart(p,selectedVariant,addButton,feedback);
      actions.appendChild(addButton);
    }else{c.classList.add("is-view-only")}
    let viewLink=null;
    if(p.url){
      viewLink=document.createElement("a");
      viewLink.className="product-link";
      viewLink.href=productPageUrl(p,selectedVariant);
      viewLink.target="_blank";
      viewLink.rel="noopener noreferrer";
      viewLink.textContent="View";
      viewLink.setAttribute("aria-label","View "+p.title);
      viewLink.addEventListener("click",()=>sendShopifyFunnelEvent("PRODUCT_CLICK",p.attributionToken));
      // Preserve attribution when shoppers choose to visit the product page.
      if(typeof p.attributionToken==="string"&&
         /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(p.attributionToken)&&
         window.Shopify&&window.Shopify.routes&&typeof window.fetch==="function"){
        viewLink.onclick=function(event){
          if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
          event.preventDefault();
          const tab=window.open("about:blank","_blank");
          if(tab)tab.opener=null;
          const cartPath=shopifyCartUrl("cart/update.js");
          const target=viewLink.href;
          if(!cartPath){
            if(tab&&!tab.closed)tab.location.href=target;
            else window.location.assign(target);
            return;
          }
          const timeout=typeof AbortSignal!=="undefined"&&typeof AbortSignal.timeout==="function"
            ?{signal:AbortSignal.timeout(2500)}:{};
          fetch(cartPath,{method:"POST",credentials:"same-origin",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({attributes:{"__aaryvo_attribution":p.attributionToken}}),...timeout
          }).catch(()=>{}).finally(()=>{
            if(tab&&!tab.closed)tab.location.href=target;
            else window.location.assign(target);
          });
        };
      }
      actions.appendChild(viewLink);
    }
    if(actions.childElementCount){
      body.appendChild(actions);
      if(canAdd)body.appendChild(feedback);
    }
    c.appendChild(body);
    g.appendChild(c);
    represented.push(p);
  });
  if(!g.children.length)return;
  w.appendChild(g);
  if(typeof IntersectionObserver==="function"){
    const tracked=new Set();
    const cards=Array.from(g.children);
    const observer=new IntersectionObserver(entries=>{
      if(!panel.classList.contains("open"))return;
      entries.forEach(entry=>{
        if(!entry.isIntersecting||tracked.has(entry.target))return;
        tracked.add(entry.target);
        observer.unobserve(entry.target);
        const index=cards.indexOf(entry.target);
        if(represented[index])
          sendShopifyFunnelEvent("RECOMMENDATION_VIEW",represented[index].attributionToken);
      });
      if(tracked.size===cards.length)observer.disconnect();
    },{root:messages,threshold:0.25});
    cards.forEach(card=>observer.observe(card));
  }
  end();
}
function renderUi(w,ui){if(!ui)return;if((ui.type==="chips"||ui.type==="buttons")&&Array.isArray(ui.options)){const row=document.createElement("div");row.className="choice-row";ui.options.slice(0,6).forEach(o=>{if(!o?.label||!o?.value)return;const b=document.createElement("button");b.className=`choice ${ui.type==="buttons"?"primary":""}`;b.textContent=o.label;b.onclick=()=>sendMessage(o.value);row.appendChild(b)});w.appendChild(row)}else if(ui.type==="cards"&&Array.isArray(ui.cards)){const g=document.createElement("div");g.className="cards";ui.cards.slice(0,4).forEach(i=>{if(!i?.title||!i?.description)return;const c=document.createElement("div");c.className="card";c.innerHTML=`<div class="card-title">${esc(i.title)}</div><div class="card-desc">${esc(i.description)}</div>`;if(i.actionLabel&&i.value){const b=document.createElement("button");b.className="card-action";b.textContent=`${i.actionLabel} →`;b.onclick=()=>sendMessage(i.value);c.appendChild(b)}g.appendChild(c)});w.appendChild(g)}end()}function thinking(){const w=document.createElement("div");w.className="message-wrap";w.innerHTML='<div class="msg ai thinking"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';messages.appendChild(w);end();return w}
document.addEventListener("shopify:section:load",()=>apply());apply();setActions({booking:false,whatsapp:false});fetch(`${base}/api/widget/config`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agentId})}).then(r=>r.ok?r.json():null).then(async d=>{if(!d)return;config={...config,...d};apply();setActions({booking:false,whatsapp:false});try{const r=await fetch(`${base}/api/widget/session`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agentId,visitorId,conversationId})}),x=await r.json();if(!r.ok)return;if(x.conversationId){conversationId=x.conversationId;localStorage.setItem(conversationKey,conversationId)}if(x.lead){lead=x.lead;contactCaptured=!!(lead.name&&(lead.email||lead.phone))}if(x.previousContact){const n=prechat.querySelector("[name=name]"),p=prechat.querySelector("[name=phone]"),e=prechat.querySelector("[name=email]");if(n)n.value=x.previousContact.name||"";if(p)p.value=x.previousContact.phone||"";if(e)e.value=x.previousContact.email||""}if(!x.restored&&x.requiresContact){conversationId=null;localStorage.removeItem(conversationKey);clearRichHistory()}if(x.restored||config.conversationMode==="CONVERSATION_FIRST"){showChat();restoreMessages(x.messages);if(x.restored&&lead?.name&&(!x.messages||!x.messages.length))root.querySelector(".welcome").textContent=`Welcome back, ${lead.name}. How can I help you today?`}}catch{}}).catch(()=>{});launcher.onclick=()=>{panel.classList.toggle("open");apply()};root.querySelector(".close").onclick=()=>{panel.classList.remove("open");apply()};whatsapp.onclick=()=>{const digits=String(config.whatsappNumber||"").replace(/\D/g,"");if(!/^[1-9][0-9]{7,14}$/.test(digits))return;window.open(`https://wa.me/${digits}?text=${encodeURIComponent(config.whatsappMessage||"Hello!")}`,"_blank","noopener,noreferrer")};
prechat.onsubmit=async e=>{e.preventDefault();const d=new FormData(prechat),name=String(d.get("name")||"").trim(),phone=String(d.get("phone")||"").trim(),email=String(d.get("email")||"").trim();if(!name||(!phone&&!email)){preerror.textContent="Please enter your name and either a phone number or email.";return}start.disabled=true;try{const r=await fetch(`${base}/api/widget/contact`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agentId,visitorId,conversationId:conversationId||undefined,name,phone,email})}),x=await r.json();if(!r.ok)throw Error(x.error);conversationId=x.conversationId;localStorage.setItem(conversationKey,conversationId);clearRichHistory();lead=x.lead;contactCaptured=true;showChat();setActions({booking:false,whatsapp:false})}catch(x){preerror.textContent=x.message||"Unable to start chat."}finally{start.disabled=false}};
async function sendMessage(t){t=String(t||"").trim();if(!t||!conversationId||busy)return;busy=true;add(t,"user");quickStart.style.display="none";input.value="";const wait=thinking();try{const r=await fetch(`${base}/api/widget/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agentId,visitorId,conversationId,message:t,pageUrl:window.location.href,pageTitle:document.title})}),d=await r.json();wait.remove();if(!r.ok)throw Error(d.error);lead=d.lead||lead;add(d.reply,"ai",d.ui,d.products);saveRichReply(d.reply,d.ui,d.products);setActions(d.actions||{booking:false,whatsapp:false})}catch(x){wait.remove();add(x.message||"Sorry, something went wrong.","ai");setActions({booking:false,whatsapp:false})}finally{busy=false}}form.onsubmit=e=>{e.preventDefault();sendMessage(input.value)};
async function loadSlots(){booking.classList.add("show");if(!lead?.name||(!lead?.phone&&!lead?.email)){slots.innerHTML='<form class="booking-contact"><label class="field"><span>Name *</span><input name="name" required maxlength="190" placeholder="Your name"></label><label class="field"><span>Email or phone *</span><input name="contact" required maxlength="190" placeholder="Email or phone"></label><p class="slot-empty">Share your contact details to request a consultation. Your chat stays open.</p><button class="start" type="submit">Continue to available times</button><p class="preerror" role="alert"></p></form>';const contactForm=slots.querySelector(".booking-contact");contactForm.onsubmit=async e=>{e.preventDefault();const name=contactForm.querySelector('[name="name"]').value.trim(),contact=contactForm.querySelector('[name="contact"]').value.trim(),email=contact.includes("@")?contact:"",phone=email?"":contact;const button=contactForm.querySelector("button"),error=contactForm.querySelector(".preerror");button.disabled=true;error.textContent="";try{const r=await fetch(`${base}/api/widget/contact`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agentId,visitorId,conversationId,name,email,phone})}),d=await r.json();if(!r.ok)throw Error(d.error||"Unable to save contact details");lead=d.lead;contactCaptured=true;await loadSlots()}catch(err){error.textContent=err.message||"Please try again";button.disabled=false}};return}slots.textContent="Loading…";try{const r=await fetch(`${base}/api/widget/availability`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agentId,visitorId,conversationId})}),d=await r.json();if(!r.ok)throw Error(d.error);zone.textContent=d.timeZone||"";slots.innerHTML="";if(!Array.isArray(d.slots)||!d.slots.length){slots.textContent="No consultation slots are currently available. Please try another day or contact the store.";return}d.slots.forEach(s=>{const b=document.createElement("button");b.className="slot";b.innerHTML=`<b>${esc(s.dateLabel)}</b><span>${esc(s.label)}</span>`;b.onclick=()=>bookSlot(s.startsAt,b);slots.appendChild(b)})}catch(x){slots.textContent=x.message||"Unable to load times."}}book.onclick=()=>booking.classList.contains("show")?booking.classList.remove("show"):loadSlots();async function bookSlot(startsAt,b){b.disabled=true;try{const r=await fetch(`${base}/api/widget/appointment`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agentId,visitorId,conversationId,startsAt})}),d=await r.json();if(!r.ok)throw Error(d.error);add(`**Consultation request received**\n${new Date(d.appointment.startsAt).toLocaleString()}\nThe team will review your request.`,"ai");booking.classList.remove("show");setActions({booking:false,whatsapp:false})}catch(x){add(x.message||"Unable to book.","ai");b.disabled=false}}
})();