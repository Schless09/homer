import { getCatalogItem } from "@/lib/catalog/items";
import type { CatalogItem, ModelKind } from "@/lib/catalog/types";
import {
  doorSwingRect,
  expandRect,
  frontZone,
  itemRect,
  pointInPolygon,
  polygonArea,
  polygonsOverlap,
  rectCorners,
  rectsOverlap,
  sideZones,
  wallSolidRects,
  type Rect,
  openingCenter,
  wallDir,
  add,
  scale,
  wallLeftNormal,
  rad2deg,
} from "./geometry";
import type { Item, Room, Scene } from "./types";
import { formatFtIn } from "./units";

export type Severity = "error" | "warning" | "info";
export type IssueKind = "collision" | "out-of-bounds" | "wall" | "door-swing" | "clearance" | "window";

export interface Issue {
  id: string;
  itemId: string;
  otherId?: string;
  severity: Severity;
  kind: IssueKind;
  message: string;
  zone?: Rect;
}

const SEATING: ModelKind[] = ["chair", "stool", "office-chair", "bench"];
const TABLES: ModelKind[] = ["dining-table", "round-table", "desk", "island", "counter"];
const LOW_TABLES: ModelKind[] = ["coffee-table", "round-coffee-table", "ottoman"];

function cat(item: Item): CatalogItem | undefined {
  return getCatalogItem(item.catalogId);
}

function layerOf(item: Item) {
  return cat(item)?.layer ?? "floor";
}

function modelOf(item: Item): ModelKind | undefined {
  return cat(item)?.model;
}

/** Whether two items are allowed to overlap in plan (chairs tucked under tables, etc.). */
function overlapAllowed(a: Item, b: Item): boolean {
  const la = layerOf(a);
  const lb = layerOf(b);
  if (la !== "floor" || lb !== "floor") return true;
  const ma = modelOf(a);
  const mb = modelOf(b);
  if (!ma || !mb) return false;
  if (SEATING.includes(ma) && TABLES.includes(mb)) return true;
  if (SEATING.includes(mb) && TABLES.includes(ma)) return true;
  return false;
}

/** Items that may live inside another item's clearance zone. */
function zoneAllows(owner: Item, other: Item): boolean {
  const mo = modelOf(owner);
  const mx = modelOf(other);
  if (layerOf(other) !== "floor") return true;
  if (!mo || !mx) return false;
  if ((mo === "sofa" || mo === "sectional" || mo === "loveseat" || mo === "armchair") && (LOW_TABLES.includes(mx) || mx === "side-table")) return true;
  if ((mo === "desk" || mo === "dining-table" || mo === "round-table" || mo === "island" || mo === "counter") && SEATING.includes(mx)) return true;
  if (mo === "bed" && (mx === "nightstand" || mx === "bench" || mx === "ottoman")) return true;
  if (mo === "tv-stand" && (LOW_TABLES.includes(mx))) return false;
  return false;
}

export function roomsContainingRect(rooms: Room[], r: Rect): boolean {
  if (rooms.length === 0) return true;
  const corners = rectCorners(r);
  return corners.every((c) => rooms.some((room) => pointInPolygon(c, room.polygon, 1)));
}

/** Convex outline of the apartment from its exterior walls (or all walls), cached per walls array. */
const envelopeCache = new WeakMap<Scene["walls"], { x: number; y: number }[]>();
function envelope(scene: Scene): { x: number; y: number }[] {
  const hit = envelopeCache.get(scene.walls);
  if (hit) return hit;
  const ext = scene.walls.filter((w) => w.exterior);
  const pts = (ext.length >= 3 ? ext : scene.walls).flatMap((w) => [w.a, w.b]);
  let hull: { x: number; y: number }[] = [];
  if (pts.length >= 3) {
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
    hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  }
  envelopeCache.set(scene.walls, hull);
  return hull;
}

/**
 * Inside the home: each corner is in a traced room, or within the apartment's outer walls.
 * Traced room outlines often leave gaps (hallways, nooks), so they alone would raise false alarms;
 * crossing an actual wall is caught separately.
 */
