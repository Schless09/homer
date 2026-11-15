"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, Download, Info, Loader2, Wand2 } from "lucide-react";
import { getCatalogItem } from "@/lib/catalog/items";
import { dataUrlToBlob, download } from "@/lib/export";
import { useEditor } from "@/store/editor";
import { useViewport } from "@/store/viewport";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAIStatus } from "./useAIStatus";
import { ProductImage } from "./ProductImage";

type Job = { id: string; status: string; output?: string; error?: string };

export function RenderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const status = useAIStatus();
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refsUsed, setRefsUsed] = useState<string[]>([]);
  const items = useEditor((s) => s.scene.items);
  // real products in the room, largest first: their photos guide the render
  const realProducts = useMemo(() => {
    const seen = new Set<string>();
    return [...items]
      .sort((a, b) => b.width * b.depth - a.width * a.depth)
      .map((i) => getCatalogItem(i.catalogId))
      .filter((c): c is NonNullable<typeof c> => !!c && c.source === "retailer" && !seen.has(c.id) && !!seen.add(c.id))
      .slice(0, 6);
  }, [items]);

  // capture the 3D view when the dialog opens (switching to 3D if needed)
  useEffect(() => {
    if (!open) return;
    setJob(null);
    setError(null);
    const store = useEditor.getState();
    const prev = store.view;
    if (prev === "2d" || prev === "walk") store.setView("3d");
    let tries = 0;
    const t = setInterval(() => {
      const cap = useViewport.getState().capture3d;
      if (cap && tries++ > 3) {
        setSnapshot(cap());
        clearInterval(t);
      }
    }, 250);
    return () => clearInterval(t);
  }, [open]);

  // poll the async render job
  useEffect(() => {
    if (!job || ["succeeded", "failed", "canceled"].includes(job.status)) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/ai/render?id=${encodeURIComponent(job.id)}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Render lookup failed");
        setJob(d.job);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Render lookup failed");
        setJob(null);
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [job]);

  const start = async () => {
    if (!snapshot) return;
    setBusy(true);
    setError(null);
    try {
      const sc = useEditor.getState().scene;
      const pieces = sc.items.filter((i) => !i.fixed).map((i) => {
        const c = getCatalogItem(i.catalogId);
        const color = c?.colors.find((x) => x.hex === i.color)?.name;
        // real products are named with their retailer so the render matches what the user can buy
        return `${color && color !== "As shown" ? color.toLowerCase() + " " : ""}${c?.name ?? "furniture"}${c?.source === "retailer" && c.retailer ? ` from ${c.retailer}` : ""}`;
      });
      const r = await fetch("/api/ai/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: snapshot, prompt, style: { wallColor: sc.style.wallColor, floor: sc.style.floor }, pieces, productIds: realProducts.map((p) => p.id) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Render failed");
      setJob(d.job);
      setRefsUsed(d.referencesUsed ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render failed");
    } finally {
      setBusy(false);
    }
  };

  const configured = !!status?.imageProvider;
  const running = job && !["succeeded", "failed", "canceled"].includes(job.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Visualize your space</DialogTitle>
          <DialogDescription>The 3D scene is the dimensionally accurate source of truth. AI renders are photographic previews built on top of it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <figure className="space-y-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
              {snapshot ? <img src={snapshot} alt="3D snapshot of the design" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}
              <Badge variant="success" className="absolute top-2 left-2">Accurate 3D</Badge>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setSnapshot(useViewport.getState().capture3d?.() ?? null)}>
                <Camera /> Re-capture
              </Button>
              <Button size="sm" variant="ghost" disabled={!snapshot} onClick={() => snapshot && download("homer-3d.jpg", dataUrlToBlob(snapshot))}>
                <Download /> Download
              </Button>
            </div>
            <figcaption className="text-[11px] text-muted-foreground">Tip: orbit the 3D view to the angle you want, then re-capture.</figcaption>
          </figure>
          <div className="space-y-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
              {job?.status === "succeeded" && job.output ? (
                <>
                  <img src={job.output} alt="AI-generated photorealistic preview" className="size-full object-cover" />
                  <Badge variant="brand" className="absolute top-2 left-2">AI-generated · not to scale</Badge>
                </>
              ) : running ? (
                <div className="flex size-full flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" /> Rendering ({job?.status})…
                </div>
              ) : configured ? (
                <div className="flex size-full items-center justify-center p-6 text-center text-[13px] text-muted-foreground">Your photorealistic render will appear here.</div>
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-[13px] text-muted-foreground">
                  <Info className="size-5" />
                  Photorealistic rendering isn&apos;t configured on this deployment.
                  <span className="text-[11px]">Set HOMER_GEMINI_API_KEY on the server to enable it (product photos are used as references).</span>
                </div>
              )}
            </div>
            {realProducts.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground" data-testid="render-products">
                <span>{status?.imageProvider === "gemini" ? "Matching real products:" : "Described in the prompt:"}</span>
                {realProducts.map((p) => (
                  <span key={p.id} className="flex items-center gap-1 rounded-full border bg-card py-0.5 pr-2 pl-0.5">
                    <ProductImage item={p} size={18} className="rounded-full" />
                    {p.name.length > 22 ? p.name.slice(0, 21) + "…" : p.name}
                  </span>
                ))}
              </div>
            )}
            {job?.status === "succeeded" && refsUsed.length > 0 && <p className="text-[11px] text-muted-foreground">Rendered with {refsUsed.length} product photo(s) as reference.</p>}
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Optional direction, e.g. warm evening light, linen curtains, a few books on the shelf" rows={2} disabled={!configured} />
            {error && <p className="text-[12px] text-destructive">{error}</p>}
            {job?.status === "failed" && <p className="text-[12px] text-destructive">{job.error ?? "The render failed."}</p>}
            <Button variant="brand" className="w-full" disabled={!configured || !snapshot || busy || !!running} onClick={start}>
              {busy || running ? <Loader2 className="animate-spin" /> : <Wand2 />} Generate photorealistic render
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
