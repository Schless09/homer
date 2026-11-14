import { getCatalogItem, requireCatalogItem, CATALOG } from "@/lib/catalog/items";
import type { CatalogItem, ModelKind } from "@/lib/catalog/types";
import {
  add,
  dist,
  dot,
  frontZone,
  expandRect,
  itemRect,
  norm,
  pointInPolygon,
  polygonArea,
  polygonBounds,
  polygonCentroid,
  rad2deg,
  rectsOverlap,
  rotate,
  scale,
  sub,
  sideZones,
  type Rect,
} from "./geometry";
import { instantiate } from "./instantiate";
import { pickColor, type Palette } from "./palette";
import type { Item, Point, Room, Scene } from "./types";
import { formatFtIn } from "./units";
import { validateItem, sceneMetrics, validateScene, type SceneMetrics } from "./validate";

export type Strategy = "open" | "functional" | "design";

export const STRATEGIES: { id: Strategy; name: string; blurb: string }[] = [
  { id: "open", name: "Maximum open space", blurb: "Furniture hugs walls and corners to keep the center of the room free." },
  { id: "functional", name: "Maximum functionality", blurb: "Optimized for daily use: work by the window, dining near the kitchen, short walking paths." },
  { id: "design", name: "Design-focused", blurb: "Symmetry, centered focal walls and anchored seating groups." },
];

export interface PlacementRequest {
  catalogId: string;
  quantity?: number;
  color?: string;
  material?: string;
  roomId?: string;
}

export interface SolveOptions {
  strategy: Strategy;
  seed?: number;
  roomId?: string;
  keepExisting?: boolean;
  palette?: Palette;
  /** only accept placements that satisfy every clearance (used for fit checks) */
  strictOnly?: boolean;
}

export interface FailedPlacement {
  catalogId: string;
  name: string;
  reason: string;
  suggestion?: { catalogId: string; name: string; width: number };
}

export interface SolveResult {
  items: Item[];
  added: Item[];
  failed: FailedPlacement[];
  notes: string[];
}

// ───────────────────────── helpers ─────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRIORITY: Partial<Record<ModelKind, number>> = {
  bed: 1,
  sectional: 2,
  sofa: 3,
  loveseat: 3,
  "dining-table": 4,
  "round-table": 4,
  desk: 5,
  wardrobe: 6,
  dresser: 7,
  "tv-stand": 8,
  bookshelf: 9,
  console: 10,
  armchair: 11,
  "coffee-table": 12,
  "round-coffee-table": 12,
  nightstand: 13,
  chair: 14,
  stool: 14,
  "office-chair": 15,
  "side-table": 16,
  bench: 17,
  ottoman: 17,
  mirror: 18,
  rug: 19,
  "round-rug": 19,
  "floor-lamp": 20,
  plant: 21,
  tv: 22,
  "table-lamp": 23,
};

const SEATING_GROUP: ModelKind[] = ["sofa", "sectional", "loveseat"];

function facingRotation(n: Point): number {
  // rotation such that the item's front (local +y) points along n
  return rad2deg(Math.atan2(-n.x, n.y));
}

function frontDir(rot: number): Point {
  return rotate({ x: 0, y: 1 }, rot);
}

interface Edge {
  a: Point;
  b: Point;
  dir: Point;
  inward: Point;
  length: number;
}

function roomEdges(room: Room): Edge[] {
  const poly = room.polygon;
  const edges: Edge[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const d = sub(b, a);
    const length = Math.hypot(d.x, d.y);
    if (length < 12) continue;
    const dir = norm(d);
    let inward = { x: dir.y, y: -dir.x };
    const mid = add(a, scale(d, 0.5));
    if (!pointInPolygon(add(mid, scale(inward, 3)), poly, 0)) inward = scale(inward, -1);
    edges.push({ a, b, dir, inward, length });
  }
  return edges;
}

interface Ctx {
  scene: Scene;
  items: Item[];
  rng: () => number;
  strategy: Strategy;
  palette?: Palette;
  /** strict pass: hard clearances; relaxed pass: clearance conflicts become penalties */
  strict: boolean;
  /** pieces still waiting to be placed, by model (lets anchors leave room for companions) */
  pending: Map<ModelKind, number>;
}

function nameOf(c: CatalogItem) {
  return c.name;
}

