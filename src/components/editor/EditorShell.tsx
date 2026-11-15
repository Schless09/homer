"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { getRepository } from "@/lib/storage";
import { useEditor } from "@/store/editor";
import { useViewport } from "@/store/viewport";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TopBar } from "./TopBar";
import { LeftPanel } from "./LeftPanel";
import { AIPanel } from "./AIPanel";
import { Inspector } from "./Inspector";
import { CanvasToolbar, StatusPill } from "./CanvasToolbar";
import { PreviewBar } from "./PreviewBar";
import { Onboarding } from "./Onboarding";
import { useStorageMode } from "@/components/useStorageMode";
import { loadRetailerCatalog } from "@/components/useCatalog";

const PlanCanvas = dynamic(() => import("./plan/PlanCanvas"), { ssr: false, loading: () => <CanvasLoading label="Loading floor plan…" /> });
const Scene3D = dynamic(() => import("./three/Scene3D"), { ssr: false, loading: () => <CanvasLoading label="Building 3D scene…" /> });

function CanvasLoading({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-canvas text-[13px] text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" /> {label}
    </div>
  );
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const s = useEditor.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        s.duplicateSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === "a" && s.view === "2d") {
        e.preventDefault();
        s.select(s.scene.items.filter((i) => !i.fixed).map((i) => i.id));
        return;
      }
      if (s.preview) {
        if (e.key === "Enter") s.acceptPreview();
        if (e.key === "Escape") s.setPreview(null);
        return;
      }
      if (mod) return;
      switch (e.key) {
        case "Delete":
        case "Backspace":
          if (s.selection.length) {
            e.preventDefault();
            s.removeSelected();
          }
          break;
        case "Escape":
          s.select([]);
          s.setTool("select");
          break;
        case "r":
        case "R":
          if (s.selection.length) s.rotateSelected(e.shiftKey ? -90 : 90);
          break;
        case "e":
          if (s.selection.length) s.rotateSelected(15);
          break;
        case "q":
          if (s.selection.length) s.rotateSelected(-15);
          break;
        case "ArrowUp":
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight": {
          if (!s.selection.length || s.view === "walk") return;
          e.preventDefault();
          const step = e.shiftKey ? 12 : 1;
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          s.nudgeSelected(dx, dy);
          break;
        }
        case "v":
          s.setTool("select");
          break;
        case "h":
          s.setTool("pan");
          break;
        case "m":
          s.setTool(s.tool === "measure" ? "select" : "measure");
          break;
        case "w":
          if (s.view === "2d") s.setTool(s.tool === "wall" ? "select" : "wall");
          break;
        case "g":
          s.toggle("showGrid");
          break;
        case "f":
          useViewport.getState().requestFit();
          break;
        case "+":
        case "=":
          useViewport.getState().zoomBy(1.25);
          break;
        case "-":
          useViewport.getState().zoomBy(0.8);
          break;
        case "1":
          s.setView("2d");
          break;
        case "2":
          s.setView("3d");
          break;
        case "3":
          s.setView("top");
          break;
        case "4":
          s.setView("walk");
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** Debounced autosave with optimistic concurrency (revision check). */
function useAutosave() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const pending = useRef(false);

  const save = useCallback(async () => {
    if (saving.current) {
      pending.current = true;
      return;
    }
    const s = useEditor.getState();
    if (!s.projectId || s.saveStatus === "conflict") return;
    saving.current = true;
    s.setSaveStatus("saving");
    try {
      const stage = useViewport.getState().stage;
      if (stage && s.view === "2d") {
        try {
          s.setThumbnail(stage.toDataURL({ pixelRatio: Math.min(0.5, 480 / Math.max(1, stage.width())), mimeType: "image/jpeg", quality: 0.7 }));
        } catch {
          /* thumbnail is best-effort */
        }
      }
      const p = useEditor.getState().toProject();
      const res = await getRepository().save(p, p.revision);
      if (res.ok) {
        useEditor.getState().setRevision(res.revision);
        useEditor.getState().setSaveStatus(pending.current ? "dirty" : "saved");
      } else {
        useEditor.getState().setSaveStatus("conflict");
        toast.warning("This project was changed in another tab or device.", {
          duration: Infinity,
          action: {
            label: "Keep mine",
            onClick: async () => {
              const mine = useEditor.getState().toProject();
              const r = await getRepository().save(mine, res.conflict.revision);
              if (r.ok) {
                useEditor.getState().setRevision(r.revision);
                useEditor.getState().setSaveStatus("saved");
              }
            },
          },
          cancel: { label: "Load theirs", onClick: () => useEditor.getState().load(res.conflict) },
        });
      }
    } catch (err) {
      console.error(err);
      useEditor.getState().setSaveStatus("error");
    } finally {
      saving.current = false;
      if (pending.current) {
        pending.current = false;
        timer.current = setTimeout(save, 400);
      }
    }
  }, []);

  useEffect(() => {
    const unsub = useEditor.subscribe((s, prev) => {
      if (!s.loaded || s.version === prev.version || s.projectId !== prev.projectId) return;
      if (s.saveStatus !== "conflict" && s.saveStatus !== "saving") useEditor.getState().setSaveStatus("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(save, 900);
    });
    const flush = () => {
      if (useEditor.getState().saveStatus === "dirty") void save();
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      unsub();
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", flush);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [save]);
}

export function EditorShell({ projectId }: { projectId: string }) {
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const view = useEditor((s) => s.view);
  const rightTab = useEditor((s) => s.rightTab);
  const selectionCount = useEditor((s) => s.selection.length);

  useShortcuts();
  useAutosave();
  useStorageMode();

  useEffect(() => {
    // handle for automated end-to-end tests and debugging in the console
    (window as unknown as { __homer?: unknown }).__homer = { editor: useEditor, viewport: useViewport };
  }, []);

  useEffect(() => {
    if (window.innerWidth < 1100) setLeftOpen(false);
    if (window.innerWidth < 800) setRightOpen(false);
  }, []);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const repo = getRepository();
        // retailer products must be registered before the scene renders items that use them
        const [p] = await Promise.all([repo.get(projectId), Promise.race([loadRetailerCatalog(), new Promise((r) => setTimeout(r, 4000))])]);
        if (cancelled) return;
        if (!p) {
          setState("missing");
          return;
        }
        useEditor.getState().load(p);
        useEditor.getState().setView("2d");
        if (p.scene.background) {
          const blob = await repo.getAsset(p.scene.background.assetId);
          if (blob && !cancelled) {
            objectUrl = URL.createObjectURL(blob);
            useEditor.getState().setBackgroundUrl(objectUrl);
          }
        } else useEditor.getState().setBackgroundUrl(null);
        setState("ready");
      } catch (err) {
        console.error(err);
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId]);

  if (state === "loading") return <CanvasLoading label="Opening project…" />;
  if (state === "missing" || state === "error") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-center">
        <div className="font-display text-3xl">{state === "missing" ? "Project not found" : "Couldn't open this project"}</div>
        <p className="max-w-sm text-sm text-muted-foreground">
          {state === "missing" ? "Projects are saved in this browser unless the Supabase backend is configured. It may have been deleted or created on another device." : "Something went wrong loading it. Try again from the dashboard."}
        </p>
        <Button asChild>
          <Link href="/">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar onToggleLeft={() => setLeftOpen((v) => !v)} onToggleRight={() => setRightOpen((v) => !v)} />
      <div className="relative flex min-h-0 flex-1">
        <aside
          className={cn(
            "z-30 w-[300px] shrink-0 border-r bg-background transition-[margin] duration-200 max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-xl",
            !leftOpen && "-ml-[300px] max-lg:hidden",
          )}
          aria-label="Catalog and tools"
        >
          <LeftPanel />
        </aside>
        <main className="relative min-w-0 flex-1 overflow-hidden" aria-label="Design canvas">
          {view === "2d" ? <PlanCanvas /> : <Scene3D />}
          <PreviewBar />
          <CanvasToolbar />
          <StatusPill />
          <Onboarding />
        </main>
        <aside
          className={cn(
            "z-30 flex w-[360px] shrink-0 flex-col border-l bg-background transition-[margin] duration-200 max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:shadow-xl",
            !rightOpen && "-mr-[360px] max-md:hidden",
          )}
          aria-label="AI designer and properties"
        >
          <Tabs value={rightTab} onValueChange={(v) => useEditor.getState().setRightTab(v as "ai" | "inspect")} className="flex min-h-0 flex-1 flex-col">
            <div className="border-b px-3 py-2">
              <TabsList className="w-full">
                <TabsTrigger value="ai" data-testid="tab-ai">
                  <Sparkles /> AI designer
                </TabsTrigger>
                <TabsTrigger value="inspect" data-testid="tab-inspect">
                  <SlidersHorizontal /> {selectionCount ? "Properties" : "Overview"}
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="ai" className="min-h-0 data-[state=inactive]:hidden" forceMount>
              <AIPanel />
            </TabsContent>
            <TabsContent value="inspect" className="min-h-0 overflow-y-auto thin-scroll">
              <Inspector />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