export function insideHome(scene: Scene, r: Rect): boolean {
  if (scene.rooms.length === 0 && scene.walls.length === 0) return true;
  const env = envelope(scene);
  return rectCorners(r).every((c) => scene.rooms.some((room) => pointInPolygon(c, room.polygon, 1)) || (env.length >= 3 && pointInPolygon(c, env, 1)));
}

export function roomAt(rooms: Room[], x: number, y: number): Room | undefined {
  return rooms.find((r) => pointInPolygon({ x, y }, r.polygon, 0));
}

export function rectHitsWalls(scene: Scene, r: Rect): boolean {
  const poly = rectCorners(r);
  for (const w of scene.walls) {
    for (const piece of wallSolidRects(w, scene.openings)) {
      if (polygonsOverlap(poly, rectCorners(piece), 0.5)) return true;
    }
  }
  return false;
}

function zoneBlocked(scene: Scene, owner: Item, zone: Rect): { by: "wall" | "outside" | Item } | null {
  if (rectHitsWalls(scene, zone)) return { by: "wall" };
  if (!insideHome(scene, zone)) return { by: "outside" };
  const ownerFixed = !!cat(owner)?.fixture;
  for (const other of scene.items) {
    if (other.id === owner.id) continue;
    if (zoneAllows(owner, other)) continue;
    // fixtures next to fixtures (L-shaped counters, fridge beside an island) are by design
    if (ownerFixed && cat(other)?.fixture) continue;
    if (overlapAllowed(owner, other) && layerOf(other) !== "floor") continue;
    if (rectsOverlap(zone, itemRect(other), 1)) return { by: other };
  }
  return null;
}

function nameOf(item: Item) {
  return item.label ?? cat(item)?.name ?? "Item";
}

