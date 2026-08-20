"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Button } from "@/components/ui/Button";
import { Flash } from "@/components/ui/Flash";
import { AssistantIcon } from "@/components/ui/icons";

/**
 * Presentation only (Phase 9.5) — useChat/DefaultChatTransport/sendMessage/
 * status/error, the streaming behavior, and the tenant-scoped tool
 * architecture behind /api/ai are all unchanged. white-space: pre-wrap
 * (not a markdown renderer) is what makes the model's existing line breaks
 * render correctly — no new dependency.
 */
export default function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/ai" }),
  });
  const bottomRef = useRef<HTMLDivElement>(null);

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isBusy]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isBusy) {
      return;
    }
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="mt-6 flex max-w-2xl flex-col gap-4">
      <div className="flex min-h-100 flex-col gap-3 overflow-y-auto rounded-lg border border-border-subtle bg-surface-1 p-4">
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
            <AssistantIcon className="h-6 w-6 text-text-tertiary" />
            <p className="max-w-xs text-sm text-text-secondary">
              Ask a question about your gym&rsquo;s members, revenue, expenses,
              attendance, or plans — e.g. &ldquo;How does revenue this month
              compare to last month?&rdquo; or &ldquo;Which memberships are
              expiring soon?&rdquo;
            </p>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                message.role === "user"
                  ? "bg-accent-strong text-accent-foreground"
                  : "bg-surface-3 text-foreground"
              }`}
            >
              {message.parts
                .filter((part) => part.type === "text")
                .map((part, i) => (
                  <span key={i}>{part.text}</span>
                ))}
            </div>
          </div>
        ))}
        {isBusy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-lg bg-surface-3 px-3.5 py-2.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <Flash error={error ? `Something went wrong: ${error.message}` : undefined} />

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your gym..."
          aria-label="Message"
          className="flex-1 rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          disabled={isBusy}
        />
        <Button type="submit" variant="primary" disabled={isBusy || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