/** Clearance zones of placed items that new items must not intrude on. */
function zonesOf(item: Item): Rect[] {
  const c = getCatalogItem(item.catalogId);
  if (!c || c.layer !== "floor") return [];
  const r = itemRect(item);
  const zones: Rect[] = [];
  // seating reserves its whole conversation area (coffee table + walkway), not just knee room
  if (SEATING_GROUP.includes(c.model)) zones.push(frontZone(r, 50));
  else if (c.clearance.front) zones.push(frontZone(r, c.clearance.front));
  if (c.clearance.all) zones.push(expandRect(r, { front: c.clearance.all, back: c.clearance.all, left: c.clearance.all, right: c.clearance.all }));
  if (c.clearance.sides) zones.push(...sideZones(r, Math.min(c.clearance.sides, 20)));
  return zones;
}

const ZONE_GUESTS: Partial<Record<ModelKind, ModelKind[]>> = {
  sofa: ["coffee-table", "round-coffee-table", "ottoman", "side-table"],
  sectional: ["coffee-table", "round-coffee-table", "ottoman", "side-table"],
  loveseat: ["coffee-table", "round-coffee-table", "ottoman", "side-table"],
  armchair: ["coffee-table", "round-coffee-table", "ottoman", "side-table"],
  bed: ["nightstand", "bench", "ottoman"],
  desk: ["office-chair", "chair"],
  "dining-table": ["chair", "stool", "bench"],
  "round-table": ["chair", "stool", "bench"],
  island: ["stool", "chair"],
  counter: ["stool"],
};

function intrudesZones(ctx: Ctx, cand: Item): boolean {
  const cc = getCatalogItem(cand.catalogId);
  if (!cc || cc.layer !== "floor") return false;
  const r = itemRect(cand);
  for (const other of ctx.items) {
    const oc = getCatalogItem(other.catalogId);
    if (!oc) continue;
    const guests = ZONE_GUESTS[oc.model] ?? [];
    if (guests.includes(cc.model)) continue;
    for (const z of zonesOf(other)) {
      if (rectsOverlap(r, z, 1)) return true;
    }
  }
  return false;
}

interface Candidate {
  item: Item;
  score: number;
}

function check(ctx: Ctx, cand: Item, strict: boolean): { ok: boolean; penalty: number } {
  const scene: Scene = { ...ctx.scene, items: [...ctx.items, cand] };
  const issues = validateItem(scene, cand);
  let penalty = 0;
  for (const i of issues) {
    if (i.severity === "error") return { ok: false, penalty: 0 };
    if (i.kind === "door-swing") return { ok: false, penalty: 0 };
    if (i.kind === "clearance") {
      if (strict) return { ok: false, penalty: 0 };
      penalty += 25;
    }
    if (i.kind === "window") penalty += 6;
  }
  if (intrudesZones(ctx, cand)) {
    if (strict) return { ok: false, penalty: 0 };
    penalty += 25;
  }
  return { ok: true, penalty };
}

function makeItem(ctx: Ctx, c: CatalogItem, x: number, y: number, rot: number, req?: PlacementRequest, over: Partial<Item> = {}): Item {
  return instantiate(c.id, x, y, ((rot % 360) + 360) % 360, {
    color: req?.color ?? pickColor(c, ctx.palette),
    material: req?.material,
    ...over,
  });
}

function doorPoints(scene: Scene): Point[] {
  return scene.openings
    .filter((o) => o.kind === "door" || o.kind === "opening")
    .map((o) => {
      const w = scene.walls.find((wl) => wl.id === o.wallId);
      if (!w) return null;
      const d = norm(sub(w.b, w.a));
      return add(w.a, scale(d, o.offset));
    })
    .filter((p): p is Point => !!p);
}

function windowSpansOnEdge(scene: Scene, e: Edge): { from: number; to: number }[] {
  const spans: { from: number; to: number }[] = [];
  for (const o of scene.openings) {
    if (o.kind !== "window") continue;
    const w = scene.walls.find((wl) => wl.id === o.wallId);
    if (!w) continue;
    const d = norm(sub(w.b, w.a));
    const c = add(w.a, scale(d, o.offset));
    // distance from window center to edge line
    const rel = sub(c, e.a);
    const along = dot(rel, e.dir);
    const perp = Math.abs(dot(rel, e.inward));
    if (perp < 8 && along > -o.width / 2 && along < e.length + o.width / 2) {
      spans.push({ from: along - o.width / 2, to: along + o.width / 2 });
    }
  }
  return spans;
}

