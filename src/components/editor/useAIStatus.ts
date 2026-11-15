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
      .catch(() => ({ claude: false, model: null, imageProvider: null, floorplanProvider: null, floorplanModel: null, storage: "local" as const }));
    inflight.then((v) => {
      cached = v;
      setS(v);
    });
  }, []);
  return s;
}

export function modelLabel(model: string | null): string {
  if (!model) return "AI";
  const g = model.match(/^gemini-([\d.]+)-?(pro|flash-lite|flash)?/);
  if (g) return `Gemini ${g[1]}${g[2] ? " " + g[2].replace("-lite", " Lite").replace(/^./, (c) => c.toUpperCase()) : ""}`;
  const m = model.match(/claude-(haiku|sonnet|opus|fable)-(\d+)-?(\d+)?/);
  if (!m) return model;
  const name = m[1][0].toUpperCase() + m[1].slice(1);
  return `Claude ${name} ${m[2]}${m[3] ? "." + m[3] : ""}`;
}
