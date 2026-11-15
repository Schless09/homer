"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, FileUp, Loader2, Ruler, ScanSearch, Upload } from "lucide-react";
import { toast } from "sonner";
import type { FloorplanExtraction } from "@/lib/ai/floorplan-schema";
import { cropPlan, loadPlanFile, prepareForVision, type LoadedPlan } from "@/lib/import/image";
import { planBounds, sceneFromExtraction, suggestScale, type ScaleSuggestion } from "@/lib/import/fromExtraction";
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
type Scale = { inchesPerPx: number; source: string; auto: boolean; confidence?: ScaleSuggestion["confidence"]; areaCheck?: ScaleSuggestion["areaCheck"] };

function unitTypeFrom(ex: FloorplanExtraction): UnitType {
  // "Living/Sleeping Room" in a studio is not a bedroom
  const bedrooms = ex.rooms.filter((r) => r.type === "bedroom" && !/living|studio|great room/i.test(r.name)).length;
  if (/studio/i.test(`${ex.plan_name ?? ""} ${ex.notes}`) && bedrooms <= 1) return "studio";
  return bedrooms === 0 ? "studio" : bedrooms === 1 ? "1br" : bedrooms === 2 ? "2br" : "custom";
}

export default function NewFromUploadPage() {
  const router = useRouter();
  const status = useAIStatus();
  const [plan, setPlan] = useState<LoadedPlan | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [extraction, setExtraction] = useState<{ data: FloorplanExtraction; factor: number } | null>(null);
  const [useExtraction, setUseExtraction] = useState(true);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [scale, setScale] = useState<Scale | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [points, setPoints] = useState<Pt[]>([]);
  const [length, setLength] = useState("");
  const [name, setName] = useState("My apartment");
  const [unitType, setUnitType] = useState<UnitType>("studio");
  const [creating, setCreating] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const attempted = useRef<string | null>(null);

  const aiAvailable = !!status?.floorplanProvider;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setProgress(0.05);
    try {
      const p = await loadPlanFile(file, setProgress);
      setPlan(p);
      setPoints([]);
      setScale(null);
      setExtraction(null);
      setReadError(null);
      setMeasuring(false);
      setName(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 60) || "My apartment");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setProgress(null);
    }
  };

  const readWithAI = useCallback(async (p: LoadedPlan) => {
    setReading(true);
    setReadError(null);
    try {
      const v = await prepareForVision(p.url);
      const r = await fetch("/api/ai/floorplan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: v.data, mediaType: "image/jpeg", width: v.width, height: v.height }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "AI reading failed");
      const ex = d.extraction as FloorplanExtraction;
      setExtraction({ data: ex, factor: v.factor });
      setUnitType(unitTypeFrom(ex));
      if (ex.plan_name) setName(ex.plan_name.slice(0, 60));
      const s = suggestScale(ex, v.factor);
      if (s) {
        setScale({ inchesPerPx: s.inchesPerPx, source: s.basis, auto: true, confidence: s.confidence, areaCheck: s.areaCheck });
        setMeasuring(s.confidence === "low");
      } else {
        setMeasuring(true);
      }
    } catch (e) {
      setReadError(e instanceof Error ? e.message : "AI reading failed");
      setMeasuring(true);
    } finally {
      setReading(false);
    }
  }, []);

  // read the plan automatically as soon as it's uploaded
  useEffect(() => {
    if (!plan || !status) return;
    if (!status.floorplanProvider) {
      setMeasuring(true);
      return;
    }
    if (attempted.current === plan.url) return;
    attempted.current = plan.url;
    void readWithAI(plan);
  }, [plan, status, readWithAI]);

  // the region we keep: just the blueprint, not the rest of a screenshot
  const crop = useMemo(() => {
    if (!plan) return null;
    const b = extraction && useExtraction ? planBounds(extraction.data, extraction.factor) : null;
    if (!b) return { x: 0, y: 0, w: plan.width, h: plan.height, cropped: false };
    const x = Math.max(0, b.x);
    const y = Math.max(0, b.y);
    return { x, y, w: Math.min(plan.width - x, b.w), h: Math.min(plan.height - y, b.h), cropped: true };
  }, [plan, extraction, useExtraction]);

  const toImage = (e: React.MouseEvent): Pt | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const onImageClick = (e: React.MouseEvent) => {
    if (!measuring) return;
    const p = toImage(e);
    if (p) setPoints((pts) => (pts.length >= 2 ? [p] : [...pts, p]));
  };

  const pxLen = points.length === 2 ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) : 0;
  const applyCalibration = () => {
    const inches = parseLength(length);
    if (!inches || pxLen < 10) {
      toast.error("Click both ends of a wall you know and enter its length, e.g. 12'-6\".");
      return;
    }
    setScale({ inchesPerPx: inches / pxLen, source: `your measurement (${formatFtIn(inches)})`, auto: false });
    setMeasuring(false);
  };

  const create = async () => {
    if (!plan || !scale || !crop) return;
    setCreating(true);
    try {
      const repo = getRepository();
      const assetId = newId("asset");
      // keep only the blueprint as the reference layer
      let bg = { blob: plan.blob, x: 0, y: 0, width: plan.width, height: plan.height };
      if (crop.cropped) bg = await cropPlan(plan.url, crop);
      await repo.putAsset(assetId, bg.blob);
      const s = scale.inchesPerPx;
      const withBg = {
        ...emptyScene(),
        background: { assetId, x: bg.x * s, y: bg.y * s, scale: s, widthPx: bg.width, heightPx: bg.height, opacity: extraction && useExtraction ? 0.3 : 0.6, visible: true, calibrated: true },
        scaleConfirmed: true,
      };
      const scene = extraction && useExtraction ? sceneFromExtraction(extraction.data, extraction.factor, s, withBg) : withBg;
      const p = newProject(name.trim() || "My apartment", unitType, scene);
      await repo.create(p);
      router.push(`/project/${p.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the project.");
      setCreating(false);
    }
  };

  const ex = extraction?.data;
  const f = extraction?.factor ?? 1;
  const sizeLabel = scale && crop ? `${formatFtIn(crop.w * scale.inchesPerPx)} × ${formatFtIn(crop.h * scale.inchesPerPx)}` : null;
  const strokeW = crop ? Math.max(2, crop.w / 260) : 2;

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
        <p className="mt-1 text-muted-foreground">
          PNG, JPG, PDF or a screenshot of a listing. {aiAvailable ? "We find the blueprint, read its walls and printed sizes, and set the scale for you." : "You'll set the scale by measuring one wall."}
        </p>

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
                <span className="text-[13px] text-muted-foreground">Plans with printed room sizes (like 12&apos;-2&quot; × 14&apos;-7&quot;) are measured automatically</span>
              </>
            )}
          </label>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="relative overflow-hidden rounded-2xl border bg-white">
              {crop && (
                <svg
                  ref={svgRef}
                  viewBox={`${crop.x} ${crop.y} ${crop.w} ${crop.h}`}
                  className={cn("block h-auto w-full select-none", measuring && "cursor-crosshair")}
                  style={{ aspectRatio: `${crop.w} / ${crop.h}`, maxHeight: "75vh" }}
                  onClick={onImageClick}
                  role="img"
                  aria-label="Uploaded floor plan"
                  data-testid="plan-preview"
                >
                  <image href={plan.url} x={0} y={0} width={plan.width} height={plan.height} />
                  {ex && useExtraction && (
                    <g>
                      {ex.rooms.map((r, i) => (
                        <polygon key={i} points={r.polygon.map((p) => `${p.x / f},${p.y / f}`).join(" ")} fill="rgba(180,101,74,0.08)" stroke="none" />
                      ))}
                      {ex.walls.map((w, i) => (
                        <line key={i} x1={w.x1 / f} y1={w.y1 / f} x2={w.x2 / f} y2={w.y2 / f} stroke="#b4654a" strokeWidth={strokeW * 1.6} strokeLinecap="round" opacity={0.75} />
                      ))}
                      {ex.openings.map((o, i) => (
                        <line key={`o${i}`} x1={o.x1 / f} y1={o.y1 / f} x2={o.x2 / f} y2={o.y2 / f} stroke={o.kind === "window" ? "#4b6584" : "#3f7a52"} strokeWidth={strokeW * 2} strokeLinecap="round" />
                      ))}
                    </g>
                  )}
                  {points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={strokeW * 2.5} fill="#b4654a" stroke="#fff" strokeWidth={strokeW * 0.8} />
                  ))}
                  {points.length === 2 && <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} stroke="#b4654a" strokeWidth={strokeW} strokeDasharray={`${strokeW * 4} ${strokeW * 3}`} />}
                </svg>
              )}
              {reading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/55 backdrop-blur-[1px]">
                  <div className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-[13px] shadow-md">
                    <Loader2 className="size-4 animate-spin text-brand" /> Reading walls, doors and printed sizes…
                  </div>
                </div>
              )}
              {crop?.cropped && <Badge variant="secondary" className="absolute top-3 left-3">Cropped to the blueprint</Badge>}
            </div>

            <div className="space-y-4">
              {/* AI reading */}
              <section className="space-y-3 rounded-xl border bg-card p-4" data-testid="ai-read-card">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[14px] font-semibold">
                    <ScanSearch className="size-4 text-brand" /> Floor plan
                  </div>
                  {aiAvailable && <Badge variant="brand">{modelLabel(status?.floorplanModel ?? null)}</Badge>}
                </div>
                {!status ? null : !aiAvailable ? (
                  <p className="text-[13px] text-muted-foreground">Automatic reading isn&apos;t configured on this deployment. Measure one wall below, then trace rooms in the editor.</p>
                ) : reading ? (
                  <p className="text-[13px] text-muted-foreground">Finding the blueprint, walls, doors, windows and room sizes. This takes about 10 seconds.</p>
                ) : readError ? (
                  <div className="space-y-2">
                    <p className="text-[13px] text-destructive">{readError}</p>
                    <Button variant="outline" size="sm" onClick={() => readWithAI(plan)}>
                      Try again
                    </Button>
                  </div>
                ) : ex ? (
                  <div className="space-y-2 text-[13px]">
                    <p>
                      Found {ex.rooms.length} room{ex.rooms.length === 1 ? "" : "s"}, {ex.openings.filter((o) => o.kind !== "window").length} door
                      {ex.openings.filter((o) => o.kind !== "window").length === 1 ? "" : "s"}, {ex.openings.filter((o) => o.kind === "window").length} window
                      {ex.openings.filter((o) => o.kind === "window").length === 1 ? "" : "s"} and {ex.fixtures.length} built-ins.
                    </p>
                    <ul className="space-y-0.5 text-[12px] text-muted-foreground">
                      {ex.rooms.map((r, i) => (
                        <li key={i}>
                          {r.name}
                          {r.labeled_dimensions ? ` · ${r.labeled_dimensions}` : ""}
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[12px]">Use detected walls & rooms</span>
                      <Switch checked={useExtraction} onCheckedChange={setUseExtraction} />
                    </div>
                  </div>
                ) : null}
              </section>

              {/* Scale */}
              <section className="space-y-3 rounded-xl border bg-card p-4" data-testid="scale-card">
                <div className="flex items-center gap-2 text-[14px] font-semibold">
                  <Ruler className="size-4 text-brand" /> Scale
                </div>
                {scale ? (
                  <div
                    className={cn(
                      "flex gap-2 rounded-lg px-3 py-2 text-[12px]",
                      scale.confidence === "low" ? "bg-[#f8eedb] text-warning" : "bg-[#e6f0e8] text-success",
                    )}
                    data-testid="scale-result"
                  >
                    {scale.confidence === "low" ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Check className="mt-0.5 size-4 shrink-0" />}
                    <span>
                      {scale.auto ? "Read from the plan" : "Set from"} {scale.auto ? `(${scale.source})` : scale.source}. Plan is about {sizeLabel}.
                      {scale.areaCheck &&
                        (scale.areaCheck.ok
                          ? ` Consistent with the listed ${scale.areaCheck.statedSqft.toLocaleString()} sq ft.`
                          : scale.confidence === "low"
                            ? ` The outline works out to ${scale.areaCheck.computedSqft} sq ft vs ${scale.areaCheck.statedSqft} listed; measure one wall to be sure.`
                            : ` (The traced outline is ${scale.areaCheck.computedSqft} sq ft vs ${scale.areaCheck.statedSqft} listed; the printed room sizes take priority.)`)}
                      {scale.confidence === "low" && !scale.areaCheck && " Approximate: measure one wall to be exact."}
                    </span>
                  </div>
                ) : reading ? (
                  <p className="text-[13px] text-muted-foreground">Waiting for the plan to be read…</p>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    {ex ? "This plan doesn't print any sizes we could use. " : ""}Click both ends of a wall you know the length of, then enter it.
                  </p>
                )}
                {!measuring && scale && (
                  <button className="text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setMeasuring(true)} data-testid="measure-manually">
                    Measure a wall myself instead
                  </button>
                )}
                {measuring && (
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-[12px] text-muted-foreground">Click both ends of a wall on the plan whose length you know.</p>
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label>Length between the two points</Label>
                        <Input value={length} onChange={(e) => setLength(e.target.value)} placeholder={`e.g. 12'-6"`} disabled={points.length < 2} data-testid="calib-length" />
                      </div>
                      <Button onClick={applyCalibration} disabled={points.length < 2 || !length} data-testid="calib-apply">
                        Apply
                      </Button>
                    </div>
                    <div className="text-[12px] text-muted-foreground">{points.length < 2 ? `${2 - points.length} point${points.length === 1 ? "" : "s"} to go` : `${Math.round(pxLen)} px selected`}</div>
                  </div>
                )}
              </section>

              {/* Create */}
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
                <Button className="w-full" size="lg" disabled={!scale || creating || reading} onClick={create} data-testid="create-from-upload">
                  {creating ? <Loader2 className="animate-spin" /> : <FileUp />} Create project
                </Button>
                <button
                  className="w-full text-center text-[12px] text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => {
                    setPlan(null);
                    setPoints([]);
                    setScale(null);
                    setExtraction(null);
                    setReadError(null);
                    attempted.current = null;
                  }}
                >
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
