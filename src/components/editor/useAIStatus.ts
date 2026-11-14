"use client";

import { useEffect, useState } from "react";
import type { AIStatus } from "@/lib/ai/types";

let cached: AIStatus | null = null;
let inflight: Promise<AIStatus> | null = null;

export function useAIStatus(): AIStatus | null {
  const [s, setS] = useState<AIStatus | null>(cached);
  useEffect(() => {
    if (cached) return;
    inflight ??= fetch("/api/status")
      .then((r) => r.json() as Promise<AIStatus>)
      .catch(() => ({ claude: false, model: null, imageProvider: null, storage: "local" as const }));
    inflight.then((v) => {
      cached = v;
      setS(v);
    });
  }, []);
  return s;
}

export function modelLabel(model: string | null): string {
  if (!model) return "Claude";
  const m = model.match(/claude-(haiku|sonnet|opus|fable)-(\d+)-?(\d+)?/);
  if (!m) return model;
  const name = m[1][0].toUpperCase() + m[1].slice(1);
  return `Claude ${name} ${m[2]}${m[3] ? "." + m[3] : ""}`;
}
