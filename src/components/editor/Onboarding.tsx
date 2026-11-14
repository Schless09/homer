"use client";

import { useEffect, useState } from "react";
import { MousePointerClick, Move3d, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const KEY = "homer.onboarding.v1";

/** First-run tips, dismissed per browser. */
export function Onboarding() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(!localStorage.getItem(KEY));
    } catch {
      setShow(false);
    }
  }, []);
  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };
  const tips = [
    { icon: MousePointerClick, title: "Click or drag furniture in", body: "Every piece is placed at its real size. Drag to move; pieces snap to walls and line up with each other." },
    { icon: Sparkles, title: "Ask the AI designer", body: "Describe how you want to live. Changes arrive as a preview you can accept or discard." },
    { icon: Move3d, title: "Switch to 3D anytime", body: "Press 2 for 3D, 3 for top-down, 4 to walk through. Both views edit the same design." },
  ];
  return (
    <div className="absolute top-20 left-1/2 z-20 w-[min(560px,calc(100%-24px))] -translate-x-1/2 animate-fade-up rounded-xl border bg-card p-4 shadow-xl" role="dialog" aria-label="Getting started">
      <button onClick={close} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground" aria-label="Dismiss tips">
        <X className="size-4" />
      </button>
      <div className="font-display text-xl">Welcome to your space</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {tips.map((t) => (
          <div key={t.title} className="space-y-1">
            <t.icon className="size-4 text-brand" />
            <div className="text-[13px] font-medium">{t.title}</div>
            <div className="text-[12px] leading-snug text-muted-foreground">{t.body}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button size="sm" onClick={close} data-testid="onboarding-close">
          Got it
        </Button>
      </div>
    </div>
  );
}
