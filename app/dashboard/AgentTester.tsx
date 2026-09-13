"use client";

import { FormEvent, useState } from "react";
import { ArrowUp, Bot, RotateCcw } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function AgentTester({ businessName }: { businessName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: `Hi! I’m the AI sales agent for ${businessName}. Ask me anything about the business.` },
  ]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setMessages((current) => [...current, { role: "user", content: text }]);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to get a response.");
      setConversationId(data.conversationId);
      setMessages((current) => [...current, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to get a response.");
    } finally {
      setLoading(false);
    }
  }

  function newConversation() {
    setConversationId(null);
    setMessages([{ role: "assistant", content: `Hi! I’m the AI sales agent for ${businessName}. What can I help you with?` }]);
    setError("");
    setInput("");
  }

  return (
    <section className="mt-6 overflow-hidden rounded-[32px] bg-[#111319] text-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-white/10 p-6 md:flex-row md:items-center md:justify-between md:px-8">
        <div>
          <div className="flex items-center gap-2 text-sm text-white/45"><Bot size={16} /> Live agent preview</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Test your AI sales employee.</h2>
          <p className="mt-1 text-sm text-white/45">Grounded in the approved knowledge from {businessName}.</p>
        </div>
        <button onClick={newConversation} type="button" className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"><RotateCcw size={14} /> New conversation</button>
      </div>

      <div className="min-h-[360px] max-h-[520px] space-y-4 overflow-y-auto p-6 md:p-8">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={message.role === "user" ? "ml-auto max-w-[82%] rounded-3xl rounded-br-md bg-white px-5 py-3 text-sm leading-6 text-black" : "max-w-[82%] rounded-3xl rounded-bl-md bg-white/10 px-5 py-3 text-sm leading-6 text-white"}>{message.content}</div>
        ))}
        {loading && <div className="max-w-[82%] rounded-3xl rounded-bl-md bg-white/10 px-5 py-3 text-sm text-white/55">AARYVO is thinking…</div>}
        {error && <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>}
      </div>

      <form onSubmit={sendMessage} className="border-t border-white/10 p-4 md:p-6">
        <div className="flex items-center gap-3 rounded-full bg-white p-2 pl-5">
          <input value={input} onChange={(event) => setInput(event.target.value)} disabled={loading} maxLength={3000} placeholder="Ask about services, pricing, process…" className="min-w-0 flex-1 bg-transparent py-2 text-sm text-black outline-none placeholder:text-black/35" />
          <button type="submit" disabled={loading || !input.trim()} aria-label="Send message" className="grid size-11 shrink-0 place-items-center rounded-full bg-black text-white disabled:opacity-30"><ArrowUp size={18} /></button>
        </div>
      </form>
    </section>
  );
}
