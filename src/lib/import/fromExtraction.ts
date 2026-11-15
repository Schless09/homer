import { getCatalogItem } from "@/lib/catalog/items";
import { FIXTURE_TO_CATALOG, type FloorplanExtraction } from "@/lib/ai/floorplan-schema";
import { add, dist, distToSegment, norm, pointInPolygon, projectOnSegment, scale, sub } from "@/lib/scene/geometry";
import { newId } from "@/lib/scene/ids";
import { parseLength, parseRoomSize } from "@/lib/scene/units";
import { instantiate } from "@/lib/scene/instantiate";
import { rectHitsWalls } from "@/lib/scene/validate";
import { rectsOverlap } from "@/lib/scene/geometry";
import type { Item, Opening, Point, Room, Scene, Wall } from "@/lib/scene/types";

/**
 * Suggest a scale (inches per ORIGINAL image pixel) from dimension labels the
 * model read. Returns null if there is nothing reliable. This is only ever a
 * suggestion the user confirms.
 */
export interface ScaleSuggestion {
  inchesPerPx: number;
  /** human-readable source, e.g. "Living/Sleeping 12'-2" × 14'-7" and 1 more label" */
  basis: string;
  /** how sure we are: printed sizes that agree with each other (and with the listed area) are "high" */
  confidence: "high" | "medium" | "low";
  /** cross-check against a total area printed on the plan/listing */
  areaCheck?: { statedSqft: number; computedSqft: number; ok: boolean };
}

