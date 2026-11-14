"use client";

import { useMemo } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { getCatalogItem } from "@/lib/catalog/items";
import { formatPrice } from "@/lib/scene/units";
import { useEditor } from "@/store/editor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PreviewBar() {
  const preview = useEditor((s) => s.preview);
  const scene = useEditor((s) => s.scene);
  const diff = useMemo(() => {
    if (!preview) return null;
    const before = new Map(scene.items.map((i) => [i.id, i]));
    const after = new Map(preview.scene.items.map((i) => [i.id, i]));
    let added = 0;
    let moved = 0;
    let removed = 0;
    let restyled = 0;
    for (const [id, a] of after) {
      const b = before.get(id);
      if (!b) added++;
      else if (Math.abs(b.x - a.x) > 0.5 || Math.abs(b.y - a.y) > 0.5 || b.rotation !== a.rotation || b.catalogId !== a.catalogId) moved++;
      else if (b.color !== a.color) restyled++;
    }
    for (const id of before.keys()) if (!after.has(id)) removed++;
    // a layout regenerates ids; count same-product replacements as moves
    const removedCat = [...before.values()].filter((i) => !after.has(i.id)).map((i) => i.catalogId);
    for (const a of after.values()) {
      if (before.has(a.id)) continue;
      const k = removedCat.indexOf(a.catalogId);
      if (k >= 0) {
        removedCat.splice(k, 1);
        added--;
        removed--;
        moved++;
      }
    }
    const price = preview.scene.items.reduce((s, i) => s + (i.fixed ? 0 : getCatalogItem(i.catalogId)?.price ?? 0), 0);
    return { added, moved, removed, restyled, price, styleChanged: scene.style.wallColor !== preview.scene.style.wallColor || scene.style.floor !== preview.scene.style.floor };
  }, [preview, scene]);

  if (!preview || !diff) return null;
  const parts = [
    diff.added && `${diff.added} added`,
    diff.moved && `${diff.moved} moved`,
    diff.removed && `${diff.removed} removed`,
    diff.restyled && `${diff.restyled} restyled`,
    diff.styleChanged && "new finishes",
  ].filter(Boolean);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3" data-testid="preview-bar">
      <div className="pointer-events-auto w-full max-w-2xl animate-fade-up rounded-xl border bg-card/95 p-2.5 shadow-lg backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{preview.title}</div>
            <div className="truncate text-[12px] text-muted-foreground">
              Preview · {parts.join(" · ") || "no furniture changes"} · {formatPrice(diff.price)} est.
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => useEditor.getState().setPreview(null)} data-testid="preview-discard">
            <X /> Discard
          </Button>
          <Button size="sm" variant="brand" onClick={() => useEditor.getState().acceptPreview()} data-testid="preview-accept">
            <Check /> Accept
          </Button>
        </div>
        {preview.alternatives && preview.alternatives.length > 1 && (
          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            {preview.alternatives.map((a) => (
              <button
                key={a.id}
                onClick={() => useEditor.getState().setPreviewAlternative(a.id)}
                className={cn(
                  "rounded-lg border px-2.5 py-2 text-left transition-colors",
                  preview.activeAlternative === a.id ? "border-brand bg-brand-soft" : "bg-card hover:bg-accent",
                )}
                data-testid={`alt-${a.strategy}`}
              >
                <div className="text-[12px] font-semibold">{a.name}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {Math.round(a.metrics.openPct * 100)}% open · {a.metrics.warnings + a.metrics.errors === 0 ? "no conflicts" : `${a.metrics.warnings + a.metrics.errors} notes`}
                  {a.failed.length ? ` · ${a.failed.length} unplaced` : ""}
                </div>
              </button>
            ))}
          </div>
        )}
        {preview.rejected.length > 0 && <div className="mt-2 text-[11px] text-warning">{preview.rejected.length} suggested change(s) were rejected by validation.</div>}
      </div>
    </div>
  );
}
