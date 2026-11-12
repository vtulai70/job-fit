"use client";

import { useState } from "react";

import type { ChatMessage } from "@/lib/api";

type Props = {
  messages: ChatMessage[];
  busy: boolean;
  canGenerate: boolean;
  onSend: (text: string) => void;
  onGenerate: () => void;
};

/** AI chat: conversation, a one-click generate button and a free-text message box. */
export default function ChatSidebar({ messages, busy, canGenerate, onSend, onGenerate }: Props) {
  const [text, setText] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onSend(text.trim());
    setText("");
  }

  return (
    <aside aria-label="AI chat" className="flex w-96 flex-col border-l border-line bg-surface p-4">
      <h2 className="mb-2 font-semibold">AI assistant</h2>
      <button
        onClick={onGenerate}
        disabled={!canGenerate || busy}
        title={canGenerate ? undefined : "Upload a baseline resume and paste a job description first"}
        className="mb-3 rounded bg-accent py-2 text-sm font-semibold text-canvas disabled:opacity-40"
      >
        Generate custom resume
      </button>
      <div role="log" aria-label="Conversation" className="flex flex-1 flex-col gap-2 overflow-y-auto text-sm">
        {messages.length === 0 && (
          <p className="text-ink/60">Ask anything about tailoring your resume.</p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap rounded p-2 ${m.role === "user" ? "self-end bg-primary/15" : "bg-canvas"}`}
          >
            <span className="sr-only">{m.role === "user" ? "You: " : "AI: "}</span>
            {m.content}
          </div>
        ))}
        {busy && <p className="text-ink/60">Thinking...</p>}
      </div>
      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          aria-label="Message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message"
          className="flex-1 rounded border border-line bg-canvas p-2 text-sm focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="rounded bg-primary px-3 text-sm font-semibold text-canvas disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </aside>
  );
}