function polyAreaPx(poly: { x: number; y: number }[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/**
 * Work out inches-per-pixel from what's printed on the plan: dimension lines,
 * room size labels (12'-2" x 14'-7"), and the listed total area (609 sq ft)
 * as a cross-check or last resort. Returns null only when the plan prints
 * nothing usable.
 */
export function suggestScale(ex: FloorplanExtraction, factor: number): ScaleSuggestion | null {
  // Every printed size is a clue to the scale. Clues can be noisy (room outlines that include a
  // closet or hallway, labels that describe only the main rectangle), so we collect them all and
  // pick the scale most of them agree on.
  type Clue = { r: number; weight: number; source: string };
  const clues: Clue[] = [];

  // 1) printed dimension lines (skipping ones that only repeat a room label; those are handled below)
  const norm = (t: string) => t.replace(/[\s″”"′’'-]/g, "").toLowerCase();
  const labelParts = new Set(ex.rooms.flatMap((r) => (r.labeled_dimensions ?? "").split(/\s*(?:x|×|by)\s*/i).map(norm)).filter(Boolean));
  for (const d of ex.dimension_annotations) {
    if (labelParts.has(norm(d.text))) continue;
    const px = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) / factor;
    const inches = parseLength(d.text) ?? d.inches;
    if (px > 20 && inches > 12) clues.push({ r: inches / px, weight: 2, source: d.text });
  }

  // 2) room labels. Labels measure wall face to wall face, but an outline may be traced along wall
  // centerlines, the faces, or in between: correct by how far the outline sits from the centerlines.
  const thick = ex.walls.length ? ex.walls.reduce((t, w) => t + w.thickness_px, 0) / ex.walls.length / factor : 0;
  const segs = ex.walls.map((w) => ({ a: { x: w.x1 / factor, y: w.y1 / factor }, b: { x: w.x2 / factor, y: w.y2 / factor } }));
  const offsetFromCenterlines = (poly: { x: number; y: number }[]) => {
    if (!segs.length) return thick / 2;
    const ds = poly.map((p) => Math.min(...segs.map((sg) => distToSegment({ x: p.x / factor, y: p.y / factor }, sg.a, sg.b))));
    return Math.min(thick / 2, ds.reduce((a, b) => a + b, 0) / ds.length);
  };
  for (const room of ex.rooms) {
    const size = room.labeled_dimensions ? parseRoomSize(room.labeled_dimensions) : null;
    if (!size || room.polygon.length < 3) continue;
    const [a, b] = size;
    const xs = room.polygon.map((p) => p.x);
    const ys = room.polygon.map((p) => p.y);
    const inset = thick - 2 * offsetFromCenterlines(room.polygon);
    const w = (Math.max(...xs) - Math.min(...xs)) / factor - inset;
    const h = (Math.max(...ys) - Math.min(...ys)) / factor - inset;
    if (w < 20 || h < 20) continue;
    const label = `${room.name} ${room.labeled_dimensions}`;
    // both sides agreeing is a strong clue; otherwise each side is a weaker clue on its own
    for (const [r1, r2] of [
      [a / w, b / h],
      [b / w, a / h],
    ]) {
      if (Math.abs(r1 - r2) / Math.max(r1, r2) <= 0.06) clues.push({ r: (r1 + r2) / 2, weight: 3, source: label });
      else clues.push({ r: r1, weight: 1, source: label }, { r: r2, weight: 1, source: label });
    }
  }

  // 3) listed total area. Listings quote gross area (to the outside of the walls), so compare it
  // with the footprint enclosed by the exterior walls, not with whichever rooms were outlined.
  const ext = ex.walls.filter((w) => w.exterior).flatMap((w) => [{ x: w.x1 / factor, y: w.y1 / factor }, { x: w.x2 / factor, y: w.y2 / factor }]);
  const hull = (pts: { x: number; y: number }[]) => {
    if (pts.length < 3) return [];
    const ps = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower: typeof ps = [];
    for (const p of ps) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper: typeof ps = [];
    for (const p of [...ps].reverse()) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
  };
  const envelopePx = polyAreaPx(hull(ext));
  const roomsAreaPx = ex.rooms.reduce((t, r) => t + polyAreaPx(r.polygon), 0) / (factor * factor);
  // the hull slightly overstates notched units; rooms understate (walls, unlabeled spaces): use the larger
  const footprintPx = Math.max(envelopePx, roomsAreaPx / 0.9);
  const stated = ex.stated_total_sqft && ex.stated_total_sqft > 100 && ex.stated_total_sqft < 20000 ? ex.stated_total_sqft : null;
  const areaR = stated && footprintPx > 0 ? Math.sqrt((stated * 144) / footprintPx) : null;
  const areaCheck = (r: number) => {
    if (!stated || footprintPx <= 0) return undefined;
    const computedSqft = (footprintPx * r * r) / 144;
    return { statedSqft: stated, computedSqft: Math.round(computedSqft), ok: computedSqft > stated * 0.82 && computedSqft < stated * 1.18 };
  };
  // the area is only a rough guide (outlines vary), so it supports a cluster but can't win alone
  const areaClue: Clue | null = areaR ? { r: areaR, weight: 1.5, source: `the listed ${stated!.toLocaleString()} sq ft` } : null;

  const all = areaClue ? [...clues, areaClue] : clues;
  let best: { members: Clue[]; score: number; center: number } | null = null;
  for (const c of clues) {
    const members = all.filter((x) => Math.abs(x.r - c.r) / c.r <= 0.05);
    const sources = new Set(members.map((m) => m.source));
    const score = members.reduce((t, m) => t + m.weight, 0) + sources.size;
    const center = members.reduce((t, m) => t + m.r * m.weight, 0) / members.reduce((t, m) => t + m.weight, 0);
    // a scale that contradicts the listed total area is unlikely unless strongly supported
    const strongHere = members.some((m) => m.weight >= 2);
    const contradictsArea = areaR !== null && Math.abs(center - areaR) / areaR > 0.15;
    const adjusted = contradictsArea ? score * (strongHere ? 0.6 : 0.25) : score;
    if (!best || adjusted > best.score) best = { members, score: adjusted, center };
  }
  if (best) {
    const sources = [...new Set(best.members.map((m) => m.source))];
    const strong = best.members.some((m) => m.weight >= 2);
    // a lone weak clue (one side of one room) isn't enough
    if (sources.length >= 2 || strong) {
      const check = areaCheck(best.center);
      const printed = sources.filter((src) => !src.startsWith("the listed"));
      // printed sizes that agree with each other outrank a rough area comparison
      const agreeing = strong;
      const confidence: ScaleSuggestion["confidence"] =
        check && !check.ok ? (agreeing ? "medium" : "low") : sources.length >= 3 || (strong && sources.length >= 2) ? "high" : "medium";
      return {
        inchesPerPx: best.center,
        basis: `${printed[0] ?? sources[0]}${sources.length > 1 ? ` and ${sources.length - 1} more` : ""}`,
        confidence,
        areaCheck: check,
      };
    }
  }
  // last resort: only a total area is printed
  if (areaR) return { inchesPerPx: areaR, basis: `the listed ${stated!.toLocaleString()} sq ft`, confidence: "low", areaCheck: areaCheck(areaR) };
  return null;
}

/** Bounding box of the floor plan drawing in ORIGINAL image pixels (for cropping screenshots). */
export function planBounds(ex: FloorplanExtraction, factor: number): { x: number; y: number; w: number; h: number } | null {
  const xs = [...ex.walls.flatMap((w) => [w.x1, w.x2]), ...ex.rooms.flatMap((r) => r.polygon.map((p) => p.x))];
  const ys = [...ex.walls.flatMap((w) => [w.y1, w.y2]), ...ex.rooms.flatMap((r) => r.polygon.map((p) => p.y))];
  if (xs.length < 2) return null;
  const minX = Math.min(...xs) / factor;
  const maxX = Math.max(...xs) / factor;
  const minY = Math.min(...ys) / factor;
  const maxY = Math.max(...ys) / factor;
  const pad = Math.max(maxX - minX, maxY - minY) * 0.08;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
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
  // Sizes come from the plan when plausible (bathrooms and closets vary a lot).
  const items: Item[] = [];
  const fitsAt = (probe: Item) => {
    const r = { cx: probe.x, cy: probe.y, w: probe.width, d: probe.depth, rot: probe.rotation };
    const sc: Scene = { ...base, walls, rooms, openings, items };
    if (rectHitsWalls(sc, r)) return false;
    return !items.some((o) => Math.abs(o.x - probe.x) < (o.width + o.depth + probe.width + probe.depth) / 2 && rectsOverlap(r, { cx: o.x, cy: o.y, w: o.width, d: o.depth, rot: o.rotation }));
  };
  const counters: typeof ex.fixtures = [];
  const ordered = [...ex.fixtures.filter((x) => x.type !== "kitchen-counter"), ...ex.fixtures.filter((x) => x.type === "kitchen-counter")];
  for (const fx of ordered) {
    const id = FIXTURE_TO_CATALOG[fx.type];
    const c = getCatalogItem(id);
    if (!c) continue;
    const p = P(fx.x, fx.y);
    const long = Math.max(fx.width_px, fx.depth_px) * f;
    const short = Math.min(fx.width_px, fx.depth_px) * f;
    // Appliances, toilets and washers come in standard sizes; a vision model's boxes around them are
    // looser than that, so use the standard size. Runs (counters, closets) and pieces that genuinely
    // vary (tubs, vanities) take the plan's size within a sensible range.
    const STANDARD: string[] = ["refrigerator", "range", "toilet", "washer-dryer", "shower"];
    const within = (v: number, ref: number, lo: number, hi: number) => v >= ref * lo && v <= ref * hi;
    let width = c.width;
    let depth = c.depth;
    if (STANDARD.includes(fx.type)) {
      // keep catalog size
    } else if (c.resizable || fx.type === "sink-counter") {
      width = long > 12 ? Math.round(long) : c.width;
      depth = fx.type === "closet" && within(short, c.depth, 0.75, 1.4) ? Math.round(short) : c.depth;
    } else if (fx.type === "bathtub") {
      if (within(long, 60, 0.85, 1.15)) width = Math.round(long);
    } else if (fx.type === "vanity") {
      if (within(long, c.width, 0.75, 1.7)) width = Math.round(long);
    }
    if (fx.type === "kitchen-counter" || fx.type === "sink-counter") depth = 25;
    if (fx.type === "sink-counter") width = Math.max(24, width);
    let x = p.x;
    let y = p.y;
    let rotation = ((Math.round(fx.rotation / 90) * 90) % 360 + 360) % 360;
    let wallDirV: Point | null = null;
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
        rotation = (Math.round(rotation / 90) * 90) % 360;
        const pos = add(pr.point, scale(n, w.thickness / 2 + depth / 2 + 0.5));
        x = pos.x;
        y = pos.y;
        wallDirV = norm(sub(w.b, w.a));
      }
    }
    if (fx.type === "kitchen-counter" && wallDirV) {
      // a counter run is usually reported across the appliances in it: keep only the free stretches
      const dir = wallDirV;
      const t0 = -width / 2;
      const t1 = width / 2;
      const blocked = items
        .filter((o) => {
          const rel = { x: o.x - x, y: o.y - y };
          const perp = Math.abs(rel.x * dir.y - rel.y * dir.x);
          return perp < (depth + o.depth) / 2;
        })
        .map((o) => {
          const along = (o.x - x) * dir.x + (o.y - y) * dir.y;
          const half = (Math.abs(Math.cos((o.rotation * Math.PI) / 180)) > 0.5) === (Math.abs(dir.x) > 0.5) ? o.width / 2 : o.depth / 2;
          return [along - half, along + half] as [number, number];
        })
        .filter(([a, b]) => b > t0 && a < t1)
        .sort((m, n) => m[0] - n[0]);
      let cursor = t0;
      const pieces: [number, number][] = [];
      for (const [a, b] of blocked) {
        if (a - cursor >= 12) pieces.push([cursor, a]);
        cursor = Math.max(cursor, b);
      }
      if (t1 - cursor >= 12) pieces.push([cursor, t1]);
      for (const [a, b] of pieces) {
        const mid = (a + b) / 2;
        items.push(instantiate(id, x + dir.x * mid, y + dir.y * mid, rotation, { width: Math.round(b - a), depth, fixed: true, locked: true }));
      }
      counters.push(fx);
      continue;
    }
    // slide along the wall (up to 3 ft) if it would cross a wall or another fixture
    let probe = instantiate(id, x, y, rotation, { width, depth, fixed: true, locked: true });
    if (wallDirV && !fitsAt(probe)) {
      const along = wallDirV;
      let found = false;
      for (let k = 1; k <= 18 && !found; k++) {
        for (const sft of [k * 2, -k * 2]) {
          const cand = { ...probe, x: x + along.x * sft, y: y + along.y * sft };
          if (fitsAt(cand)) {
            probe = cand;
            found = true;
            break;
          }
        }
      }
      // still doesn't fit: shrink oversized pieces (e.g. a tub in a narrow bath) toward the plan's size
      if (!found && width > 30) {
        width = Math.round(width * 0.9);
        probe = { ...probe, width };
      }
    }
    items.push(probe);
  }
  void counters;

  // Kitchens are continuous runs: fill the gaps between appliances/counters on the same wall with countertop.
  const KITCHEN = new Set(["fx-counter", "fx-sink", "fx-range", "fx-fridge"]);
  const kitchen = items.filter((i) => KITCHEN.has(i.catalogId));
  const runs: Item[][] = [];
  for (const k of kitchen) {
    const run = runs.find((r) => {
      const o = r[0];
      if (o.rotation !== k.rotation) return false;
      const rad = (k.rotation * Math.PI) / 180;
      const dir = { x: Math.cos(rad), y: Math.sin(rad) };
      const perp = Math.abs((k.x - o.x) * dir.y - (k.y - o.y) * dir.x);
      return perp < 8;
    });
    if (run) run.push(k);
    else runs.push([k]);
  }
  for (const run of runs) {
    if (run.length < 2) continue;
    const rad = (run[0].rotation * Math.PI) / 180;
    const dir = { x: Math.cos(rad), y: Math.sin(rad) };
    const origin = run[0];
    const along = (i: Item) => (i.x - origin.x) * dir.x + (i.y - origin.y) * dir.y;
    const spans = run.map((i) => ({ i, a: along(i) - i.width / 2, b: along(i) + i.width / 2 })).sort((m, n) => m.a - n.a);
    // the run's back line: wall face plus half a counter depth
    const back = { x: origin.x, y: origin.y };
    const shift = (origin.depth - 25) / 2;
    const n = { x: -Math.sin(rad), y: Math.cos(rad) }; // local +y (front)
    for (let k = 0; k < spans.length - 1; k++) {
      const gap0 = spans[k].b;
      const gap1 = spans[k + 1].a;
      const gap = gap1 - gap0;
      if (gap < 9 || gap > 144) continue;
      const mid = (gap0 + gap1) / 2;
      const cx = back.x + dir.x * mid - n.x * shift;
      const cy = back.y + dir.y * mid - n.y * shift;
      items.push(instantiate("fx-counter", cx, cy, run[0].rotation, { width: Math.round(gap), depth: 25, fixed: true, locked: true }));
    }
  }

  return { ...base, walls, rooms, openings, items, scaleConfirmed: true };
}
