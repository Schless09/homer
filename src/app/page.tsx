"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Copy, FileJson, LayoutTemplate, Loader2, MoreHorizontal, Plus, Sparkles, SquareDashed, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { blankProject, demoProject, furnishedStudio, newProject, projectFromSample } from "@/lib/projects";
import { ProjectFileSchema, dataUrlToBlob } from "@/lib/export";
import { newId } from "@/lib/scene/ids";
import { PALETTES, type Palette } from "@/lib/scene/palette";
import { SAMPLE_PLANS } from "@/lib/scene/samples";
import { getRepository, type ProjectMeta } from "@/lib/storage";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAIStatus, modelLabel } from "@/components/editor/useAIStatus";
import { useStorageMode } from "@/components/useStorageMode";
import type { Project } from "@/lib/scene/types";

const SEED_KEY = "homer.seeded.v1";

function timeAgo(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

function PlanSketch({ id }: { id: string }) {
  // tiny line drawings of the sample plans
  const paths: Record<string, string> = {
    studio: "M4 4H76V52H4Z M24 4V23 M4 23H24",
    "1br": "M4 4H84V68H4Z M48 4V68 M48 36H84 M68 36V56 M48 56H68",
    "2br": "M4 4H100V72H4Z M52 4V72 M52 36H100 M70 36V72 M52 56H70",
  };
  return (
    <svg viewBox="0 0 104 76" className="h-16 w-24" aria-hidden>
      <path d={paths[id]} fill="none" stroke="#1f1e1c" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const status = useAIStatus();
  const storage = useStorageMode();
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setProjects(await getRepository().list());
    } catch (e) {
      console.error(e);
      setProjects([]);
      toast.error("Couldn't load your projects.");
    }
  }, []);

  useEffect(() => {
    (async () => {
      const repo = getRepository();
      let seeded = false;
      try {
        seeded = !!localStorage.getItem(SEED_KEY);
      } catch {
        /* ignore */
      }
      if (!seeded) {
        try {
          const existing = await repo.list();
          if (existing.length === 0) await repo.create(demoProject());
          localStorage.setItem(SEED_KEY, "1");
        } catch (e) {
          console.error(e);
        }
      }
      await refresh();
    })();
  }, [refresh]);

  const open = async (p: Project, key: string) => {
    setBusy(key);
    try {
      await getRepository().create(p);
      router.push(`/project/${p.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the project.");
      setBusy(null);
    }
  };

  const fromTemplate = (palette: Palette) => {
    return open(furnishedStudio(`${palette.name} studio`, palette), `tpl-${palette.id}`);
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = ProjectFileSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error("That isn't a valid Homer project file.");
      const { project, background } = parsed.data;
      const scene = project.scene;
      if (background && scene.background) {
        const assetId = newId("asset");
        await getRepository().putAsset(assetId, dataUrlToBlob(background));
        scene.background = { ...scene.background, assetId };
      } else scene.background = undefined;
      const p = newProject(project.name, project.unitType, scene);
      p.conversation = project.conversation as Project["conversation"];
      p.preferences = project.preferences;
      await open(p, "import");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    }
  };

  const duplicate = async (id: string) => {
    const repo = getRepository();
    const p = await repo.get(id);
    if (!p) return;
    const copy = { ...newProject(`${p.name} (copy)`, p.unitType, p.scene), conversation: p.conversation, preferences: p.preferences, thumbnail: p.thumbnail };
    await repo.create(copy);
    refresh();
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    await getRepository().remove(id);
    refresh();
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Logo />
          <div className="ml-auto flex items-center gap-2">
            {status && (status.claude ? <Badge variant="brand"><Sparkles /> {modelLabel(status.model)}</Badge> : <Badge variant="secondary">AI demo mode</Badge>)}
            {storage && <Badge variant="outline">{storage === "supabase" ? "Cloud sync" : "Saved in this browser"}</Badge>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24">
        <section className="pt-14 pb-10">
          <h1 className="max-w-3xl font-display text-[44px] leading-[1.05] tracking-tight sm:text-6xl">
            Upload your apartment. <span className="italic text-brand">Tell AI how you want to live.</span> See it furnished before you buy anything.
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] text-muted-foreground">
            A dimensionally accurate 2D and 3D planner with an AI interior designer that understands walls, doors, walkways and real furniture sizes.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-[12px] font-semibold tracking-wider text-muted-foreground uppercase">Start a new project</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/new" className="group flex flex-col justify-between rounded-2xl border bg-primary p-5 text-primary-foreground transition-transform hover:-translate-y-0.5" data-testid="start-upload">
              <Upload className="size-5" />
              <div className="mt-8">
                <div className="text-[16px] font-semibold">Upload a floor plan</div>
                <div className="mt-1 text-[13px] opacity-75">PNG, JPG or PDF · AI reads walls & rooms</div>
              </div>
              <ArrowRight className="mt-3 size-4 opacity-60 transition-transform group-hover:translate-x-1" />
            </Link>
            {SAMPLE_PLANS.map((s) => (
              <button
                key={s.id}
                onClick={() => open(projectFromSample(s.id), s.id)}
                className="flex flex-col rounded-2xl border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
                data-testid={`start-${s.id}`}
              >
                <div className="flex items-start justify-between">
                  <PlanSketch id={s.id} />
                  {busy === s.id && <Loader2 className="size-4 animate-spin" />}
                </div>
                <div className="mt-auto pt-4">
                  <div className="text-[16px] font-semibold">
                    {s.name} <span className="font-normal text-muted-foreground">{s.sqft}</span>
                  </div>
                  <div className="mt-1 text-[13px] text-muted-foreground">{s.description}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => open(blankProject(), "blank")}>
              <SquareDashed /> Blank room
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FileJson /> Import project file
            </Button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" onChange={(e) => importFile(e.target.files?.[0])} />
          </div>
        </section>

        <section className="mt-12">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[12px] font-semibold tracking-wider text-muted-foreground uppercase">Your projects</h2>
            <Button variant="ghost" size="sm" onClick={() => open(demoProject(), "demo")}>
              <Plus /> New demo studio
            </Button>
          </div>
          {projects === null ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-56 animate-pulse rounded-2xl border bg-card" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">No projects yet. Start with a sample apartment or upload your floor plan.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="project-list">
              {projects.map((p) => (
                <div key={p.id} className="group relative overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md">
                  <Link href={`/project/${p.id}`} className="block" data-testid="project-card">
                    <div className="flex h-40 items-center justify-center overflow-hidden bg-canvas">
                      {p.thumbnail ? (
                        <img src={p.thumbnail} alt="" className="size-full object-cover" />
                      ) : (
                        <LayoutTemplate className="size-8 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="p-4">
                      <div className="truncate text-[15px] font-semibold">{p.name}</div>
                      <div className="mt-0.5 text-[12px] text-muted-foreground">
                        {p.itemCount} pieces · edited {timeAgo(p.updatedAt)}
                      </div>
                    </div>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-xs" variant="secondary" className="absolute top-2 right-2 opacity-0 shadow-sm group-hover:opacity-100 focus:opacity-100" aria-label="Project actions">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => duplicate(p.id)}>
                        <Copy /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => remove(p.id, p.name)} className="text-destructive">
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-12">
          <h2 className="mb-1 text-[12px] font-semibold tracking-wider text-muted-foreground uppercase">Design templates</h2>
          <p className="mb-3 text-[13px] text-muted-foreground">A furnished studio in each style. Open one and keep designing, or ask the AI to adapt it.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PALETTES.map((p) => (
              <button key={p.id} onClick={() => fromTemplate(p)} className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm">
                <div className="grid size-12 shrink-0 grid-cols-2 overflow-hidden rounded-lg">
                  {[p.wallColor, p.wood, p.fabric, p.accent].map((c, i) => (
                    <span key={i} style={{ background: c }} />
                  ))}
                </div>
                <div>
                  <div className="text-[14px] font-medium">{p.name}</div>
                  <div className="text-[12px] capitalize text-muted-foreground">{p.styles.join(" · ")}</div>
                </div>
                {busy === `tpl-${p.id}` && <Loader2 className="ml-auto size-4 animate-spin" />}
              </button>
            ))}
          </div>
        </section>
        <footer className="mt-16 border-t pt-6 text-[12px] text-muted-foreground">
          Some products link to retail partners; we may earn a commission when you buy.{" "}
          <Link href="/disclosure" className="underline underline-offset-2">
            Affiliate disclosure
          </Link>
        </footer>
      </main>
    </div>
  );
}