function wallCandidates(ctx: Ctx, room: Room, c: CatalogItem, req?: PlacementRequest): Item[] {
  const out: Item[] = [];
  for (const e of roomEdges(room)) {
    if (e.length < c.width + 1) continue;
    const step = 6;
    const ts = new Set<number>();
    for (let t = c.width / 2 + 0.5; t <= e.length - c.width / 2 - 0.5; t += step) ts.add(Math.round(t * 10) / 10);
    ts.add(e.length / 2);
    ts.add(c.width / 2 + 0.5);
    ts.add(e.length - c.width / 2 - 0.5);
    const rot = facingRotation(e.inward);
    for (const t of ts) {
      if (t < c.width / 2 || t > e.length - c.width / 2) continue;
      const base = add(e.a, scale(e.dir, t));
      const center = add(base, scale(e.inward, c.depth / 2 + 0.5));
      out.push(makeItem(ctx, c, center.x, center.y, rot, req));
    }
  }
  return out;
}

function freeCandidates(ctx: Ctx, room: Room, c: CatalogItem, req?: PlacementRequest): Item[] {
  const b = polygonBounds(room.polygon);
  const out: Item[] = [];
  const step = 6;
  for (let x = b.minX + c.width / 2; x <= b.maxX - c.width / 2; x += step) {
    for (let y = b.minY + c.depth / 2; y <= b.maxY - c.depth / 2; y += step) {
      for (const rot of [0, 90]) {
        if (!pointInPolygon({ x, y }, room.polygon, 0)) continue;
        out.push(makeItem(ctx, c, x, y, rot, req));
      }
    }
  }
  return out;
}

function cornerCandidates(ctx: Ctx, room: Room, c: CatalogItem, req?: PlacementRequest): Item[] {
  const out: Item[] = [];
  const centroid = polygonCentroid(room.polygon);
  for (const v of room.polygon) {
    const toCenter = norm(sub(centroid, v));
    // nudge diagonally into the corner
    const sx = Math.sign(toCenter.x) || 1;
    const sy = Math.sign(toCenter.y) || 1;
    const p = { x: v.x + sx * (c.width / 2 + 2), y: v.y + sy * (c.depth / 2 + 2) };
    if (pointInPolygon(p, room.polygon, 0)) out.push(makeItem(ctx, c, p.x, p.y, facingRotation(toCenter), req));
  }
  return out;
}

function relativeTo(anchor: Item, local: Point, rotOffset = 0): { x: number; y: number; rot: number } {
  const p = rotate(local, anchor.rotation);
  return { x: anchor.x + p.x, y: anchor.y + p.y, rot: anchor.rotation + rotOffset };
}

function itemsOfModel(ctx: Ctx, models: ModelKind[], roomPoly?: Point[]): Item[] {
  return ctx.items.filter((i) => {
    const c = getCatalogItem(i.catalogId);
    if (!c || !models.includes(c.model)) return false;
    return roomPoly ? pointInPolygon({ x: i.x, y: i.y }, roomPoly, 1) : true;
  });
}

// ───────────────────────── scoring ─────────────────────────

