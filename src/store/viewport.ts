"use client";

import { create } from "zustand";
import type Konva from "konva";

interface ViewportState {
  scale: number;
  x: number;
  y: number;
  fitToken: number;
  stage: Konva.Stage | null;
  /** last captured image of the 3D view (for AI rendering) */
  capture3d: (() => string | null) | null;
  set(v: Partial<Pick<ViewportState, "scale" | "x" | "y">>): void;
  requestFit(): void;
  zoomBy(factor: number, center?: { x: number; y: number }): void;
  setStage(s: Konva.Stage | null): void;
  setCapture3d(fn: (() => string | null) | null): void;
}

export const useViewport = create<ViewportState>((set, get) => ({
  scale: 1.6,
  x: 60,
  y: 60,
  fitToken: 0,
  stage: null,
  capture3d: null,
  set: (v) => set(v),
  requestFit: () => set((s) => ({ fitToken: s.fitToken + 1 })),
  zoomBy(factor, center) {
    const s = get();
    const stage = s.stage;
    const c = center ?? (stage ? { x: stage.width() / 2, y: stage.height() / 2 } : { x: 400, y: 300 });
    const next = Math.max(0.15, Math.min(12, s.scale * factor));
    const wx = (c.x - s.x) / s.scale;
    const wy = (c.y - s.y) / s.scale;
    set({ scale: next, x: c.x - wx * next, y: c.y - wy * next });
  },
  setStage: (stage) => set({ stage }),
  setCapture3d: (capture3d) => set({ capture3d }),
}));
