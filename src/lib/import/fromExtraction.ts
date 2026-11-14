import { getCatalogItem } from "@/lib/catalog/items";
import { FIXTURE_TO_CATALOG, type FloorplanExtraction } from "@/lib/ai/floorplan-schema";
import { add, dist, norm, pointInPolygon, projectOnSegment, scale, sub } from "@/lib/scene/geometry";
import { newId } from "@/lib/scene/ids";
import { instantiate } from "@/lib/scene/instantiate";
import type { Item, Opening, Point, Room, Scene, Wall } from "@/lib/scene/types";

/**
 * Suggest a scale (inches per ORIGINAL image pixel) from dimension labels the
 * model read. Returns null if there is nothing reliable. This is only ever a
 * suggestion the user confirms.
 */
export function suggestScale(ex: FloorplanExtraction, factor: number): { inchesPerPx: number; basis: string } | null {
  const samples = ex.dimension_annotations
    .map((d) => {
      const px = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) / factor;
      return px > 20 && d.inches > 12 ? { r: d.inches / px, text: d.text } : null;
    })
    .filter((s): s is { r: number; text: string } => !!s)
    .sort((a, b) => a.r - b.r);
  if (!samples.length) return null;
  const mid = samples[Math.floor(samples.length / 2)];
  const consistent = samples.filter((s) => Math.abs(s.r - mid.r) / mid.r < 0.12);
  if (consistent.length < Math.min(2, samples.length)) return null;
  const avg = consistent.reduce((s, x) => s + x.r, 0) / consistent.length;
  return { inchesPerPx: avg, basis: `${consistent.length} dimension label${consistent.length > 1 ? "s" : ""} (e.g. ${consistent[0].text})` };
}

/** Convert a pixel-space extraction into scene geometry, given a confirmed scale. */
export function sceneFromExtraction(ex: FloorplanExtraction, factor: number, inchesPerPx: number, base: Scene): Scene {
  const f = inchesPerPx / factor; // inches per sent-image pixel
  const P = (x: number, y: number): Point => ({ x: Math.round(x * f * 10) / 10, y: Math.round(y * f * 10) / 10 });

  const walls: Wall[] = ex.walls
    .map((w) => ({
      id: newId("w"),
      a: P(w.x1, w.y1),
      b: P(w.x2, w.y2),
      thickness: Math.max(3, Math.min(12, w.thickness_px * f || (w.exterior ? 6 : 4))),
      height: 108,
      exterior: w.exterior,
    }))
    .filter((w) => dist(w.a, w.b) > 6);

  const rooms: Room[] = ex.rooms
    .filter((r) => r.polygon.length >= 3)
    .map((r) => ({ id: newId("r"), name: r.name, type: r.type, polygon: r.polygon.map((p) => P(p.x, p.y)) }));

  const openings: Opening[] = [];
  for (const o of ex.openings) {
    const a = P(o.x1, o.y1);
    const b = P(o.x2, o.y2);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let best: { w: Wall; t: number; d: number } | null = null;
    for (const w of walls) {
      const pr = projectOnSegment(mid, w.a, w.b);
      if (!best || pr.distance < best.d) best = { w, t: pr.t, d: pr.distance };
    }
    if (!best || best.d > 18) continue;
    const L = dist(best.w.a, best.w.b);
    const width = Math.max(18, Math.min(L - 2, dist(a, b)));
    const dir = norm(sub(best.w.b, best.w.a));
    const left = { x: dir.y, y: -dir.x };
    const probe = add(add(best.w.a, scale(dir, best.t * L)), scale(left, 18));
    const leftInRoom = rooms.some((r) => r.type !== "closet" && pointInPolygon(probe, r.polygon, 0));
    openings.push({
      id: newId("o"),
      wallId: best.w.id,
      kind: o.kind,
      offset: Math.max(width / 2, Math.min(L - width / 2, best.t * L)),
      width,
      height: o.kind === "window" ? 60 : o.kind === "door" ? 80 : 84,
      sill: o.kind === "window" ? 24 : 0,
      hinge: "start",
      swing: leftInRoom ? "left" : "right",
    });
  }

  const items: Item[] = [];
  for (const fx of ex.fixtures) {
    const id = FIXTURE_TO_CATALOG[fx.type];
    const c = getCatalogItem(id);
    if (!c) continue;
    const p = P(fx.x, fx.y);
    const w = fx.width_px * f;
    const d = fx.depth_px * f;
    items.push(
      instantiate(id, p.x, p.y, ((Math.round(fx.rotation / 90) * 90) % 360 + 360) % 360, {
        width: c.resizable && w > 12 ? Math.round(w) : c.width,
        depth: c.resizable && d > 12 ? Math.round(d) : c.depth,
        fixed: true,
        locked: true,
      }),
    );
  }

  return { ...base, walls, rooms, openings, items, scaleConfirmed: true };
}