function scoreCandidate(ctx: Ctx, room: Room, c: CatalogItem, cand: Item): number {
  const s = ctx.strategy;
  const centroid = polygonCentroid(room.polygon);
  const fd = frontDir(cand.rotation);
  const doors = doorPoints(ctx.scene);
  const nearestDoor = doors.length ? Math.min(...doors.map((d) => dist(d, cand))) : 200;
  const toCenter = dist(cand, centroid);
  const b = polygonBounds(room.polygon);
  const roomSpan = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  let score = 0;

  // generic: stay out of the way of doors
  score += Math.min(nearestDoor, 120) / 20;

  // how centered the piece is along its wall (1 = centered)
  const edges = roomEdges(room);
  let centeredness = 0;
  let cornerness = 0;
  let onWindowWall = false;
  for (const e of edges) {
    const rel = sub(cand, e.a);
    const perp = dot(rel, e.inward);
    if (Math.abs(perp - c.depth / 2 - 0.5) < 2 && Math.abs(dot(fd, e.inward) - 1) < 0.01) {
      const t = dot(rel, e.dir);
      centeredness = 1 - Math.abs(t - e.length / 2) / (e.length / 2);
      cornerness = 1 - Math.min(t - c.width / 2, e.length - t - c.width / 2) / Math.max(1, e.length / 2);
      const spans = windowSpansOnEdge(ctx.scene, e);
      onWindowWall = spans.some((sp) => sp.to > t - c.width / 2 && sp.from < t + c.width / 2);
    }
  }

  switch (c.model) {
    case "bed": {
      score += nearestDoor / 12;
      // leave space for the nightstands that are still to come
      const ns = ctx.pending.get("nightstand") ?? 0;
      if (ns > 0) {
        let freeSides = 0;
        for (const side of [-1, 1]) {
          const p = relativeTo(cand, { x: side * (cand.width / 2 + 12), y: -cand.depth / 2 + 9 });
          const probe: Item = { ...cand, id: "probe", catalogId: "nightstand-oak", x: p.x, y: p.y, width: 20, depth: 16, height: 24 };
          const sc: Scene = { ...ctx.scene, items: [...ctx.items, cand] };
          if (!validateItem(sc, probe).some((i) => i.severity === "error")) freeSides++;
        }
        score += Math.min(freeSides, ns) * 15;
      }
      if (onWindowWall) score -= 4;
      if (s === "design") score += centeredness * 14;
      if (s === "open") score += cornerness * 10;
      if (s === "functional") score += centeredness * 6 + nearestDoor / 10;
      // in shared rooms, keep the bed away from the kitchen
      const kitchenPts = itemsOfModel(ctx, ["fridge", "range", "sink-counter", "counter"]);
      if (kitchenPts.length) score += Math.min(...kitchenPts.map((k) => dist(k, cand))) / 15;
      break;
    }
    case "sofa":
    case "sectional":
    case "loveseat": {
      // look across the room: prefer long viewing distance
      const across = viewDepth(room, cand, c);
      score += Math.min(across, 160) / 12;
      if (across < 84) score -= 12;
      if (s === "design") score += centeredness * 12;
      if (s === "open") score += cornerness * 8;
      if (s === "functional") score -= toCenter / 40;
      const beds = itemsOfModel(ctx, ["bed"], room.polygon);
      for (const bd of beds) {
        // sofa back to bed is fine (room divider); facing the bed is not
        const toBed = norm(sub(bd, cand));
        if (dot(fd, toBed) > 0.6) score -= 8;
      }
      break;
    }
    case "tv-stand": {
      const seats = itemsOfModel(ctx, SEATING_GROUP, room.polygon);
      if (seats.length) {
        const seat = seats[0];
        const toSeat = sub(seat, cand);
        const d = Math.hypot(toSeat.x, toSeat.y);
        const facing = dot(fd, norm(toSeat));
        const seatFacing = dot(frontDir(seat.rotation), scale(norm(toSeat), -1));
        score += facing * 20 + seatFacing * 20;
        if (d < 72) score -= 20;
        if (d > 180) score -= (d - 180) / 6;
        // lateral alignment
        const lateral = Math.abs(dot(toSeat, rotate({ x: 1, y: 0 }, cand.rotation)));
        score -= lateral / 6;
      } else {
        const beds = itemsOfModel(ctx, ["bed"], room.polygon);
        if (beds.length) score += dot(fd, norm(sub(beds[0], cand))) * 15;
        else score -= toCenter / 30;
      }
      break;
    }
    case "desk": {
      if (onWindowWall) score += s === "functional" ? 12 : s === "design" ? 6 : 3;
      if (s === "open") score += cornerness * 10;
      break;
    }
    case "dining-table":
    case "round-table": {
      const kitchen = itemsOfModel(ctx, ["fridge", "range", "sink-counter", "counter", "island"]);
      if (kitchen.length) {
        const d = Math.min(...kitchen.map((k) => dist(k, cand)));
        score -= d / (s === "functional" ? 6 : 12);
      }
      if (s === "open") {
        // tuck near walls
        score -= distanceToNearestEdge(room, cand) / 6;
      }
      if (s === "design") score -= Math.abs(toCenter - roomSpan / 4) / 20;
      break;
    }
    case "dresser":
    case "wardrobe":
    case "bookshelf":
    case "console":
    case "mirror": {
      if (s === "open") score += cornerness * 10;
      if (s === "design") score += centeredness * 6;
      if (onWindowWall && c.height > 40) score -= 10;
      const beds = itemsOfModel(ctx, ["bed"], room.polygon);
      if (beds.length && c.model === "dresser") score += dot(fd, norm(sub(beds[0], cand))) * 4;
      break;
    }
    case "armchair": {
      const tables = itemsOfModel(ctx, ["coffee-table", "round-coffee-table"], room.polygon);
      if (tables.length) score -= dist(tables[0], cand) / 6;
      break;
    }
    case "floor-lamp":
    case "plant": {
      const seats = itemsOfModel(ctx, [...SEATING_GROUP, "armchair", "bed", "desk"], room.polygon);
      if (seats.length) score -= Math.min(...seats.map((x) => dist(x, cand))) / (c.model === "floor-lamp" ? 6 : 20);
      break;
    }
    default:
      break;
  }

  score += (ctx.rng() - 0.5) * 3;
  return score;
}

