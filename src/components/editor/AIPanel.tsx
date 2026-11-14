"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, RotateCcw, Sparkles, User } from "lucide-react";
import { toast } from "sonner";
import { applyActions } from "@/lib/scene/actions";
import { newId } from "@/lib/scene/ids";
import type { DesignResponse } from "@/lib/ai/types";
import { useEditor } from "@/store/editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { modelLabel, useAIStatus } from "./useAIStatus";

const SUGGESTIONS_EMPTY = [
  "Furnish this apartment in a warm minimalist style",
  "Design this with a queen bed, sectional, TV, desk and a small dining area",
  "Give me three different layouts",
  "Design this space with a $3,000 budget",
];
const SUGGESTIONS_FURNISHED = [
  "Give me three layouts",
  "Can I fit a king bed?",
  "Find a better place for my desk",
  "Make it feel like a modern luxury apartment",
  "Maximize open floor space",
  "Is there enough room to walk around the bed?",
];

export function AIPanel() {
  const conversation = useEditor((s) => s.conversation);
  const furnished = useEditor((s) => s.scene.items.some((i) => !i.fixed));
  const previewing = useEditor((s) => !!s.preview);
  const status = useAIStatus();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation.length, busy]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    const store = useEditor.getState();
    if (store.preview) store.setPreview(null);
    const history = store.conversation.map((m) => ({ role: m.role, content: m.content }));
    store.addMessage({ role: "user", content: message });
    setInput("");
    setBusy(true);
    try {
      const { background: _bg, ...sceneNoBg } = store.scene;
      void _bg;
      const r = await fetch("/api/ai/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: sceneNoBg, message, history, preferences: store.preferences }),
      });
      const data = (await r.json()) as DesignResponse & { error?: string };
      if (!r.ok) throw new Error(data.error ?? `Request failed (${r.status})`);
      const current = useEditor.getState().scene;
      let proposalId: string | undefined;
      if (data.actions.length) {
        const res = applyActions(current, data.actions);
        proposalId = newId("prop");
        useEditor.getState().setPreview({
          id: proposalId,
          title: data.title ?? "AI proposal",
          summary: data.message,
          actions: data.actions,
          changes: res.applied,
          rejected: res.rejected.map((x) => ({ reason: x.reason })),
          scene: { ...res.scene, background: current.background },
          alternatives: data.alternatives,
          activeAlternative: data.alternatives?.[0]?.id,
          provider: data.provider,
        });
      }
      useEditor.getState().addMessage({ role: "assistant", content: data.message, provider: data.provider, proposalId });
      if (data.notice) toast.warning(data.notice);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      useEditor.getState().addMessage({ role: "assistant", content: `Sorry, I couldn't complete that: ${msg}`, provider: "demo" });
    } finally {
      setBusy(false);
      taRef.current?.focus();
    }
  };

  const suggestions = furnished ? SUGGESTIONS_FURNISHED : SUGGESTIONS_EMPTY;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="ai-panel">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-brand-soft text-brand">
            <Sparkles className="size-3.5" />
          </span>
          <span className="text-[13px] font-semibold">AI interior designer</span>
        </div>
        <div className="flex items-center gap-1">
          {status &&
            (status.claude ? (
              <Badge variant="brand">{modelLabel(status.model)}</Badge>
            ) : (
              <Tip label="Rule-based designer. Set ANTHROPIC_API_KEY to use Claude.">
                <Badge variant="secondary">Demo mode</Badge>
              </Tip>
            ))}
          {conversation.length > 0 && (
            <Tip label="Clear conversation">
              <Button size="icon-xs" variant="ghost" onClick={() => useEditor.getState().clearConversation()} aria-label="Clear conversation">
                <RotateCcw />
              </Button>
            </Tip>
          )}
        </div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 thin-scroll">
        {conversation.length === 0 && (
          <div className="animate-fade-up space-y-3 pt-4 text-center">
            <div className="font-display text-[26px] leading-tight">How do you want to live here?</div>
            <p className="mx-auto max-w-[260px] text-[13px] text-muted-foreground">
              Describe what you need. I&apos;ll furnish the space with real dimensions, keep walkways and doors clear, and show you a preview before anything changes.
            </p>
          </div>
        )}
        {conversation.map((m) => (
          <div key={m.id} className={cn("flex gap-2.5 animate-fade-up", m.role === "user" && "flex-row-reverse")}>
            <div className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full", m.role === "user" ? "bg-primary text-primary-foreground" : "bg-brand-soft text-brand")}>
              {m.role === "user" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
            </div>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap",
                m.role === "user" ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm border bg-card",
              )}
            >
              {m.content}
              {m.proposalId && (
                <div className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
                  {previewing && useEditor.getState().preview?.id === m.proposalId ? "Previewing on the canvas: accept or discard above." : "Proposal shown as a preview."}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex gap-2.5">
            <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
              <Bot className="size-3.5" />
            </div>
            <div className="shimmer w-48 rounded-2xl rounded-tl-sm border bg-card px-3.5 py-2.5 text-[13px] text-muted-foreground">Measuring the space…</div>
          </div>
        )}
      </div>

      <div className="border-t bg-card/60 p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {suggestions.slice(0, 4).map((s) => (
            <button
              key={s}
              disabled={busy}
              onClick={() => send(s)}
              className="rounded-full border bg-card px-2.5 py-1 text-left text-[11.5px] text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="relative"
        >
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder="e.g. I want a queen bed, a comfy sectional and a desk. Warm and minimal."
            className="w-full resize-none rounded-xl border border-input bg-card px-3 py-2.5 pr-11 text-[13px] shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
            aria-label="Message the AI designer"
            data-testid="ai-input"
          />
          <Button type="submit" size="icon-xs" variant="brand" disabled={busy || !input.trim()} className="absolute right-2 bottom-3 rounded-full" aria-label="Send">
            <ArrowUp />
          </Button>
        </form>
      </div>
    </div>
  );
}
