"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowLeft, Check, FileUp, Loader2, Ruler, ScanSearch, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import type { FloorplanExtraction } from "@/lib/ai/floorplan-schema";
import { loadPlanFile, prepareForVision, type LoadedPlan } from "@/lib/import/image";
import { sceneFromExtraction, suggestScale } from "@/lib/import/fromExtraction";
import { newProject } from "@/lib/projects";
import { newId } from "@/lib/scene/ids";
import { emptyScene, type UnitType } from "@/lib/scene/types";
import { formatFtIn, parseLength } from "@/lib/scene/units";
import { getRepository } from "@/lib/storage";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAIStatus, modelLabel } from "@/components/editor/useAIStatus";

type Pt = { x: number; y: number };

export default function NewFromUploadPage() {
  const router = useRouter();
  const status = useAIStatus();
  const [plan, setPlan] = useState<LoadedPlan | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [points, setPoints] = useState<Pt[]>([]);
  const [length, setLength] = useState("");
  const [scale, setScale] = useState<{ inchesPerPx: number; source: string } | null>(null);
  const [extraction, setExtraction] = useState<{ data: FloorplanExtraction; factor: number } | null>(null);
  const [useExtraction, setUseExtraction] = useState(true);
  const [reading, setReading] = useState(false);
  const [name, setName] = useState("My apartment");
  const [unitType, setUnitType] = useState<UnitType>("studio");
  const [creating, setCreating] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setProgress(0.05);
    try {
      const p = await loadPlanFile(file, setProgress);
      setPlan(p);
      setPoints([]);
      setScale(null);
      setExtraction(null);
      setName(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 60) || "My apartment");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setProgress(null);
    }
  };

  const onImageClick = (e: React.MouseEvent) => {
    if (!plan || !imgRef.current) return;
    const r = imgRef.current.getBoundingClientRect();
    const k = plan.width / r.width;
    const p = { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
    setPoints((pts) => (pts.length >= 2 ? [p] : [...pts, p]));
  };

  const pxLen = points.length === 2 ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) : 0;
  const applyCalibration = () => {
    const inches = parseLength(length);
    if (!inches || pxLen < 10) {
      toast.error("Click both ends of a known measurement and enter its length, e.g. 12' 6\".");
      return;
    }
    setScale({ inchesPerPx: inches / pxLen, source: `your measurement (${formatFtIn(inches)})` });
  };

  const readWithAI = async () => {
    if (!plan) return;
    setReading(true);
    try {
      const v = await prepareForVision(plan.url);
      const r = await fetch("/api/ai/floorplan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: v.data, mediaType: "image/jpeg", width: v.width, height: v.height }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "AI reading failed");
      const ex = d.extraction as FloorplanExtraction;
      setExtraction({ data: ex, factor: v.factor });
      toast.success(`Found ${ex.walls.length} walls, ${ex.rooms.length} rooms, ${ex.openings.length} doors & windows. Review the overlay.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI reading failed");
    } finally {
      setReading(false);
    }
  };

  const suggestion = extraction ? suggestScale(extraction.data, extraction.factor) : null;

  const create = async () => {
    if (!plan || !scale) return;
    setCreating(true);
    try {
      const repo = getRepository();
      const assetId = newId("asset");
      await repo.putAsset(assetId, plan.blob);
      const base = emptyScene();
      const withBg = {
        ...base,
        background: { assetId, x: 0, y: 0, scale: scale.inchesPerPx, widthPx: plan.width, heightPx: plan.height, opacity: extraction && useExtraction ? 0.3 : 0.6, visible: true, calibrated: true },
        scaleConfirmed: true,
      };
      const scene = extraction && useExtraction ? sceneFromExtraction(extraction.data, extraction.factor, scale.inchesPerPx, withBg) : withBg;
      const p = newProject(name.trim() || "My apartment", unitType, scene);
      await repo.create(p);
      router.push(`/project/${p.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the project.");
      setCreating(false);
    }
  };

  const step = !plan ? 1 : !scale ? 2 : 3;

  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center gap-3 border-b bg-card px-4">
        <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Dashboard
        </Link>
        <div className="mx-auto">
          <Logo />
        </div>
        <div className="w-24" />
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="font-display text-4xl">Import your floor plan</h1>
        <p className="mt-1 text-muted-foreground">PNG, JPG or PDF. We keep the original as a reference layer you can trace over.</p>
        <ol className="mt-6 flex flex-wrap gap-2 text-[13px]">
          {["Upload", "Set the scale", "Create"].map((s, i) => (
            <li key={s} className={cn("flex items-center gap-2 rounded-full border px-3 py-1", step === i + 1 ? "border-primary bg-primary text-primary-foreground" : step > i + 1 ? "bg-card" : "text-muted-foreground")}>
              {step > i + 1 ? <Check className="size-3.5" /> : <span className="font-mono text-[11px]">{i + 1}</span>} {s}
            </li>
          ))}
        </ol>

        {!plan ? (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onFile(e.dataTransfer.files[0]);
            }}
            className={cn("mt-6 flex h-80 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card transition-colors", dragOver && "border-brand bg-brand-soft")}
          >
            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} data-testid="plan-upload" />
            {progress !== null ? (
              <>
                <Loader2 className="size-6 animate-spin text-brand" />
                <div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-brand transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <span className="text-sm text-muted-foreground">Reading file…</span>
              </>
            ) : (
              <>
                <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <Upload className="size-5" />
                </span>
                <span className="text-[15px] font-medium">Drop a floor plan here, or click to browse</span>
                <span className="text-[13px] text-muted-foreground">Studio, 1-bedroom, 2-bedroom… any plan with clear walls works best</span>
              </>
            )}
          </label>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
            <div className="relative overflow-hidden rounded-2xl border bg-white">
              <div className="relative cursor-crosshair select-none" onClick={onImageClick}>
                <img ref={imgRef} src={plan.url} alt="Uploaded floor plan" className="block w-full" draggable={false} />
                <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${plan.width} ${plan.height}`} preserveAspectRatio="none">
                  {extraction && useExtraction && (
                    <g>
                      {extraction.data.rooms.map((r, i) => (
                        <polygon key={i} points={r.polygon.map((p) => `${p.x / extraction.factor},${p.y / extraction.factor}`).join(" ")} fill="rgba(180,101,74,0.10)" stroke="none" />
                      ))}
                      {extraction.data.walls.map((w, i) => (
                        <line key={i} x1={w.x1 / extraction.factor} y1={w.y1 / extraction.factor} x2={w.x2 / extraction.factor} y2={w.y2 / extraction.factor} stroke="#b4654a" strokeWidth={Math.max(3, plan.width / 300)} strokeLinecap="round" opacity={0.85} />
                      ))}
                      {extraction.data.openings.map((o, i) => (
                        <line key={`o${i}`} x1={o.x1 / extraction.factor} y1={o.y1 / extraction.factor} x2={o.x2 / extraction.factor} y2={o.y2 / extraction.factor} stroke={o.kind === "window" ? "#4b6584" : "#3f7a52"} strokeWidth={Math.max(4, plan.width / 220)} strokeLinecap="round" />
                      ))}
                    </g>
                  )}
                  {points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={Math.max(5, plan.width / 160)} fill="#b4654a" stroke="#fff" strokeWidth={2} />
                  ))}
                  {points.length === 2 && <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} stroke="#b4654a" strokeWidth={Math.max(2, plan.width / 400)} strokeDasharray="8 6" />}
                </svg>
              </div>
            </div>

            <div className="space-y-4">
              <section className="space-y-3 rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 text-[14px] font-semibold">
                  <Ruler className="size-4 text-brand" /> Set the real-world scale
                </div>
                <p className="text-[13px] text-muted-foreground">Click both ends of a wall or dimension line whose length you know, then enter it. We never guess dimensions.</p>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label>Length between the two points</Label>
                    <Input value={length} onChange={(e) => setLength(e.target.value)} placeholder={`e.g. 12' 6"`} disabled={points.length < 2} data-testid="calib-length" />
                  </div>
                  <Button onClick={applyCalibration} disabled={points.length < 2 || !length} data-testid="calib-apply">
                    Apply
                  </Button>
                </div>
                <div className="text-[12px] text-muted-foreground">{points.length < 2 ? `${2 - points.length} point${points.length === 1 ? "" : "s"} to go` : `${Math.round(pxLen)} px selected`}</div>
                {scale && (
                  <div className="flex items-center gap-2 rounded-lg bg-[#e6f0e8] px-3 py-2 text-[12px] text-success">
                    <Check className="size-4" /> Scale set from {scale.source}: 100 px = {formatFtIn(scale.inchesPerPx * 100)}. Plan is about {formatFtIn(plan.width * scale.inchesPerPx)} × {formatFtIn(plan.height * scale.inchesPerPx)}.
                  </div>
                )}
              </section>

              <section className="space-y-3 rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[14px] font-semibold">
                    <ScanSearch className="size-4 text-brand" /> Read walls & rooms with AI
                  </div>
                  {status?.claude && <Badge variant="brand">{modelLabel(status.model)}</Badge>}
                </div>
                {status && !status.claude ? (
                  <p className="text-[13px] text-muted-foreground">
                    AI plan reading isn&apos;t configured on this deployment (set <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code>). You can trace rooms quickly with the Draw room tool in the editor.
                  </p>
                ) : (
                  <>
                    <p className="text-[13px] text-muted-foreground">Detects walls, doors, windows, rooms and fixtures. You review and correct everything in the editor.</p>
                    <Button variant="outline" className="w-full" onClick={readWithAI} disabled={reading || !status}>
                      {reading ? <Loader2 className="animate-spin" /> : <Sparkles />} {reading ? "Reading floor plan…" : extraction ? "Read again" : "Read floor plan"}
                    </Button>
                    {extraction && (
                      <div className="space-y-2 text-[12px]">
                        <div className="flex items-center justify-between">
                          <span>Use detected geometry</span>
                          <Switch checked={useExtraction} onCheckedChange={setUseExtraction} />
                        </div>
                        {suggestion && !scale && (
                          <div className="rounded-lg border border-brand/30 bg-brand-soft p-2.5">
                            <div className="text-brand">Suggested scale from {suggestion.basis}: 100 px = {formatFtIn(suggestion.inchesPerPx * 100)}.</div>
                            <Button size="sm" variant="brand" className="mt-2" onClick={() => setScale({ inchesPerPx: suggestion.inchesPerPx, source: suggestion.basis })}>
                              Confirm this scale
                            </Button>
                          </div>
                        )}
                        {extraction.data.notes && <p className="text-muted-foreground">Note: {extraction.data.notes}</p>}
                      </div>
                    )}
                  </>
                )}
              </section>

              <section className={cn("space-y-3 rounded-xl border bg-card p-4", !scale && "opacity-60")}>
                <div className="space-y-1">
                  <Label>Project name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Unit type</Label>
                  <div className="flex gap-1.5">
                    {(["studio", "1br", "2br", "custom"] as const).map((u) => (
                      <button key={u} onClick={() => setUnitType(u)} className={cn("rounded-full border px-3 py-1 text-[12px]", unitType === u ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
                        {u === "studio" ? "Studio" : u === "1br" ? "1 BR" : u === "2br" ? "2 BR" : "Other"}
                      </button>
                    ))}
                  </div>
                </div>
                <Button className="w-full" size="lg" disabled={!scale || creating} onClick={create} data-testid="create-from-upload">
                  {creating ? <Loader2 className="animate-spin" /> : <FileUp />} Create project
                </Button>
                {!scale && <p className="text-[12px] text-muted-foreground">Set the scale first so furniture appears at true size.</p>}
                <button className="w-full text-center text-[12px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => { setPlan(null); setPoints([]); setScale(null); setExtraction(null); }}>
                  Choose a different file
                </button>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