/** Validate a single item against the scene. */
export function validateItem(scene: Scene, item: Item): Issue[] {
  const issues: Issue[] = [];
  const c = cat(item);
  const layer = c?.layer ?? "floor";
  const r = itemRect(item);
  const name = nameOf(item);

  // Built-in fixtures come from the floor plan itself; small mismatches against traced room
  // outlines and wall lines aren't something the user can act on, so they aren't flagged.
  const builtIn = !!c?.fixture && item.fixed;
  if (!builtIn && !insideHome(scene, r)) {
    issues.push({ id: `${item.id}:oob`, itemId: item.id, severity: "error", kind: "out-of-bounds", message: `${name} extends past the apartment's walls.` });
  }

  if (layer === "surface" || layer === "wall-mounted") return issues;

  if (layer === "floor" && !builtIn && rectHitsWalls(scene, r)) {
    issues.push({ id: `${item.id}:wall`, itemId: item.id, severity: "error", kind: "wall", message: `${name} intersects a wall.` });
  }

  if (layer === "floor") {
    for (const other of scene.items) {
      if (other.id === item.id || overlapAllowed(item, other)) continue;
      if (rectsOverlap(r, itemRect(other))) {
        const key = [item.id, other.id].sort().join("|");
        issues.push({ id: `${key}:col:${item.id}`, itemId: item.id, otherId: other.id, severity: "error", kind: "collision", message: `${name} overlaps ${nameOf(other)}.` });
      }
    }

    // Doors: keep swing area free
    if (!c?.fixture) {
      for (const o of scene.openings) {
        if (o.kind !== "door") continue;
        const w = scene.walls.find((wl) => wl.id === o.wallId);
        if (!w) continue;
        const swing = doorSwingRect(w, o);
        if (rectsOverlap(r, swing, 1)) {
          issues.push({ id: `${item.id}:door:${o.id}`, itemId: item.id, severity: "warning", kind: "door-swing", message: `${name} blocks a door swing.`, zone: swing });
        }
      }
    }

    // Tall pieces in front of windows
    if (c && item.height >= 44 && !["plant", "floor-lamp"].includes(c.model)) {
      for (const o of scene.openings) {
        if (o.kind !== "window") continue;
        const w = scene.walls.find((wl) => wl.id === o.wallId);
        if (!w) continue;
        const center = openingCenter(w, o);
        const n = wallLeftNormal(w);
        const dir = wallDir(w);
        for (const sgn of [1, -1]) {
          const zc = add(center, scale(n, sgn * (w.thickness / 2 + 8)));
          const zone: Rect = { cx: zc.x, cy: zc.y, w: o.width, d: 14, rot: rad2deg(Math.atan2(dir.y, dir.x)) };
          if (rectsOverlap(r, zone, 1)) {
            issues.push({ id: `${item.id}:win:${o.id}`, itemId: item.id, severity: "info", kind: "window", message: `${name} (${Math.round(item.height)}" tall) partially blocks a window.` });
            break;
          }
        }
      }
    }

    // Clearances
    if (c) {
      const cl = c.clearance;
      if (cl.front) {
        const zone = frontZone(r, cl.front);
        const blocked = zoneBlocked(scene, item, zone);
        // a built-in hemmed in by the architecture is just how the apartment is; only furniture in the way is actionable
        if (blocked && !(builtIn && (blocked.by === "wall" || blocked.by === "outside"))) {
          const what = blocked.by === "wall" ? "a wall" : blocked.by === "outside" ? "the room edge" : nameOf(blocked.by);
          issues.push({ id: `${item.id}:front`, itemId: item.id, severity: "warning", kind: "clearance", message: `${name} needs ${formatFtIn(cl.front)} clear in front; blocked by ${what}.`, zone });
        }
      }
      if (cl.sides) {
        const zones = sideZones(r, cl.sides);
        const blocked = zones.map((z) => zoneBlocked(scene, item, z));
        if (blocked.every(Boolean)) {
          issues.push({ id: `${item.id}:sides`, itemId: item.id, severity: "warning", kind: "clearance", message: `${name} has no ${formatFtIn(cl.sides)} walkway on either side.`, zone: zones[0] });
        }
      }
      if (cl.all) {
        const zone = expandRect(r, { front: cl.all, back: cl.all, left: cl.all, right: cl.all });
        const blocked = zoneBlocked(scene, item, zone);
        if (blocked && !(builtIn && (blocked.by === "wall" || blocked.by === "outside"))) {
          const what = blocked.by === "wall" ? "a wall" : blocked.by === "outside" ? "the room edge" : nameOf(blocked.by);
          issues.push({ id: `${item.id}:all`, itemId: item.id, severity: "warning", kind: "clearance", message: `${name} needs ${formatFtIn(cl.all)} around it for chairs and walking; tight near ${what}.`, zone });
        }
      }
    }
  }
  return issues;
}

export function validateScene(scene: Scene): Issue[] {
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (const item of scene.items) {
    for (const issue of validateItem(scene, item)) {
      if (issue.kind === "collision" && issue.otherId) {
        const key = [item.id, issue.otherId].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
      }
      out.push(issue);
    }
  }
  return out;
}

export interface SceneMetrics {
  totalArea: number;
  furnishedArea: number;
  openArea: number;
  openPct: number;
  totalPrice: number;
  itemCount: number;
  errors: number;
  warnings: number;
}

export function sceneMetrics(scene: Scene, issues = validateScene(scene)): SceneMetrics {
  const totalArea = scene.rooms.reduce((s, r) => s + polygonArea(r.polygon), 0);
  let furnished = 0;
  let price = 0;
  let count = 0;
  for (const it of scene.items) {
    const c = cat(it);
    if (c?.layer === "floor") furnished += it.width * it.depth;
    if (c && !c.fixture) {
      price += c.price;
      count++;
    }
  }
  const openArea = Math.max(0, totalArea - furnished);
  return {
    totalArea,
    furnishedArea: furnished,
    openArea,
    openPct: totalArea > 0 ? openArea / totalArea : 0,
    totalPrice: price,
    itemCount: count,
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
  };
}