function distanceToNearestEdge(room: Room, p: Point) {
  let best = Infinity;
  for (const e of roomEdges(room)) {
    const rel = sub(p, e.a);
    const t = Math.max(0, Math.min(e.length, dot(rel, e.dir)));
    const q = add(e.a, scale(e.dir, t));
    best = Math.min(best, dist(q, p));
  }
  return best;
}

function viewDepth(room: Room, cand: Item, c: CatalogItem): number {
  const fd = frontDir(cand.rotation);
  const start = add({ x: cand.x, y: cand.y }, scale(fd, c.depth / 2));
  let d = 0;
  while (d < 400 && pointInPolygon(add(start, scale(fd, d + 6)), room.polygon, 0)) d += 6;
  return d;
}

// ───────────────────────── placement ─────────────────────────

function best(ctx: Ctx, room: Room, c: CatalogItem, cands: Item[], scoreFn?: (i: Item) => number): Item | null {
  for (const strict of ctx.strict ? [true] : [false]) {
    let top: Candidate | null = null;
    for (const cand of cands) {
      const { ok, penalty } = check(ctx, cand, strict);
      if (!ok) continue;
      const score = (scoreFn ? scoreFn(cand) : scoreCandidate(ctx, room, c, cand)) - penalty;
      if (!top || score > top.score) top = { item: cand, score };
    }
    if (top) return top.item;
  }
  return null;
}

