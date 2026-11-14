import { dot, norm, rectAabb, rectCorners, sub, wallSolidRects, type Rect } from "./geometry";
import type { Item, Point, Scene } from "./types";

export interface Guide {
  axis: "x" | "y";
  value: number;
  from: number;
  to: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: Guide[];
  wallSnapped: boolean;
}

interface Face {
  a: Point;
  b: Point;
  n: Point;
}

/** Physical wall faces (both sides of every solid wall piece). */
export function wallFaces(scene: Scene): Face[] {
  const out: Face[] = [];
  for (const w of scene.walls) {
    for (const piece of wallSolidRects(w, scene.openings)) {
      const c = rectCorners(piece); // back-left, back-right, front-right, front-left
      const dir = norm(sub(c[1], c[0]));
      const nBack = { x: dir.y, y: -dir.x };
      out.push({ a: c[0], b: c[1], n: nBack });
      out.push({ a: c[3], b: c[2], n: { x: -nBack.x, y: -nBack.y } });
    }
  }
  return out;
}

function aligned(rotDeg: number, face: Face): boolean {
  const faceAng = (Math.atan2(face.b.y - face.a.y, face.b.x - face.a.x) * 180) / Math.PI;
  const diff = (((rotDeg - faceAng) % 90) + 90) % 90;
  return diff < 1 || diff > 89;
}

/**
 * Snap a dragged item: flush against nearby wall faces, aligned with other
 * items' edges/centers, and to the grid as a fallback. Threshold in inches.
 */
export function snapItem(
  scene: Scene,
  item: Item,
  pos: { x: number; y: number },
  opts: { threshold: number; grid?: number; ignore?: Set<string>; faces?: Face[] },
): SnapResult {
  let x = pos.x;
  let y = pos.y;
  let wallSnapped = false;
  const guides: Guide[] = [];
  const thr = opts.threshold;

  // 1) walls
  const faces = opts.faces ?? wallFaces(scene);
  let snappedX = false;
  let snappedY = false;
  for (const f of faces) {
    if (!aligned(item.rotation, f)) continue;
    const r: Rect = { cx: x, cy: y, w: item.width, d: item.depth, rot: item.rotation };
    const corners = rectCorners(r);
    const dirF = norm(sub(f.b, f.a));
    const L = dot(sub(f.b, f.a), dirF);
    const proj = corners.map((c) => dot(sub(c, f.a), dirF));
    const overlap = Math.min(L, Math.max(...proj)) - Math.max(0, Math.min(...proj));
    if (overlap < 2) continue;
    const s = corners.map((c) => dot(sub(c, f.a), f.n));
    const minS = Math.min(...s);
    if (minS > -thr && minS < thr) {
      const shift = 0.25 - minS;
      const dx = f.n.x * shift;
      const dy = f.n.y * shift;
      if (Math.abs(f.n.x) > 0.5 && snappedX) continue;
      if (Math.abs(f.n.y) > 0.5 && snappedY) continue;
      x += dx;
      y += dy;
      if (Math.abs(f.n.x) > 0.5) snappedX = true;
      if (Math.abs(f.n.y) > 0.5) snappedY = true;
      wallSnapped = true;
    }
  }

  // 2) alignment with other items
  const me = rectAabb({ cx: x, cy: y, w: item.width, d: item.depth, rot: item.rotation });
  const myX = [me.minX, (me.minX + me.maxX) / 2, me.maxX];
  const myY = [me.minY, (me.minY + me.maxY) / 2, me.maxY];
  let bestX: { d: number; v: number; o: ReturnType<typeof rectAabb> } | null = null;
  let bestY: { d: number; v: number; o: ReturnType<typeof rectAabb> } | null = null;
  for (const other of scene.items) {
    if (other.id === item.id || opts.ignore?.has(other.id) || other.elevation > 0) continue;
    const o = rectAabb({ cx: other.x, cy: other.y, w: other.width, d: other.depth, rot: other.rotation });
    const ox = [o.minX, (o.minX + o.maxX) / 2, o.maxX];
    const oy = [o.minY, (o.minY + o.maxY) / 2, o.maxY];
    if (!snappedX)
      for (const a of myX)
        for (const b of ox) {
          const d = b - a;
          if (Math.abs(d) < thr && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, v: b, o };
        }
    if (!snappedY)
      for (const a of myY)
        for (const b of oy) {
          const d = b - a;
          if (Math.abs(d) < thr && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, v: b, o };
        }
  }
  if (bestX) {
    x += bestX.d;
    snappedX = true;
    guides.push({ axis: "x", value: bestX.v, from: Math.min(me.minY, bestX.o.minY) - 12, to: Math.max(me.maxY, bestX.o.maxY) + 12 });
  }
  if (bestY) {
    y += bestY.d;
    snappedY = true;
    guides.push({ axis: "y", value: bestY.v, from: Math.min(me.minX, bestY.o.minX) - 12, to: Math.max(me.maxX, bestY.o.maxX) + 12 });
  }

  // 3) grid
  if (opts.grid) {
    if (!snappedX) x = Math.round(x / opts.grid) * opts.grid;
    if (!snappedY) y = Math.round(y / opts.grid) * opts.grid;
  }
  return { x, y, guides, wallSnapped };
}

/** Distances from an item's four sides to the nearest wall face, along its local axes. */
export function clearanceRays(scene: Scene, item: Item, faces = wallFaces(scene)) {
  const rad = (item.rotation * Math.PI) / 180;
  const ux = { x: Math.cos(rad), y: Math.sin(rad) };
  const uy = { x: -Math.sin(rad), y: Math.cos(rad) };
  const dirs = [
    { d: uy, half: item.depth / 2, side: "front" },
    { d: { x: -uy.x, y: -uy.y }, half: item.depth / 2, side: "back" },
    { d: ux, half: item.width / 2, side: "right" },
    { d: { x: -ux.x, y: -ux.y }, half: item.width / 2, side: "left" },
  ] as const;
  const out: { side: string; from: Point; to: Point; length: number }[] = [];
  for (const { d, half, side } of dirs) {
    const from = { x: item.x + d.x * half, y: item.y + d.y * half };
    let best = Infinity;
    for (const f of faces) {
      // ray-segment intersection
      const e = sub(f.b, f.a);
      const denom = d.x * e.y - d.y * e.x;
      if (Math.abs(denom) < 1e-9) continue;
      const w = sub(f.a, from);
      const t = (w.x * e.y - w.y * e.x) / denom;
      const u = (w.x * d.y - w.y * d.x) / denom;
      if (t > 0.01 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
    if (best < 360) out.push({ side, from, to: { x: from.x + d.x * best, y: from.y + d.y * best }, length: best });
  }
  return out;
}
