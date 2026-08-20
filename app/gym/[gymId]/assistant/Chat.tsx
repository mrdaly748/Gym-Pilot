"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

/**
 * Plain chat UI — no new UI library, matching the project's existing
 * unstyled-Tailwind convention. Streaming/loading state comes from
 * useChat's own `status`; errors from its own `error` — no custom
 * spinner/error infrastructure needed.
 */
export default function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/ai" }),
  });

  const isBusy = status === "submitted" || status === "streaming";

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
      <div className="flex min-h-[200px] flex-col gap-4 rounded border border-gray-200 p-4">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500">
            Ask a question about your gym&rsquo;s members, revenue, expenses,
            attendance, or plans — e.g. &ldquo;How does revenue this month
            compare to last month?&rdquo; or &ldquo;Which memberships are
            expiring soon?&rdquo;
          </p>
        )}
        {messages.map((message) => (
          <div key={message.id} className="text-sm">
            <span className="font-medium">
              {message.role === "user" ? "You: " : "Assistant: "}
            </span>
            {message.parts
              .filter((part) => part.type === "text")
              .map((part, i) => (
                <span key={i}>{part.text}</span>
              ))}
          </div>
        ))}
        {isBusy && <p className="text-sm text-gray-500">Thinking&hellip;</p>}
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          Something went wrong: {error.message}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your gym..."
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          disabled={isBusy}
        />
        <button
          type="submit"
          disabled={isBusy || !input.trim()}
          className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