function placeRelative(ctx: Ctx, room: Room, c: CatalogItem, req?: PlacementRequest): Item | null | undefined {
  const m = c.model;
  const poly = room.polygon;
  const mk = (p: { x: number; y: number; rot: number }, over: Partial<Item> = {}) => makeItem(ctx, c, p.x, p.y, p.rot, req, over);

  if (m === "nightstand") {
    const beds = itemsOfModel(ctx, ["bed"], poly);
    if (!beds.length) return undefined;
    const cands: Item[] = [];
    for (const bed of beds) {
      for (const side of [-1, 1]) {
        const local = { x: side * (bed.width / 2 + 2 + c.width / 2), y: -bed.depth / 2 + c.depth / 2 + 0.5 };
        cands.push(mk(relativeTo(bed, local)));
      }
    }
    return best(ctx, room, c, cands, () => ctx.rng());
  }

  if (m === "coffee-table" || m === "round-coffee-table" || m === "ottoman") {
    const seats = itemsOfModel(ctx, SEATING_GROUP, poly);
    const anchor = seats[0] ?? itemsOfModel(ctx, ["armchair"], poly)[0];
    if (!anchor) return undefined;
    const ac = requireCatalogItem(anchor.catalogId);
    const gaps = [16, 18, 14, 20];
    const cands: Item[] = [];
    // an L sectional's chaise sits on its local left; shift the table toward the main seat
    const lateral = ac.model === "sectional" ? anchor.width * 0.12 : 0;
    for (const g of gaps) {
      for (const lat of [lateral, 0]) {
        const local = { x: lat, y: anchor.depth / 2 + g + c.depth / 2 };
        cands.push(mk(relativeTo(anchor, local)));
      }
    }
    return best(ctx, room, c, cands, (i) => -Math.abs(dist(i, anchor)) / 10);
  }

  if (m === "side-table") {
    const seats = itemsOfModel(ctx, [...SEATING_GROUP, "armchair", "bed"], poly);
    if (!seats.length) return undefined;
    const cands: Item[] = [];
    for (const s of seats) {
      for (const side of [-1, 1]) {
        cands.push(mk(relativeTo(s, { x: side * (s.width / 2 + 2 + c.width / 2), y: -s.depth / 2 + c.depth / 2 + 2 })));
      }
    }
    return best(ctx, room, c, cands, () => ctx.rng());
  }

  if (m === "chair" || m === "stool" || m === "bench") {
    const tables = itemsOfModel(ctx, m === "stool" ? ["island", "counter", "dining-table", "round-table"] : ["dining-table", "round-table"], undefined).filter((t) =>
      pointInPolygon({ x: t.x, y: t.y }, poly, 1) || ctx.scene.rooms.length <= 3,
    );
    const benchBed = m === "bench" ? itemsOfModel(ctx, ["bed"], poly)[0] : undefined;
    if (benchBed && !tables.length) {
      return best(ctx, room, c, [mk(relativeTo(benchBed, { x: 0, y: benchBed.depth / 2 + c.depth / 2 + 2 }))], () => 0);
    }
    if (!tables.length) return undefined;
    const cands: Item[] = [];
    for (const t of tables) {
      const tc = requireCatalogItem(t.catalogId);
      if (tc.model === "round-table") {
        for (let k = 0; k < 8; k++) {
          const ang = (k * 360) / 8 + 90;
          const r = t.width / 2 + c.depth / 2 - 6;
          const local = rotate({ x: 0, y: r }, ang);
          cands.push(mk({ x: t.x + local.x, y: t.y + local.y, rot: ang + 180 }));
        }
      } else {
        const longSide = t.width >= t.depth;
        const L = longSide ? t.width : t.depth;
        const n = Math.max(1, Math.floor(L / (c.width + 6)));
        for (let k = 0; k < n; k++) {
          const along = -L / 2 + (L / n) * (k + 0.5);
          for (const side of [-1, 1]) {
            const off = (longSide ? t.depth : t.width) / 2 + c.depth / 2 - 6;
            const local = longSide ? { x: along, y: side * off } : { x: side * off, y: along };
            const rotOff = longSide ? (side > 0 ? 180 : 0) : side > 0 ? 90 : 270;
            cands.push(mk(relativeTo(t, local, rotOff)));
          }
        }
        if (tc.model === "dining-table" && m !== "stool") {
          for (const side of [-1, 1]) {
            const off = t.width / 2 + c.depth / 2 - 4;
            cands.push(mk(relativeTo(t, { x: side * off, y: 0 }, side > 0 ? 90 : 270)));
          }
        }
      }
    }
    return best(ctx, room, c, cands, (i) => -dist(i, tables[0]) / 20 + ctx.rng());
  }

  if (m === "office-chair") {
    const desks = itemsOfModel(ctx, ["desk"], poly);
    if (!desks.length) return undefined;
    const d = desks[0];
    return best(ctx, room, c, [mk(relativeTo(d, { x: 0, y: d.depth / 2 + c.depth / 2 - 10 }, 180))], () => 0);
  }

  if (m === "rug" || m === "round-rug") {
    const seats = itemsOfModel(ctx, SEATING_GROUP, poly);
    const tables = itemsOfModel(ctx, ["coffee-table", "round-coffee-table"], poly);
    const dining = itemsOfModel(ctx, ["round-table", "dining-table"], poly);
    const beds = itemsOfModel(ctx, ["bed"], poly);
    const cands: Item[] = [];
    if (m === "round-rug" && dining.length) cands.push(mk({ x: dining[0].x, y: dining[0].y, rot: 0 }));
    if (seats.length) {
      const s = seats[0];
      const t = tables[0];
      const center = t ? { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 } : relativeTo(s, { x: 0, y: s.depth / 2 });
      for (const shrink of [0, 12, 24]) {
        cands.push(mk({ ...center, rot: s.rotation }, { width: Math.max(48, c.width - shrink), depth: Math.max(36, c.depth - shrink) }));
      }
    }
    if (beds.length) {
      const b = beds[0];
      const p = relativeTo(b, { x: 0, y: 14 });
      cands.push(mk({ ...p, rot: b.rotation + 90 }));
      cands.push(mk({ ...p, rot: b.rotation }));
    }
    if (dining.length && m !== "round-rug") cands.push(mk({ x: dining[0].x, y: dining[0].y, rot: dining[0].rotation }));
    if (!cands.length) return undefined;
    return best(ctx, room, c, cands, () => 0);
  }

  if (m === "tv" || m === "table-lamp") {
    const hostModels: ModelKind[] = m === "tv" ? ["tv-stand", "dresser"] : ["nightstand", "side-table", "desk", "dresser", "console"];
    const hosts = itemsOfModel(ctx, hostModels, poly).filter((h) => !ctx.items.some((o) => o.elevation > 0 && dist(o, h) < 6));
    if (!hosts.length) return undefined;
    const h = hosts[0];
    const p = relativeTo(h, { x: 0, y: m === "tv" ? -h.depth / 2 + c.depth / 2 + 2 : 0 });
    return makeItem(ctx, c, p.x, p.y, h.rotation, req, { elevation: h.height });
  }

  if (m === "armchair") {
    const tables = itemsOfModel(ctx, ["coffee-table", "round-coffee-table"], poly);
    if (!tables.length) return undefined;
    const t = tables[0];
    const cands: Item[] = [];
    for (const side of [-1, 1]) {
      const local = { x: side * (t.width / 2 + 16 + c.depth / 2), y: 0 };
      cands.push(mk(relativeTo(t, local, side > 0 ? 90 : 270)));
      cands.push(mk(relativeTo(t, { x: 0, y: t.depth / 2 + 16 + c.depth / 2 }, 180)));
    }
    const pick = best(ctx, room, c, cands, () => ctx.rng());
    return pick ?? undefined;
  }

  return undefined;
}

