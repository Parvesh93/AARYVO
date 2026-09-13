(() => {
  const script = document.currentScript;
  if (!script || script.dataset.aaryvoLoaded === "true") return;
  script.dataset.aaryvoLoaded = "true";
  const agentId = script.dataset.agent;
  if (!agentId) return console.error("AARYVO: data-agent is required.");
  const base = new URL(script.src).origin;
  const storageKey = `aaryvo:${agentId}:visitor`;
  let visitorId = localStorage.getItem(storageKey);
  if (!visitorId) { visitorId = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`); localStorage.setItem(storageKey, visitorId); }
  let conversationId = sessionStorage.getItem(`${storageKey}:conversation`);
  let lead = null;

  const host = document.createElement("div");
  host.id = "aaryvo-widget-root";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    *{box-sizing:border-box}button,input{font:inherit}.launcher{position:fixed;right:22px;bottom:22px;width:58px;height:58px;border:0;border-radius:50%;background:#111319;color:#fff;cursor:pointer;box-shadow:0 14px 40px rgba(0,0,0,.22);z-index:2147483647;font-size:22px}.panel{position:fixed;right:22px;bottom:92px;width:min(390px,calc(100vw - 28px));height:min(620px,calc(100vh - 120px));background:#fff;border-radius:24px;box-shadow:0 22px 70px rgba(0,0,0,.22);z-index:2147483647;display:none;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#111319}.panel.open{display:flex;flex-direction:column}.head{background:#111319;color:#fff;padding:18px 20px;display:flex;align-items:center;justify-content:space-between}.brand{font-size:13px;letter-spacing:.18em;font-weight:700}.status{font-size:11px;color:#8ee8b3}.messages{flex:1;overflow:auto;padding:18px;background:#f6f7fb}.msg{max-width:84%;padding:11px 14px;border-radius:18px;margin:0 0 10px;font-size:14px;line-height:1.45;white-space:pre-wrap}.ai{background:#fff;border-bottom-left-radius:5px}.user{margin-left:auto;background:#111319;color:#fff;border-bottom-right-radius:5px}.composer{padding:12px;border-top:1px solid #eee;display:flex;gap:8px;background:#fff}.composer input{flex:1;min-width:0;border:1px solid #ddd;border-radius:999px;padding:11px 14px;outline:none}.send{border:0;border-radius:999px;background:#111319;color:#fff;padding:0 15px;cursor:pointer}.book{margin:0 18px 12px;padding:12px 14px;border:0;border-radius:14px;background:#111319;color:#fff;cursor:pointer;display:none}.booking{display:none;padding:0 18px 14px;gap:8px}.booking.show{display:flex}.booking input{min-width:0;flex:1;padding:10px;border:1px solid #ddd;border-radius:12px}.booking button{border:0;border-radius:12px;background:#111319;color:#fff;padding:10px 12px;cursor:pointer}.foot{text-align:center;font-size:10px;color:#999;padding:0 0 8px;background:#fff}@media(max-width:520px){.launcher{right:14px;bottom:14px}.panel{right:14px;bottom:82px;height:calc(100vh - 100px)}}
  </style><button class="launcher" aria-label="Chat with us">✦</button><section class="panel"><header class="head"><div><div class="brand">AARYVO</div><div class="status">● AI sales agent online</div></div><button class="close" style="border:0;background:none;color:#fff;font-size:22px;cursor:pointer">×</button></header><div class="messages"><div class="msg ai">Hi 👋 How can I help you today?</div></div><button class="book">Book a consultation</button><div class="booking"><input type="datetime-local"/><button>Request</button></div><form class="composer"><input maxlength="3000" placeholder="Type your message…"/><button class="send" aria-label="Send">↑</button></form><div class="foot">Powered by AARYVO</div></section>`;

  const panel = root.querySelector(".panel"), messages = root.querySelector(".messages"), input = root.querySelector(".composer input"), form = root.querySelector(".composer"), book = root.querySelector(".book"), booking = root.querySelector(".booking"), dateInput = root.querySelector(".booking input"), bookingButton = root.querySelector(".booking button");
  root.querySelector(".launcher").onclick = () => panel.classList.toggle("open");
  root.querySelector(".close").onclick = () => panel.classList.remove("open");
  book.onclick = () => booking.classList.toggle("show");
  const add = (text, role) => { const el=document.createElement("div");el.className=`msg ${role}`;el.textContent=text;messages.appendChild(el);messages.scrollTop=messages.scrollHeight;return el; };

  form.onsubmit = async (event) => {
    event.preventDefault(); const text=input.value.trim(); if(!text) return; add(text,"user"); input.value=""; input.disabled=true; const thinking=add("AARYVO is thinking…","ai");
    try { const res=await fetch(`${base}/api/widget/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agentId,visitorId,conversationId,message:text})}); const data=await res.json(); thinking.remove(); if(!res.ok) throw new Error(data.error||"Unable to respond."); conversationId=data.conversationId; sessionStorage.setItem(`${storageKey}:conversation`,conversationId); lead=data.lead||lead; add(data.reply,"ai"); if(lead&&(lead.status==="HOT"||lead.status==="QUALIFIED"||lead.score>=65)) book.style.display="block"; }
    catch(err){thinking.remove();add(err.message||"Sorry, something went wrong.","ai");} finally{input.disabled=false;input.focus();}
  };

  bookingButton.onclick = async () => {
    if(!conversationId||!dateInput.value) return; bookingButton.disabled=true;
    try { const res=await fetch(`${base}/api/widget/appointment`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agentId,visitorId,conversationId,startsAt:new Date(dateInput.value).toISOString()})}); const data=await res.json(); if(!res.ok) throw new Error(data.error||"Unable to book."); add(`Your consultation request is booked for ${new Date(data.appointment.startsAt).toLocaleString()}. The team can now follow up to confirm it.`,"ai"); booking.classList.remove("show"); book.style.display="none"; }
    catch(err){add(err.message||"Unable to book the appointment.","ai");} finally{bookingButton.disabled=false;}
  };
})();
