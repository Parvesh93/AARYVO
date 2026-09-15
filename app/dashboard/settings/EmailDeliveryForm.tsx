"use client";

import { useState } from "react";
import { CheckCircle2, Mail, Send } from "lucide-react";

type Props = {
  initial: {
    customSmtpEnabled: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpFromName: string;
    smtpFromEmail: string;
    passwordSaved: boolean;
    notificationEmail: string;
  };
};

export default function EmailDeliveryForm({ initial }: Props) {
  const [form, setForm] = useState({ ...initial, smtpPassword: "" });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [testEmail, setTestEmail] = useState(initial.notificationEmail || initial.smtpFromEmail || "");
  const field = "mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-black/40";

  async function save() {
    setSaving(true); setMessage("");
    try {
      const res = await fetch("/api/settings/email", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to save email settings.");
      setForm(f => ({ ...f, smtpPassword: "", passwordSaved: data.passwordSaved }));
      setMessage("Email delivery settings saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save email settings."); }
    finally { setSaving(false); }
  }

  async function test() {
    setTesting(true); setMessage("");
    try {
      const res = await fetch("/api/settings/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: testEmail }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to send test email.");
      setMessage(`Test email sent using ${data.source === "workspace" ? "your SMTP" : "AARYVO email delivery"}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to send test email."); }
    finally { setTesting(false); }
  }

  return <section className="rounded-3xl border border-black/10 bg-white p-6 md:p-8">
    <div className="flex items-start justify-between gap-5">
      <div><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-white"><Mail size={17}/></div><h2 className="mt-4 text-xl font-semibold">Email delivery</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-black/55">Use AARYVO's email delivery or connect your own SMTP so lead and appointment notifications are sent from your business email address.</p></div>
      <span className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${form.customSmtpEnabled ? "bg-emerald-50 text-emerald-700" : "bg-black/[.04] text-black/45"}`}>{form.customSmtpEnabled ? "Custom SMTP" : "AARYVO delivery"}</span>
    </div>
    <div className="mt-7 grid gap-3 sm:grid-cols-2"><button type="button" onClick={()=>setForm({...form,customSmtpEnabled:false})} className={`rounded-2xl border p-4 text-left ${!form.customSmtpEnabled?"border-black bg-black/[.025]":"border-black/[.07]"}`}><p className="text-sm font-semibold">Use AARYVO email delivery</p><p className="mt-1 text-xs leading-5 text-black/40">No mail server setup required.</p></button><button type="button" onClick={()=>setForm({...form,customSmtpEnabled:true})} className={`rounded-2xl border p-4 text-left ${form.customSmtpEnabled?"border-black bg-black/[.025]":"border-black/[.07]"}`}><p className="text-sm font-semibold">Use my own SMTP</p><p className="mt-1 text-xs leading-5 text-black/40">Send notifications from your business mailbox.</p></button></div>
    {form.customSmtpEnabled && <div className="mt-7 rounded-2xl bg-[#f7f8fa] p-5 md:p-6"><div className="grid gap-5 md:grid-cols-2"><label className="text-sm font-medium">SMTP host<input className={field} value={form.smtpHost} onChange={e=>setForm({...form,smtpHost:e.target.value})} placeholder="smtp.yourprovider.com"/></label><label className="text-sm font-medium">SMTP port<input className={field} type="number" value={form.smtpPort} onChange={e=>setForm({...form,smtpPort:Number(e.target.value)})} placeholder="587"/></label><label className="text-sm font-medium">SMTP username<input className={field} value={form.smtpUser} onChange={e=>setForm({...form,smtpUser:e.target.value})} placeholder="sales@yourbusiness.com"/></label><label className="text-sm font-medium">SMTP password<input className={field} type="password" value={form.smtpPassword} onChange={e=>setForm({...form,smtpPassword:e.target.value})} placeholder={form.passwordSaved?"Saved — leave blank to keep current password":"Enter SMTP password"}/></label><label className="text-sm font-medium">From name<input className={field} value={form.smtpFromName} onChange={e=>setForm({...form,smtpFromName:e.target.value})} placeholder="Your Business"/></label><label className="text-sm font-medium">From email<input className={field} type="email" value={form.smtpFromEmail} onChange={e=>setForm({...form,smtpFromEmail:e.target.value})} placeholder="sales@yourbusiness.com"/></label></div><label className="mt-5 flex items-center justify-between rounded-xl border border-black/[.06] bg-white p-4"><div><p className="text-sm font-semibold">Secure connection (SSL/TLS)</p><p className="mt-1 text-xs text-black/40">Enable for SMTP providers using implicit TLS, commonly port 465.</p></div><input type="checkbox" checked={form.smtpSecure} onChange={e=>setForm({...form,smtpSecure:e.target.checked})} className="h-4 w-4 accent-black"/></label><p className="mt-4 text-xs leading-5 text-black/40">Your SMTP password is encrypted before it is stored. For Gmail and some providers, use an app password rather than your normal account password.</p></div>}
    <div className="mt-6 flex flex-wrap items-center gap-3"><button type="button" onClick={save} disabled={saving} className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving?"Saving…":"Save email settings"}</button>{form.customSmtpEnabled && <><input className="min-w-[230px] rounded-full border border-black/10 px-4 py-3 text-sm outline-none" type="email" value={testEmail} onChange={e=>setTestEmail(e.target.value)} placeholder="Test recipient email"/><button type="button" onClick={test} disabled={testing} className="inline-flex items-center gap-2 rounded-full border border-black/10 px-5 py-3 text-sm font-semibold disabled:opacity-50"><Send size={14}/>{testing?"Sending…":"Send test email"}</button></>}{message&&<p className="flex items-center gap-1.5 text-xs text-black/55"><CheckCircle2 size={14}/>{message}</p>}</div>
  </section>;
}