function candidatesFor(ctx: Ctx, room: Room, c: CatalogItem, req?: PlacementRequest): Item[] {
  switch (c.placement) {
    case "wall":
      return wallCandidates(ctx, room, c, req);
    case "corner":
      return [...cornerCandidates(ctx, room, c, req), ...wallCandidates(ctx, room, c, req)];
    case "free":
    default:
      return freeCandidates(ctx, room, c, req);
  }
}

/** Pieces that only make sense next to an anchor piece. */
const ANCHORS: Partial<Record<ModelKind, ModelKind[]>> = {
  nightstand: ["bed"],
  "coffee-table": [...SEATING_GROUP, "armchair"],
  "round-coffee-table": [...SEATING_GROUP, "armchair"],
  "side-table": [...SEATING_GROUP, "armchair", "bed"],
  chair: ["dining-table", "round-table"],
  stool: ["island", "counter", "dining-table", "round-table"],
  "office-chair": ["desk"],
  tv: ["tv-stand", "dresser"],
  "table-lamp": ["nightstand", "side-table", "desk", "dresser", "console"],
  rug: [...SEATING_GROUP, "bed", "dining-table", "round-table"],
  "round-rug": [...SEATING_GROUP, "bed", "dining-table", "round-table"],
};

function placeOne(ctx: Ctx, room: Room, c: CatalogItem, req?: PlacementRequest): Item | null {
  const rel = placeRelative(ctx, room, c, req);
  if (rel) return rel;
  // anchored pieces never drift into another room or a random wall when their anchor exists
  const anchors = ANCHORS[c.model];
  if (anchors && itemsOfModel(ctx, anchors).length > 0 && !itemsOfModel(ctx, anchors, room.polygon).length) return null;
  // pieces that belong next to an anchor wait for the relaxed pass instead of drifting elsewhere
  if (rel === null && ["nightstand", "tv", "table-lamp", "office-chair", "coffee-table", "round-coffee-table", "side-table", "chair", "stool"].includes(c.model)) return null;
  const cands = candidatesFor(ctx, room, c, req);
  const pick = best(ctx, room, c, cands);
  if (pick) return pick;
  if (c.placement === "wall" && ["sofa", "sectional", "loveseat", "desk", "dining-table"].includes(c.model)) {
    // floating placement as a fallback (sofa as room divider etc.)
    return best(ctx, room, c, freeCandidates(ctx, room, c, req));
  }
  return null;
}

function roomsFor(scene: Scene, c: CatalogItem, roomId?: string): Room[] {
  if (roomId) {
    const r = scene.rooms.find((x) => x.id === roomId);
    if (r) return [r];
  }
  const usable = scene.rooms.filter((r) => !["bathroom", "closet", "laundry", "balcony"].includes(r.type));
  const pref = c.roomTypes;
  const ranked = usable
    .map((r) => {
      let rank = pref.indexOf(r.type);
      if (rank < 0) rank = r.type === "studio" ? 0.5 : r.type === "entry" ? 99 : 50;
      return { r, rank, area: polygonArea(r.polygon) };
    })
    .sort((a, b) => a.rank - b.rank || b.area - a.area);
  return ranked.map((x) => x.r);
}

function failureReason(scene: Scene, rooms: Room[], c: CatalogItem): string {
  if (!rooms.length) return `There is no suitable room for a ${c.name.toLowerCase()}.`;
  const longest = Math.max(...rooms.flatMap((r) => roomEdges(r).map((e) => e.length)));
  if (c.placement === "wall" && longest < c.width) {
    return `${c.name} is ${formatFtIn(c.width)} wide, but the longest wall available is ${formatFtIn(longest)}.`;
  }
  const area = rooms.reduce((s, r) => s + polygonArea(r.polygon), 0);
  if (c.width * c.depth > area * 0.35) return `${c.name} would take up more than a third of the available floor area.`;
  void scene;
  return `No spot for the ${c.name.toLowerCase()} keeps the required walkways (${c.clearance.front ? `${formatFtIn(c.clearance.front)} in front` : "clearances"}), door swings and existing furniture clear.`;
}

