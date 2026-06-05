"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { MessageCircle, X, Send } from "lucide-react";

type Msg = { role: "user" | "bot"; text: string };

const GREETING: Msg = {
  role: "bot",
  text: "Hi! Ask me about EliteVault — pricing, billing, your score, privacy, and more. For anything I can't answer, you can talk to a human.",
};

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || pending) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setPending(true);
    try {
      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json()) as { answer?: string };
      setMsgs((m) => [
        ...m,
        {
          role: "bot",
          text:
            data.answer ??
            "Something went wrong. Please use the contact form below.",
        },
      ]);
    } catch {
      setMsgs((m) => [
        ...m,
        { role: "bot", text: "Couldn't reach support right now — try the contact form below." },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support chat" : "Open support chat"}
        className="fixed bottom-5 right-5 z-50 flex size-12 items-center justify-center rounded-full bg-champagne-400 text-obsidian-950 shadow-lg hover:bg-champagne-300 transition-colors"
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 flex h-[28rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-obsidian-900 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Support</p>
              <Link
                href="/support/contact"
                className="text-[11px] text-champagne-400 hover:text-champagne-300"
              >
                Talk to a human →
              </Link>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-white/40 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-sm bg-champagne-400/15 px-3 py-2 text-sm text-white"
                      : "max-w-[85%] rounded-2xl rounded-bl-sm bg-white/[0.04] px-3 py-2 text-sm text-white/80"
                  }
                >
                  {m.text}
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-white/[0.04] px-3 py-2 text-sm text-white/40">
                  Thinking…
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={send}
            className="flex items-center gap-2 border-t border-white/[0.06] p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-champagne-400/40"
            />
            <button
              type="submit"
              disabled={pending}
              aria-label="Send"
              className="flex size-9 items-center justify-center rounded-lg bg-champagne-400 text-obsidian-950 hover:bg-champagne-300 transition-colors disabled:opacity-50"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
