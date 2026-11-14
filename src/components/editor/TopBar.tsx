"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Box,
  Check,
  ChevronDown,
  CloudOff,
  Download,
  Footprints,
  Grid2x2,
  Loader2,
  PanelLeft,
  PanelRight,
  Redo2,
  Share2,
  Square,
  Undo2,
  Wand2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { getRepository } from "@/lib/storage";
import { dataUrlToBlob, download, projectFile, shoppingListCsv, slug } from "@/lib/export";
import { useEditor, type ViewMode } from "@/store/editor";
import { useViewport } from "@/store/viewport";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { RenderDialog } from "./RenderDialog";

const VIEWS: { id: ViewMode; label: string; icon: typeof Square; key: string }[] = [
  { id: "2d", label: "2D plan", icon: Square, key: "1" },
  { id: "3d", label: "3D", icon: Box, key: "2" },
  { id: "top", label: "Top", icon: Grid2x2, key: "3" },
  { id: "walk", label: "Walk", icon: Footprints, key: "4" },
];

export function TopBar({ onToggleLeft, onToggleRight }: { onToggleLeft: () => void; onToggleRight: () => void }) {
  const s = useEditor(useShallow((st) => ({ name: st.name, saveStatus: st.saveStatus, canUndo: st.past.length > 0, canRedo: st.future.length > 0, view: st.view })));
  const [renderOpen, setRenderOpen] = useState(false);

  const exportPng = () => {
    const st = useViewport.getState().stage;
    if (!st || useEditor.getState().view !== "2d") {
      toast.info("Switch to the 2D plan to export it as an image.");
      return;
    }
    const url = st.toDataURL({ pixelRatio: 2, mimeType: "image/png" });
    download(`${slug(s.name)}-plan.png`, dataUrlToBlob(url));
  };
  const export3d = () => {
    const cap = useViewport.getState().capture3d;
    if (!cap || useEditor.getState().view === "2d") {
      toast.info("Switch to a 3D view to export a snapshot.");
      return;
    }
    const url = cap();
    if (url) download(`${slug(s.name)}-3d.jpg`, dataUrlToBlob(url));
  };
  const exportProject = async () => {
    const p = useEditor.getState().toProject();
    const bg = p.scene.background ? await getRepository().getAsset(p.scene.background.assetId) : null;
    download(`${slug(p.name)}.homer.json`, await projectFile(p, bg), "application/json");
    toast.success("Project file downloaded. Anyone can open it from their dashboard with Import.");
  };
  const exportCsv = () => download(`${slug(s.name)}-shopping-list.csv`, shoppingListCsv(useEditor.getState().toProject()), "text/csv");

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3">
      <Link href="/" className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent" aria-label="Back to dashboard">
        <Logo />
      </Link>
      <Tip label="Toggle catalog panel">
        <Button size="icon-sm" variant="ghost" onClick={onToggleLeft} aria-label="Toggle left panel">
          <PanelLeft />
        </Button>
      </Tip>
      <div className="mx-1 h-5 w-px bg-border" />
      <input
        value={s.name}
        onChange={(e) => useEditor.getState().setName(e.target.value)}
        className="w-[min(260px,28vw)] truncate rounded-md bg-transparent px-2 py-1 text-[14px] font-medium outline-none hover:bg-accent focus:bg-accent"
        aria-label="Project name"
      />
      <SaveIndicator status={s.saveStatus} />

      <div className="ml-2 flex items-center gap-0.5">
        <Tip label="Undo" shortcut="⌘Z">
          <Button size="icon-sm" variant="ghost" disabled={!s.canUndo} onClick={() => useEditor.getState().undo()} aria-label="Undo">
            <Undo2 />
          </Button>
        </Tip>
        <Tip label="Redo" shortcut="⇧⌘Z">
          <Button size="icon-sm" variant="ghost" disabled={!s.canRedo} onClick={() => useEditor.getState().redo()} aria-label="Redo">
            <Redo2 />
          </Button>
        </Tip>
      </div>

      <div className="mx-auto flex items-center rounded-lg bg-muted p-0.5" role="tablist" aria-label="View">
        {VIEWS.map((v) => (
          <Tip key={v.id} label={v.label} shortcut={v.key}>
            <button
              role="tab"
              aria-selected={s.view === v.id}
              onClick={() => useEditor.getState().setView(v.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-all",
                s.view === v.id && "bg-card text-foreground shadow-sm",
              )}
              data-testid={`view-${v.id}`}
            >
              <v.icon className="size-3.5" />
              <span className="hidden md:inline">{v.label}</span>
            </button>
          </Tip>
        ))}
      </div>

      <Button size="sm" variant="outline" onClick={() => setRenderOpen(true)} className="hidden sm:inline-flex">
        <Wand2 /> Visualize
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            <Share2 /> <span className="hidden lg:inline">Share</span> <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Share & export</DropdownMenuLabel>
          <DropdownMenuItem onClick={exportProject}>
            <Download /> Project file (.homer.json)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportPng}>
            <Download /> 2D plan (PNG)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={export3d}>
            <Download /> 3D snapshot (JPG)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportCsv}>
            <Download /> Shopping list (CSV)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Live share links need the Supabase backend; project files work everywhere.</div>
        </DropdownMenuContent>
      </DropdownMenu>
      <Tip label="Toggle AI & properties panel">
        <Button size="icon-sm" variant="ghost" onClick={onToggleRight} aria-label="Toggle right panel">
          <PanelRight />
        </Button>
      </Tip>
      <RenderDialog open={renderOpen} onOpenChange={setRenderOpen} />
    </header>
  );
}

function SaveIndicator({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; label: string; cls?: string }> = {
    saved: { icon: <Check className="size-3.5" />, label: "Saved" },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, label: "Saving…" },
    dirty: { icon: <span className="size-1.5 rounded-full bg-warning" />, label: "Unsaved" },
    error: { icon: <CloudOff className="size-3.5" />, label: "Save failed", cls: "text-destructive" },
    conflict: { icon: <AlertTriangle className="size-3.5" />, label: "Conflict", cls: "text-warning" },
    idle: { icon: null, label: "" },
  };
  const m = map[status] ?? map.idle;
  return (
    <span className={cn("hidden items-center gap-1 text-[12px] text-muted-foreground sm:flex", m.cls)} aria-live="polite" data-testid="save-status">
      {m.icon}
      {m.label}
    </span>
  );
}
