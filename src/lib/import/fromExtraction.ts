import { getCatalogItem } from "@/lib/catalog/items";
import { FIXTURE_TO_CATALOG, type FloorplanExtraction } from "@/lib/ai/floorplan-schema";
import { add, dist, distToSegment, norm, pointInPolygon, projectOnSegment, scale, sub } from "@/lib/scene/geometry";
import { newId } from "@/lib/scene/ids";
import { parseLength } from "@/lib/scene/units";
import { instantiate } from "@/lib/scene/instantiate";
import { validateItem } from "@/lib/scene/validate";
import type { Item, Opening, Point, Room, Scene, Wall } from "@/lib/scene/types";

/**
 * Suggest a scale (inches per ORIGINAL image pixel) from dimension labels the
 * model read. Returns null if there is nothing reliable. This is only ever a
 * suggestion the user confirms.
 */
export function suggestScale(ex: FloorplanExtraction, factor: number): { inchesPerPx: number; basis: string } | null {
  const samples: { r: number; text: string }[] = [];
  // 1) printed dimension lines (skipping ones that only repeat a room label; those are handled below)
  const norm = (t: string) => t.replace(/[\s″”"′’']/g, "").toLowerCase();
  const labelParts = new Set(ex.rooms.flatMap((r) => (r.labeled_dimensions ?? "").split(/\s*[x×X]\s*/).map(norm)).filter(Boolean));
  for (const d of ex.dimension_annotations) {
    if (labelParts.has(norm(d.text))) continue;
    const px = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) / factor;
    if (px > 20 && d.inches > 12) samples.push({ r: d.inches / px, text: d.text });
  }
  // 2) room labels like 13' 8" × 15', checked against the room's outline on both axes.
  // Labels measure wall face to wall face, but an outline may be traced along wall centerlines,
  // along the faces, or in between. Measure how far each outline sits from the wall centerlines
  // and widen/narrow it to the faces accordingly.
  const thick = ex.walls.length ? ex.walls.reduce((t, w) => t + w.thickness_px, 0) / ex.walls.length / factor : 0;
  const segs = ex.walls.map((w) => ({ a: { x: w.x1 / factor, y: w.y1 / factor }, b: { x: w.x2 / factor, y: w.y2 / factor } }));
  const offsetFromCenterlines = (poly: { x: number; y: number }[]) => {
    if (!segs.length) return thick / 2;
    const ds = poly.map((p) => Math.min(...segs.map((sg) => distToSegment({ x: p.x / factor, y: p.y / factor }, sg.a, sg.b))));
    const avg = ds.reduce((a, b) => a + b, 0) / ds.length;
    return Math.min(thick / 2, avg);
  };
  for (const room of ex.rooms) {
    const label = room.labeled_dimensions;
    if (!label || room.polygon.length < 3) continue;
    const parts = label.split(/\s*[x×X]\s*/);
    if (parts.length !== 2) continue;
    const a = parseLength(parts[0].replace(/[″”]/g, '"').replace(/[′’]/g, "'"));
    const b = parseLength(parts[1].replace(/[″”]/g, '"').replace(/[′’]/g, "'"));
    if (!a || !b) continue;
    const xs = room.polygon.map((p) => p.x);
    const ys = room.polygon.map((p) => p.y);
    const inset = thick - 2 * offsetFromCenterlines(room.polygon);
    const w = (Math.max(...xs) - Math.min(...xs)) / factor - inset;
    const h = (Math.max(...ys) - Math.min(...ys)) / factor - inset;
    if (w < 20 || h < 20) continue;
    // labels may list width × depth in either order; keep the pairing whose two ratios agree
    const pairings = [
      [a / w, b / h],
      [b / w, a / h],
    ].map(([r1, r2]) => ({ r1, r2, diff: Math.abs(r1 - r2) / Math.max(r1, r2) }));
    const best = pairings.sort((p, q) => p.diff - q.diff)[0];
    // a mismatch means the outline doesn't match the label (merged rooms, L-shapes): skip it
    if (best.diff <= 0.06) samples.push({ r: (best.r1 + best.r2) / 2, text: `${room.name} ${label}` });
  }
  if (!samples.length) return null;
  samples.sort((p, q) => p.r - q.r);
  const mid = samples[Math.floor(samples.length / 2)];
  const consistent = samples.filter((s) => Math.abs(s.r - mid.r) / mid.r < 0.08);
  if (consistent.length < Math.min(2, samples.length)) return null;
  const avg = consistent.reduce((s, x) => s + x.r, 0) / consistent.length;
  return { inchesPerPx: avg, basis: `${consistent.length} printed measurement${consistent.length > 1 ? "s" : ""} (e.g. ${consistent[0].text})` };
}

/** Convert a pixel-space extraction into scene geometry, given a confirmed scale. */
export function sceneFromExtraction(ex: FloorplanExtraction, factor: number, inchesPerPx: number, base: Scene): Scene {
  const f = inchesPerPx / factor; // inches per sent-image pixel
  const P = (x: number, y: number): Point => ({ x: Math.round(x * f * 10) / 10, y: Math.round(y * f * 10) / 10 });

  const allWalls: Wall[] = ex.walls
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

  // Real walls run along room edges. A "wall" sitting well inside a single room is
  // almost always a misread fixture edge (tub front, counter, rug), so drop it.
  const edgeDist = (p: Point, poly: Point[]) => Math.min(...poly.map((q, i) => distToSegment(p, q, poly[(i + 1) % poly.length])));
  const insideRoom = (w: Wall) => {
    const pts = [0.25, 0.5, 0.75].map((t) => ({ x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t }));
    return rooms.some((r) => pts.every((p) => pointInPolygon(p, r.polygon, 0) && edgeDist(p, r.polygon) > 12));
  };
  const walls: Wall[] = allWalls.filter((w) => w.exterior || !insideRoom(w));

  const openings: Opening[] = [];
  const swingSide = (w: Wall, along: number): "left" | "right" => {
    const dir = norm(sub(w.b, w.a));
    const left = { x: dir.y, y: -dir.x };
    const probe = add(add(w.a, scale(dir, along)), scale(left, 18));
    return rooms.some((r) => r.type !== "closet" && pointInPolygon(probe, r.polygon, 0)) ? "left" : "right";
  };
  for (const o of ex.openings) {
    const a = P(o.x1, o.y1);
    const b = P(o.x2, o.y2);
    const span = dist(a, b);
    if (span < 12) continue;
    // a wall "hosts" the opening when both ends of the opening lie along it
    let host: { w: Wall; ta: number; tb: number } | null = null;
    for (const w of walls) {
      const L = dist(w.a, w.b);
      const dir = norm(sub(w.b, w.a));
      const along = (p: Point) => (p.x - w.a.x) * dir.x + (p.y - w.a.y) * dir.y;
      const perp = (p: Point) => Math.abs((p.x - w.a.x) * dir.y - (p.y - w.a.y) * dir.x);
      const ta = along(a);
      const tb = along(b);
      if (perp(a) < 12 && perp(b) < 12 && Math.min(ta, tb) > -6 && Math.max(ta, tb) < L + 6) {
        host = { w, ta, tb };
        break;
      }
    }
    const kind = o.kind;
    const base = { id: newId("o"), kind, height: kind === "window" ? 60 : kind === "door" ? 80 : 84, sill: kind === "window" ? 24 : 0, hinge: "start" as const };
    if (host) {
      const L = dist(host.w.a, host.w.b);
      const width = Math.max(18, Math.min(L - 2, span));
      const center = (host.ta + host.tb) / 2;
      openings.push({ ...base, wallId: host.w.id, offset: Math.max(width / 2, Math.min(L - width / 2, center)), width, swing: swingSide(host.w, center) });
    } else {
      // walls are often drawn stopping at a doorway: bridge the gap with a wall that holds the opening,
      // but only when it looks like a real gap (believable width, both ends touching existing walls)
      const maxSpan = kind === "window" ? 144 : 72;
      const touches = (p: Point) => walls.some((w) => distToSegment(p, w.a, w.b) < 10);
      if (span > maxSpan || !touches(a) || !touches(b)) continue;
      const near = walls.reduce<{ w: Wall | null; d: number }>((best, w) => {
        const d = Math.min(distToSegment(a, w.a, w.b), distToSegment(b, w.a, w.b));
        return d < best.d ? { w, d } : best;
      }, { w: null, d: Infinity });
      if (!near.w) continue;
      const bridge: Wall = { id: newId("w"), a, b, thickness: near.w.thickness, height: 108, exterior: near.w.exterior };
      walls.push(bridge);
      openings.push({ ...base, wallId: bridge.id, offset: span / 2, width: span, swing: swingSide(bridge, span / 2) });
    }
  }

  // Built-ins sit with their back against a wall and face into the room. Vision models
  // often get rotation wrong, so snap each fixture to its nearest wall (islands stay free).
  const items: Item[] = [];
  for (const fx of ex.fixtures) {
    const id = FIXTURE_TO_CATALOG[fx.type];
    const c = getCatalogItem(id);
    if (!c) continue;
    const p = P(fx.x, fx.y);
    const long = Math.max(fx.width_px, fx.depth_px) * f;
    const width = c.resizable && long > 12 ? Math.round(long) : c.width;
    const depth = c.depth;
    let x = p.x;
    let y = p.y;
    let rotation = ((Math.round(fx.rotation / 90) * 90) % 360 + 360) % 360;
    if (fx.type !== "kitchen-island") {
      let best: { w: Wall; d: number } | null = null;
      for (const w of walls) {
        const d = distToSegment(p, w.a, w.b);
        if (!best || d < best.d) best = { w, d };
      }
      if (best && best.d < depth + best.w.thickness + 24) {
        const w = best.w;
        const pr = projectOnSegment(p, w.a, w.b);
        const away = norm(sub(p, pr.point));
        const n = Math.hypot(away.x, away.y) > 0.5 ? away : { x: 0, y: 1 };
        // front (local +y) faces away from the wall
        rotation = (((Math.atan2(-n.x, n.y) * 180) / Math.PI) % 360 + 360) % 360;
        rotation = Math.round(rotation / 90) * 90 % 360;
        const pos = add(pr.point, scale(n, w.thickness / 2 + depth / 2 + 0.5));
        x = pos.x;
        y = pos.y;
        // slide along the wall (up to 3 ft) until the piece sits inside its room without crossing a wall
        const along = norm(sub(w.b, w.a));
        const fits = (cx: number, cy: number) => {
          const probe = instantiate(id, cx, cy, rotation, { width, depth, fixed: true, locked: true });
          const sc: Scene = { ...base, walls, rooms, openings, items: [...items, probe] };
          return !validateItem(sc, probe).some((i) => i.kind === "out-of-bounds" || i.kind === "wall" || i.kind === "collision");
        };
        if (!fits(x, y)) {
          for (let k = 1; k <= 18; k++) {
            const shifts = [k * 2, -k * 2];
            const hit = shifts.find((sft) => fits(x + along.x * sft, y + along.y * sft));
            if (hit !== undefined) {
              x += along.x * hit;
              y += along.y * hit;
              break;
            }
          }
        }
      }
    }
    items.push(instantiate(id, x, y, rotation, { width, depth, fixed: true, locked: true }));
  }

  return { ...base, walls, rooms, openings, items, scaleConfirmed: true };
}