/**
 * Furnish a scene with the requested catalog items. Pure and deterministic for a given seed.
 * Fixed fixtures are always kept; other existing items are kept when `keepExisting` is set.
 */
export function solveLayout(scene: Scene, requests: PlacementRequest[], opts: SolveOptions): SolveResult {
  const rng = mulberry32(opts.seed ?? 1);
  const base = opts.keepExisting ? scene.items : scene.items.filter((i) => i.fixed);
  const ctx: Ctx = { scene, items: [...base], rng, strategy: opts.strategy, palette: opts.palette, strict: true, pending: new Map() };
  const units: { c: CatalogItem; req: PlacementRequest }[] = [];
  for (const r of requests) {
    const c = getCatalogItem(r.catalogId);
    if (!c || c.fixture) continue;
    for (let k = 0; k < Math.max(1, Math.min(r.quantity ?? 1, 8)); k++) units.push({ c, req: r });
  }
  units.sort((a, b) => (PRIORITY[a.c.model] ?? 50) - (PRIORITY[b.c.model] ?? 50));
  for (const u of units) ctx.pending.set(u.c.model, (ctx.pending.get(u.c.model) ?? 0) + 1);

  const added: Item[] = [];
  const failed: FailedPlacement[] = [];
  const notes: string[] = [];
  const bedRoomsUsed = new Set<string>();

  for (const { c, req } of units) {
    ctx.pending.set(c.model, (ctx.pending.get(c.model) ?? 1) - 1);
    let rooms = roomsFor(scene, c, req.roomId ?? opts.roomId);
    if (c.model === "bed") {
      const free = rooms.filter((r) => !bedRoomsUsed.has(r.id));
      if (free.length) rooms = free;
    }
    let placed: Item | null = null;
    outer: for (const strict of opts.strictOnly ? [true] : [true, false]) {
      ctx.strict = strict;
      for (const room of rooms) {
        placed = placeOne(ctx, room, c, req);
        if (placed) {
          if (c.model === "bed") bedRoomsUsed.add(room.id);
          break outer;
        }
      }
    }
    ctx.strict = true;
    if (placed) {
      ctx.items.push(placed);
      added.push(placed);
    } else {
      const fail: FailedPlacement = { catalogId: c.id, name: nameOf(c), reason: failureReason(scene, rooms, c) };
      // suggest a smaller piece from the same category that fits
      const alternatives = CATALOG.filter((x) => x.category === c.category && x.id !== c.id && x.width * x.depth < c.width * c.depth).sort(
        (a, b) => b.width * b.depth - a.width * a.depth,
      );
      ctx.strict = true;
      for (const alt of alternatives) {
        let fits: Item | null = null;
        for (const room of rooms) {
          fits = placeOne(ctx, room, alt, { catalogId: alt.id });
          if (fits) break;
        }
        if (fits) {
          fail.suggestion = { catalogId: alt.id, name: alt.name, width: alt.width };
          break;
        }
      }
      failed.push(fail);
    }
  }
  return { items: ctx.items, added, failed, notes };
}

export interface LayoutAlternative {
  id: string;
  strategy: Strategy;
  name: string;
  blurb: string;
  items: Item[];
  failed: FailedPlacement[];
  metrics: SceneMetrics;
}

export function generateAlternatives(
  scene: Scene,
  requests: PlacementRequest[],
  opts: { palette?: Palette; keepExisting?: boolean; seed?: number; roomId?: string } = {},
): LayoutAlternative[] {
  return STRATEGIES.map((s, i) => {
    const res = solveLayout(scene, requests, { strategy: s.id, seed: (opts.seed ?? 7) + i * 101, palette: opts.palette, keepExisting: opts.keepExisting, roomId: opts.roomId });
    const next: Scene = { ...scene, items: res.items };
    return {
      id: `alt_${s.id}`,
      strategy: s.id,
      name: s.name,
      blurb: s.blurb,
      items: res.items,
      failed: res.failed,
      metrics: sceneMetrics(next, validateScene(next)),
    };
  });
}

/** Can a given catalog piece fit in the scene as it is now? */
export function fitCheck(scene: Scene, catalogId: string, roomId?: string) {
  const res = solveLayout(scene, [{ catalogId, roomId }], { strategy: "functional", keepExisting: true, seed: 3, strictOnly: true });
  return { fits: res.added.length > 0, item: res.added[0], failure: res.failed[0] };
}
