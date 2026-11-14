import { getCatalogItem } from "@/lib/catalog/items";
import { add, norm, polygonArea, polygonBounds, scale, sub } from "./geometry";
import type { Scene } from "./types";
import { validateScene } from "./validate";

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Compact, model-friendly description of the scene geometry (inches). */
export function summarizeScene(scene: Scene) {
  const issues = validateScene(scene);
  return {
    units: "inches; x grows east (right), y grows south (down); rotation in degrees clockwise; rotation 0 = item front faces +y (south), back toward -y (north)",
    scale_confirmed: scene.scaleConfirmed,
    rooms: scene.rooms.map((r) => {
      const b = polygonBounds(r.polygon);
      return {
        id: r.id,
        name: r.name,
        type: r.type,
        area_sqft: Math.round(polygonArea(r.polygon) / 144),
        bounds: { minX: r1(b.minX), minY: r1(b.minY), maxX: r1(b.maxX), maxY: r1(b.maxY) },
        polygon: r.polygon.map((p) => [r1(p.x), r1(p.y)]),
      };
    }),
    openings: scene.openings.map((o) => {
      const w = scene.walls.find((wl) => wl.id === o.wallId);
      if (!w) return { id: o.id, kind: o.kind };
      const d = norm(sub(w.b, w.a));
      const c = add(w.a, scale(d, o.offset));
      const s = add(w.a, scale(d, o.offset - o.width / 2));
      const e = add(w.a, scale(d, o.offset + o.width / 2));
      return { id: o.id, kind: o.kind, center: [r1(c.x), r1(c.y)], from: [r1(s.x), r1(s.y)], to: [r1(e.x), r1(e.y)], width: o.width };
    }),
    items: scene.items.map((i) => {
      const c = getCatalogItem(i.catalogId);
      return {
        id: i.id,
        name: i.label ?? c?.name,
        catalog_id: i.catalogId,
        category: c?.category,
        x: r1(i.x),
        y: r1(i.y),
        rotation: r1(i.rotation),
        width: i.width,
        depth: i.depth,
        height: i.height,
        color: i.color,
        fixed: i.fixed || undefined,
        locked: (!i.fixed && i.locked) || undefined,
        on_top_of_other: i.elevation > 0 || undefined,
      };
    }),
    style: scene.style,
    current_issues: issues.map((i) => ({ item_id: i.itemId, severity: i.severity, message: i.message })),
  };
}
