"use client";

import { useMemo } from "react";
import { AlertTriangle, Eye, EyeOff, Grid3x3, Hand, Magnet, Maximize, Minus, MousePointer2, Plus, Ruler, ScanLine, Shield, Sun } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { sceneMetrics, validateScene } from "@/lib/scene/validate";
import { formatPrice, formatSqft } from "@/lib/scene/units";
import { useDisplayScene, useEditor } from "@/store/editor";
import { useViewport } from "@/store/viewport";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function ToolBtn({ active, label, shortcut, onClick, children }: { active?: boolean; label: string; shortcut?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tip label={label} shortcut={shortcut}>
      <button
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={cn("flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4", active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground")}
      >
        {children}
      </button>
    </Tip>
  );
}

export function CanvasToolbar() {
  const ed = useEditor(
    useShallow((s) => ({
      view: s.view,
      tool: s.tool,
      showGrid: s.showGrid,
      snapToGrid: s.snapToGrid,
      showDims: s.showDims,
      showClearances: s.showClearances,
      showBackground: s.showBackground,
      hasBg: !!s.scene.background,
      wallsVisible: s.wallsVisible,
      lighting: s.scene.style.lighting,
    })),
  );
  const scale = useViewport((s) => s.scale);
  const st = useEditor.getState();

  if (ed.view === "2d") {
    return (
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-xl border bg-card/95 p-1 shadow-md backdrop-blur" data-testid="canvas-toolbar">
        <ToolBtn label="Select" shortcut="V" active={ed.tool === "select"} onClick={() => st.setTool("select")}>
          <MousePointer2 />
        </ToolBtn>
        <ToolBtn label="Pan (or hold Space)" shortcut="H" active={ed.tool === "pan"} onClick={() => st.setTool("pan")}>
          <Hand />
        </ToolBtn>
        <ToolBtn label="Measure" shortcut="M" active={ed.tool === "measure"} onClick={() => st.setTool(ed.tool === "measure" ? "select" : "measure")}>
          <Ruler />
        </ToolBtn>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <ToolBtn label="Zoom out" shortcut="−" onClick={() => useViewport.getState().zoomBy(1 / 1.25)}>
          <Minus />
        </ToolBtn>
        <span className="w-11 text-center font-mono text-[11px] tabular-nums text-muted-foreground">{Math.round((scale / 1.6) * 100)}%</span>
        <ToolBtn label="Zoom in" shortcut="+" onClick={() => useViewport.getState().zoomBy(1.25)}>
          <Plus />
        </ToolBtn>
        <ToolBtn label="Fit to screen" shortcut="F" onClick={() => useViewport.getState().requestFit()}>
          <Maximize />
        </ToolBtn>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <ToolBtn label="Grid" shortcut="G" active={ed.showGrid} onClick={() => st.toggle("showGrid")}>
          <Grid3x3 />
        </ToolBtn>
        <ToolBtn label="Snapping (hold Alt to bypass)" active={ed.snapToGrid} onClick={() => st.toggle("snapToGrid")}>
          <Magnet />
        </ToolBtn>
        <ToolBtn label="Measurements" active={ed.showDims} onClick={() => st.toggle("showDims")}>
          <ScanLine />
        </ToolBtn>
        <ToolBtn label="Clearance zones" active={ed.showClearances} onClick={() => st.toggle("showClearances")}>
          <Shield />
        </ToolBtn>
        {ed.hasBg && (
          <ToolBtn label="Original floor plan layer" active={ed.showBackground} onClick={() => st.toggle("showBackground")}>
            {ed.showBackground ? <Eye /> : <EyeOff />}
          </ToolBtn>
        )}
      </div>
    );
  }

  if (ed.view === "walk") return null;
  return (
    <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-xl border bg-card/95 p-1 shadow-md backdrop-blur">
      {ed.view === "3d" &&
        (["full", "cutaway", "hidden"] as const).map((m) => (
          <button
            key={m}
            onClick={() => st.setWallsVisible(m)}
            className={cn("rounded-md px-2.5 py-1.5 text-[12px] capitalize text-muted-foreground hover:bg-accent", ed.wallsVisible === m && "bg-primary text-primary-foreground hover:bg-primary")}
          >
            {m === "full" ? "Full walls" : m === "cutaway" ? "Cutaway" : "No walls"}
          </button>
        ))}
      <div className="mx-0.5 h-5 w-px bg-border" />
      <Sun className="ml-1 size-4 text-muted-foreground" />
      {(["day", "golden", "evening"] as const).map((l) => (
        <button
          key={l}
          onClick={() => st.apply((s) => ({ ...s, style: { ...s.style, lighting: l } }))}
          className={cn("rounded-md px-2.5 py-1.5 text-[12px] capitalize text-muted-foreground hover:bg-accent", ed.lighting === l && "bg-primary text-primary-foreground hover:bg-primary")}
        >
          {l === "golden" ? "Golden hour" : l}
        </button>
      ))}
    </div>
  );
}

export function StatusPill() {
  const scene = useDisplayScene();
  const issues = useMemo(() => validateScene(scene), [scene]);
  const m = useMemo(() => sceneMetrics(scene, issues), [scene, issues]);
  const notable = issues.filter((i) => i.severity !== "info").length;
  return (
    <button
      onClick={() => {
        const s = useEditor.getState();
        s.select([]);
        s.setRightTab("inspect");
      }}
      className="absolute right-3 bottom-3 z-10 flex items-center gap-3 rounded-xl border bg-card/95 px-3 py-2 text-[12px] shadow-md backdrop-blur hover:bg-card"
      data-testid="status-pill"
    >
      <span className="text-muted-foreground">{formatSqft(m.totalArea)}</span>
      <span className="text-muted-foreground">{m.itemCount} pieces</span>
      <span className="font-medium">{formatPrice(m.totalPrice)}</span>
      {notable === 0 ? (
        <span className="flex items-center gap-1 text-success">
          <span className="size-1.5 rounded-full bg-success" /> Space check passed
        </span>
      ) : (
        <span className={cn("flex items-center gap-1", m.errors ? "text-destructive" : "text-warning")}>
          <AlertTriangle className="size-3.5" /> {notable} to review
        </span>
      )}
    </button>
  );
}
