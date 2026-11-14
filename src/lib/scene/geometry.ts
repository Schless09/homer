import type { Item, Opening, Point, Wall } from "./types";

export const EPS = 1e-6;

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, s: number): Point => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
export const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
export const len = (a: Point) => Math.hypot(a.x, a.y);
export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Point): Point => {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
export const deg2rad = (d: number) => (d * Math.PI) / 180;
export const rad2deg = (r: number) => (r * 180) / Math.PI;
export const normDeg = (d: number) => ((d % 360) + 360) % 360;

/** Rotate a vector clockwise (in y-down plan space) by `deg` degrees. */
export function rotate(p: Point, deg: number): Point {
  const r = deg2rad(deg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export interface Rect {
  cx: number;
  cy: number;
  w: number;
  d: number;
  rot: number;
}

export function itemRect(item: Pick<Item, "x" | "y" | "width" | "depth" | "rotation">): Rect {
  return { cx: item.x, cy: item.y, w: item.width, d: item.depth, rot: item.rotation };
}

/** Corners of an oriented rect: back-left, back-right, front-right, front-left (front = local +y). */
export function rectCorners(r: Rect): Point[] {
  const hw = r.w / 2;
  const hd = r.d / 2;
  const local: Point[] = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ];
  return local.map((p) => add(rotate(p, r.rot), { x: r.cx, y: r.cy }));
}

export function polygonArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function polygonCentroid(poly: Point[]): Point {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < EPS) {
    const n = poly.length;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function polygonBounds(poly: Point[]) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Signed area > 0 means clockwise in y-down space (counterclockwise in math space). */
export function signedArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function pointInPolygon(pt: Point, poly: Point[], tolerance = 0.5): boolean {
  // boundary counts as inside (with tolerance)
  for (let i = 0; i < poly.length; i++) {
    if (distToSegment(pt, poly[i], poly[(i + 1) % poly.length]) <= tolerance) return true;
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (pi.y > pt.y !== pj.y > pt.y && pt.x < ((pj.x - pi.x) * (pt.y - pi.y)) / (pj.y - pi.y) + pi.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function distToSegment(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS) return dist(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, add(a, scale(ab, t)));
}

export function projectOnSegment(p: Point, a: Point, b: Point) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  const point = add(a, scale(ab, t));
  return { t, point, distance: dist(p, point) };
}

/** Separating-axis test for two convex polygons. `margin` shrinks the overlap needed (positive = must overlap by more than margin). */
export function polygonsOverlap(a: Point[], b: Point[], margin = 0): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const axis = norm({ x: -(q.y - p.y), y: q.x - p.x });
      let minA = Infinity,
        maxA = -Infinity,
        minB = Infinity,
        maxB = -Infinity;
      for (const v of a) {
        const d = dot(v, axis);
        minA = Math.min(minA, d);
        maxA = Math.max(maxA, d);
      }
      for (const v of b) {
        const d = dot(v, axis);
        minB = Math.min(minB, d);
        maxB = Math.max(maxB, d);
      }
      if (maxA - margin <= minB || maxB - margin <= minA) return false;
    }
  }
  return true;
}

export function rectsOverlap(a: Rect, b: Rect, margin = 0.25): boolean {
  return polygonsOverlap(rectCorners(a), rectCorners(b), margin);
}

/** Polygon (as a rect) for a wall's physical footprint, optionally skipping openings handled separately. */
export function wallRect(w: Wall): Rect {
  const dir = sub(w.b, w.a);
  return {
    cx: (w.a.x + w.b.x) / 2,
    cy: (w.a.y + w.b.y) / 2,
    w: len(dir),
    d: w.thickness,
    rot: rad2deg(Math.atan2(dir.y, dir.x)),
  };
}

/** Solid pieces of a wall in plan (excluding door/opening gaps). Windows remain solid at floor level. */
export function wallSolidRects(w: Wall, openings: Opening[]): Rect[] {
  const L = dist(w.a, w.b);
  if (L < EPS) return [];
  const gaps = openings
    .filter((o) => o.wallId === w.id && o.kind !== "window")
    .map((o) => [o.offset - o.width / 2, o.offset + o.width / 2] as const)
    .sort((p, q) => p[0] - q[0]);
  const pieces: [number, number][] = [];
  let cursor = 0;
  for (const [s, e] of gaps) {
    if (s > cursor) pieces.push([cursor, Math.min(s, L)]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < L) pieces.push([cursor, L]);
  const dir = norm(sub(w.b, w.a));
  const ang = rad2deg(Math.atan2(dir.y, dir.x));
  return pieces
    .filter(([s, e]) => e - s > 0.5)
    .map(([s, e]) => {
      const mid = add(w.a, scale(dir, (s + e) / 2));
      return { cx: mid.x, cy: mid.y, w: e - s, d: w.thickness, rot: ang };
    });
}

export function wallDir(w: Wall): Point {
  return norm(sub(w.b, w.a));
}

/** Left normal of a wall in y-down plan space (counterclockwise visually). */
export function wallLeftNormal(w: Wall): Point {
  const d = wallDir(w);
  return { x: d.y, y: -d.x };
}

export function openingCenter(w: Wall, o: Opening): Point {
  return add(w.a, scale(wallDir(w), o.offset));
}

/**
 * Approximate a door's swing area as a square (door width x door width) on the swing side.
 * Good enough for clearance warnings; drawn as an arc in the UI.
 */
export function doorSwingRect(w: Wall, o: Opening): Rect {
  const c = openingCenter(w, o);
  const n = o.swing === "left" ? wallLeftNormal(w) : scale(wallLeftNormal(w), -1);
  const offset = w.thickness / 2 + o.width / 2;
  const center = add(c, scale(n, offset));
  const dir = wallDir(w);
  return { cx: center.x, cy: center.y, w: o.width, d: o.width, rot: rad2deg(Math.atan2(dir.y, dir.x)) };
}

export function snap(v: number, step: number) {
  return Math.round(v / step) * step;
}

export function rectAabb(r: Rect) {
  return polygonBounds(rectCorners(r));
}

/** Expand an oriented rect by per-side clearances (local frame: back = -y, front = +y). */
export function expandRect(r: Rect, c: { front?: number; back?: number; left?: number; right?: number }): Rect {
  const front = c.front ?? 0;
  const back = c.back ?? 0;
  const left = c.left ?? 0;
  const right = c.right ?? 0;
  const localShift = { x: (right - left) / 2, y: (front - back) / 2 };
  const s = rotate(localShift, r.rot);
  return { cx: r.cx + s.x, cy: r.cy + s.y, w: r.w + left + right, d: r.d + front + back, rot: r.rot };
}

/** Clearance zone strip in front of an item (local +y side). */
export function frontZone(r: Rect, depth: number, widthPad = 0): Rect {
  const shift = rotate({ x: 0, y: r.d / 2 + depth / 2 }, r.rot);
  return { cx: r.cx + shift.x, cy: r.cy + shift.y, w: r.w + widthPad * 2, d: depth, rot: r.rot };
}

export function sideZones(r: Rect, width: number): Rect[] {
  const left = rotate({ x: -(r.w / 2 + width / 2), y: 0 }, r.rot);
  const right = rotate({ x: r.w / 2 + width / 2, y: 0 }, r.rot);
  return [
    { cx: r.cx + left.x, cy: r.cy + left.y, w: width, d: r.d * 0.7, rot: r.rot },
    { cx: r.cx + right.x, cy: r.cy + right.y, w: width, d: r.d * 0.7, rot: r.rot },
  ];
}
