"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KImage, Layer, Line, Rect, Shape, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";
import { useShallow } from "zustand/react/shallow";
import { getCatalogItem } from "@/lib/catalog/items";
import {
  add,
  deg2rad,
  dist,
  norm,
  normDeg,
  openingCenter,
  pointInPolygon,
  polygonArea,
  polygonBounds,
  polygonCentroid,
  projectOnSegment,
  rad2deg,
  rectCorners,
  scale as vscale,
  sub,
  wallDir,
  wallLeftNormal,
  wallSolidRects,
} from "@/lib/scene/geometry";
import { newId } from "@/lib/scene/ids";
import { clearanceRays, snapItem, wallFaces, type Guide } from "@/lib/scene/snapping";
import type { Item, Opening, Point, Room, Scene, Wall } from "@/lib/scene/types";
import { formatFtIn, formatSqft } from "@/lib/scene/units";
import { validateScene, type Issue } from "@/lib/scene/validate";
import { useDisplayScene, useEditor } from "@/store/editor";
import { useViewport } from "@/store/viewport";
import { ItemGlyph } from "./ItemGlyph";

const BRAND = "#b4654a";
const WALL_INK = "#2b2a27";
const FLOOR_TINTS: Record<string, string> = {
  oak: "#f4ece0",
  walnut: "#efe4d8",
  maple: "#f7f0e4",
  concrete: "#eeedeb",
  "tile-white": "#f6f6f4",
  "tile-gray": "#ececea",
  "carpet-oatmeal": "#f1ebe1",
  herringbone: "#f3eadc",
};
const ROOM_TINT: Partial<Record<Room["type"], string>> = { bathroom: "#eef2f3", kitchen: "#f3f1ec", closet: "#f0eee9" };

function useHtmlImage(url: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }
    const i = new window.Image();
    i.onload = () => setImg(i);
    i.src = url;
  }, [url]);
  return img;
}

function sceneBounds(scene: Scene) {
  const pts: Point[] = [];
  for (const w of scene.walls) pts.push(w.a, w.b);
  for (const r of scene.rooms) pts.push(...r.polygon);
  for (const i of scene.items) pts.push({ x: i.x, y: i.y });
  if (scene.background) {
    const b = scene.background;
    pts.push({ x: b.x, y: b.y }, { x: b.x + b.widthPx * b.scale, y: b.y + b.heightPx * b.scale });
  }
  if (!pts.length) return { minX: 0, minY: 0, maxX: 240, maxY: 240 };
  return polygonBounds(pts);
}

type Mode =
  | { kind: "none" }
  | { kind: "pan"; startX: number; startY: number; vx: number; vy: number; moved: boolean }
  | { kind: "marquee"; a: Point; b: Point; additive: boolean }
  | { kind: "room"; a: Point; b: Point };

export default function PlanCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Group>());
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: "none" });
  const [cursor, setCursor] = useState<Point | null>(null);
  const [wallStart, setWallStart] = useState<Point | null>(null);
  const [measure, setMeasure] = useState<{ a: Point; b: Point | null } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const dragStart = useRef<Map<string, Point>>(new Map());

  const scene = useDisplayScene();
  const ed = useEditor(
    useShallow((s) => ({
      selection: s.selection,
      tool: s.tool,
      showGrid: s.showGrid,
      snapToGrid: s.snapToGrid,
      showDims: s.showDims,
      showBackground: s.showBackground,
      showClearances: s.showClearances,
      backgroundUrl: s.backgroundUrl,
      hoverId: s.hoverId,
      previewing: !!s.preview,
      loaded: s.loaded,
    })),
  );
  const vp = useViewport(useShallow((s) => ({ scale: s.scale, x: s.x, y: s.y, fitToken: s.fitToken })));
  const bgImage = useHtmlImage(ed.showBackground ? ed.backgroundUrl : null);
  const issues = useMemo(() => validateScene(scene), [scene]);
  const faces = useMemo(() => wallFaces(scene), [scene]);
  const issueByItem = useMemo(() => {
    const m = new Map<string, Issue["severity"]>();
    for (const i of issues) {
      const prev = m.get(i.itemId);
      if (!prev || i.severity === "error" || (i.severity === "warning" && prev === "info")) m.set(i.itemId, i.severity);
    }
    return m;
  }, [issues]);

  // ───── size & fit ─────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    useViewport.getState().setStage(stageRef.current);
    return () => useViewport.getState().setStage(null);
  }, []);

  const fit = useCallback(() => {
    const b = sceneBounds(useEditor.getState().preview?.scene ?? useEditor.getState().scene);
    const pad = 70;
    const w = Math.max(1, b.maxX - b.minX);
    const h = Math.max(1, b.maxY - b.minY);
    const s = Math.max(0.2, Math.min((size.w - pad * 2) / w, (size.h - pad * 2) / h, 6));
    useViewport.getState().set({ scale: s, x: (size.w - w * s) / 2 - b.minX * s, y: (size.h - h * s) / 2 - b.minY * s });
  }, [size.w, size.h]);

  const didFit = useRef(false);
  useEffect(() => {
    if (!ed.loaded || size.w < 50) return;
    if (!didFit.current) {
      didFit.current = true;
      fit();
    }
  }, [ed.loaded, size.w, fit]);
  useEffect(() => {
    if (vp.fitToken > 0) fit();
  }, [vp.fitToken, fit]);

  // ───── keyboard: space to pan ─────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        setSpaceDown(true);
      }
      if (e.key === "Escape") {
        setWallStart(null);
        setMeasure(null);
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpaceDown(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    setWallStart(null);
    setMeasure(null);
  }, [ed.tool]);

  // ───── transformer binding ─────
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const nodes = ed.selection
      .map((id) => {
        const it = scene.items.find((i) => i.id === id);
        if (!it || it.locked || ed.previewing) return null;
        return nodeRefs.current.get(id) ?? null;
      })
      .filter((n): n is Konva.Group => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [ed.selection, scene.items, ed.previewing]);

  const toScene = useCallback((p: { x: number; y: number }): Point => {
    const v = useViewport.getState();
    return { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale };
  }, []);

  const pointer = useCallback((): Point | null => {
    const st = stageRef.current;
    const p = st?.getPointerPosition();
    return p ? toScene(p) : null;
  }, [toScene]);

  // ───── wheel zoom ─────
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const st = stageRef.current;
    if (!st) return;
    const p = st.getPointerPosition();
    if (!p) return;
    const v = useViewport.getState();
    if (!e.evt.ctrlKey && !e.evt.metaKey && Math.abs(e.evt.deltaX) > Math.abs(e.evt.deltaY) * 0.5 && Math.abs(e.evt.deltaX) > 2) {
      v.set({ x: v.x - e.evt.deltaX, y: v.y - e.evt.deltaY });
      return;
    }
    const intensity = e.evt.ctrlKey ? 0.012 : 0.0018;
    const factor = Math.exp(-e.evt.deltaY * intensity);
    v.zoomBy(factor, p);
  };

  // ───── helpers for drawing tools ─────
  const snapPoint = (p: Point, from?: Point | null): Point => {
    let q = { x: Math.round(p.x), y: Math.round(p.y) };
    const thr = 10 / useViewport.getState().scale;
    for (const w of scene.walls) {
      for (const e of [w.a, w.b]) if (dist(e, q) < thr) return { ...e };
    }
    if (from) {
      const dx = Math.abs(q.x - from.x);
      const dy = Math.abs(q.y - from.y);
      if (dx > dy * 2.5) q = { x: q.x, y: from.y };
      else if (dy > dx * 2.5) q = { x: from.x, y: q.y };
    }
    return q;
  };

  const nearestWall = (p: Point): { wall: Wall; offset: number; distance: number } | null => {
    let best: { wall: Wall; offset: number; distance: number } | null = null;
    for (const w of scene.walls) {
      const pr = projectOnSegment(p, w.a, w.b);
      if (!best || pr.distance < best.distance) best = { wall: w, offset: pr.t * dist(w.a, w.b), distance: pr.distance };
    }
    return best && best.distance < 24 ? best : null;
  };

  // ───── stage mouse ─────
  const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const st = stageRef.current;
    if (!st) return;
    const p = pointer();
    if (!p) return;
    const empty = e.target === st || e.target.name() === "room";
    const store = useEditor.getState();
    const tool = store.tool;

    if (e.evt.button === 1 || spaceDown || tool === "pan") {
      const v = useViewport.getState();
      setMode({ kind: "pan", startX: e.evt.clientX, startY: e.evt.clientY, vx: v.x, vy: v.y, moved: false });
      return;
    }
    if (store.preview) return;
    if (tool === "wall") {
      const q = snapPoint(p, wallStart);
      if (!wallStart) setWallStart(q);
      else {
        if (dist(q, wallStart) > 6) {
          const w: Wall = { id: newId("w"), a: wallStart, b: q, thickness: 4, height: 108, exterior: false };
          store.apply((s) => ({ ...s, walls: [...s.walls, w] }));
        }
        setWallStart(q);
      }
      return;
    }
    if (tool === "room") {
      const q = snapPoint(p);
      setMode({ kind: "room", a: q, b: q });
      return;
    }
    if (tool === "door" || tool === "window") {
      const nw = nearestWall(p);
      if (!nw) return;
      const width = tool === "door" ? 32 : 48;
      const L = dist(nw.wall.a, nw.wall.b);
      const offset = Math.max(width / 2, Math.min(L - width / 2, nw.offset));
      const side = Math.sign((p.x - nw.wall.a.x) * wallLeftNormal(nw.wall).x + (p.y - nw.wall.a.y) * wallLeftNormal(nw.wall).y);
      const o: Opening = {
        id: newId("o"),
        wallId: nw.wall.id,
        kind: tool,
        offset,
        width,
        height: tool === "door" ? 80 : 60,
        sill: tool === "door" ? 0 : 24,
        hinge: "start",
        swing: side >= 0 ? "left" : "right",
      };
      store.apply((s) => ({ ...s, openings: [...s.openings, o] }));
      store.select([o.id]);
      return;
    }
    if (tool === "measure") {
      const q = snapPoint(p, measure?.a);
      if (!measure || measure.b) setMeasure({ a: q, b: null });
      else setMeasure({ a: measure.a, b: q });
      return;
    }
    if (empty) {
      if (e.evt.shiftKey) setMode({ kind: "marquee", a: p, b: p, additive: true });
      else {
        const v = useViewport.getState();
        setMode({ kind: "pan", startX: e.evt.clientX, startY: e.evt.clientY, vx: v.x, vy: v.y, moved: false });
      }
    }
  };

  const onMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const p = pointer();
    setCursor(p);
    if (mode.kind === "pan") {
      const dx = e.evt.clientX - mode.startX;
      const dy = e.evt.clientY - mode.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        useViewport.getState().set({ x: mode.vx + dx, y: mode.vy + dy });
        if (!mode.moved) setMode({ ...mode, moved: true });
      }
    } else if (mode.kind === "marquee" && p) setMode({ ...mode, b: p });
    else if (mode.kind === "room" && p) setMode({ ...mode, b: snapPoint(p) });
  };

  const onMouseUp = () => {
    const store = useEditor.getState();
    if (mode.kind === "pan" && !mode.moved && store.tool === "select") {
      // click on empty space: select a room if clicked inside one, else clear
      const p = pointer();
      const room = p ? scene.rooms.find((r) => pointInPolygon(p, r.polygon, 0)) : undefined;
      store.select(room ? [room.id] : []);
    }
    if (mode.kind === "marquee") {
      const minX = Math.min(mode.a.x, mode.b.x);
      const maxX = Math.max(mode.a.x, mode.b.x);
      const minY = Math.min(mode.a.y, mode.b.y);
      const maxY = Math.max(mode.a.y, mode.b.y);
      const ids = scene.items.filter((i) => !i.fixed && i.x >= minX && i.x <= maxX && i.y >= minY && i.y <= maxY).map((i) => i.id);
      store.select(ids, false);
    }
    if (mode.kind === "room") {
      const x0 = Math.min(mode.a.x, mode.b.x);
      const x1 = Math.max(mode.a.x, mode.b.x);
      const y0 = Math.min(mode.a.y, mode.b.y);
      const y1 = Math.max(mode.a.y, mode.b.y);
      if (x1 - x0 > 24 && y1 - y0 > 24) {
        const t = 4;
        const h = t / 2;
        const room: Room = {
          id: newId("r"),
          name: `Room ${scene.rooms.length + 1}`,
          type: scene.rooms.length === 0 ? "studio" : "living",
          polygon: [
            { x: x0, y: y0 },
            { x: x1, y: y0 },
            { x: x1, y: y1 },
            { x: x0, y: y1 },
          ],
        };
        const mk = (ax: number, ay: number, bx: number, by: number): Wall => ({ id: newId("w"), a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness: t, height: 108, exterior: false });
        const walls = [mk(x0 - t, y0 - h, x1 + t, y0 - h), mk(x1 + h, y0 - t, x1 + h, y1 + t), mk(x1 + t, y1 + h, x0 - t, y1 + h), mk(x0 - h, y1 + t, x0 - h, y0 - t)];
        store.apply((s) => ({ ...s, rooms: [...s.rooms, room], walls: [...s.walls, ...walls] }));
        store.select([room.id]);
      }
    }
    setMode({ kind: "none" });
  };

  // ───── item drag ─────
  const threshold = 8 / vp.scale;

  const onItemDragStart = (item: Item, e: Konva.KonvaEventObject<DragEvent>) => {
    const store = useEditor.getState();
    if (!store.selection.includes(item.id)) store.select([item.id], e.evt.shiftKey);
    store.checkpoint();
    const sel = useEditor.getState().selection;
    dragStart.current = new Map(scene.items.filter((i) => sel.includes(i.id) || i.id === item.id).map((i) => [i.id, { x: i.x, y: i.y }]));
  };

  const onItemDragMove = (item: Item, e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const store = useEditor.getState();
    const start = dragStart.current.get(item.id);
    if (!start) return;
    const raw = { x: node.x(), y: node.y() };
    const ignore = new Set(dragStart.current.keys());
    const snapped = snapItem(scene, item, raw, { threshold, grid: store.snapToGrid && !e.evt.altKey ? 1 : undefined, ignore, faces });
    const pos = e.evt.altKey ? { ...raw, guides: [] } : snapped;
    node.position({ x: pos.x, y: pos.y });
    setGuides(pos.guides);
    const dx = pos.x - start.x;
    const dy = pos.y - start.y;
    const moving = dragStart.current;
    store.patch((s) => ({
      ...s,
      items: s.items.map((i) => {
        const st = moving.get(i.id);
        if (st) return { ...i, x: st.x + dx, y: st.y + dy };
        // carry things sitting on top (TV on stand, lamp on nightstand)
        return i;
      }),
    }));
  };

  const onItemDragEnd = () => {
    setGuides([]);
    // move items resting on moved hosts
    const store = useEditor.getState();
    const before = dragStart.current;
    store.patch((s) => {
      const moved = s.items.filter((i) => before.has(i.id));
      return {
        ...s,
        items: s.items.map((i) => {
          if (i.elevation <= 0 || before.has(i.id)) return i;
          for (const h of moved) {
            const b = before.get(h.id)!;
            if (Math.hypot(i.x - b.x, i.y - b.y) < Math.max(h.width, h.depth) / 2) return { ...i, x: i.x + (h.x - b.x), y: i.y + (h.y - b.y) };
          }
          return i;
        }),
      };
    });
    dragStart.current = new Map();
  };

  const onTransformEnd = () => {
    const store = useEditor.getState();
    const updates = new Map<string, Partial<Item>>();
    for (const id of store.selection) {
      const node = nodeRefs.current.get(id);
      const it = store.scene.items.find((i) => i.id === id);
      if (!node || !it) continue;
      const sx = node.scaleX();
      const sy = node.scaleY();
      node.scale({ x: 1, y: 1 });
      updates.set(id, {
        x: node.x(),
        y: node.y(),
        rotation: normDeg(Math.round(node.rotation() * 10) / 10),
        width: Math.max(4, Math.round(it.width * sx)),
        depth: Math.max(4, Math.round(it.depth * sy)),
      });
    }
    store.patch((s) => ({ ...s, items: s.items.map((i) => (updates.has(i.id) ? { ...i, ...updates.get(i.id) } : i)) }));
  };

  const onTransform = () => {
    const store = useEditor.getState();
    const updates = new Map<string, Partial<Item>>();
    for (const id of store.selection) {
      const node = nodeRefs.current.get(id);
      if (!node || Math.abs(node.scaleX() - 1) > 1e-3 || Math.abs(node.scaleY() - 1) > 1e-3) continue;
      updates.set(id, { x: node.x(), y: node.y(), rotation: normDeg(node.rotation()) });
    }
    if (updates.size) store.patch((s) => ({ ...s, items: s.items.map((i) => (updates.has(i.id) ? { ...i, ...updates.get(i.id) } : i)) }));
  };

  // ───── catalog drag & drop ─────
  const onDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData("application/x-homer-catalog");
    if (!id) return;
    e.preventDefault();
    const st = stageRef.current;
    if (!st) return;
    st.setPointersPositions(e);
    const p = st.getPointerPosition();
    if (!p) return;
    const q = toScene(p);
    useEditor.getState().addItem(id, { x: Math.round(q.x), y: Math.round(q.y) });
  };

  // ───── render pieces ─────
  const sorted = useMemo(() => {
    const layerRank = (i: Item) => {
      const c = getCatalogItem(i.catalogId);
      if (c?.layer === "rug") return 0;
      if (i.fixed) return 1;
      if (i.elevation > 0) return 3;
      return 2;
    };
    return [...scene.items].sort((a, b) => layerRank(a) - layerRank(b));
  }, [scene.items]);

  const selectedItems = scene.items.filter((i) => ed.selection.includes(i.id));
  const single = selectedItems.length === 1 ? selectedItems[0] : null;
  const singleCat = single ? getCatalogItem(single.catalogId) : null;
  const s = vp.scale;
  const fs = (px: number) => px / s;

  const stageCursor =
    mode.kind === "pan" ? "grabbing" : spaceDown || ed.tool === "pan" ? "grab" : ed.tool === "select" ? "default" : "crosshair";

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 bg-canvas"
      style={{ cursor: stageCursor }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-homer-catalog")) e.preventDefault();
      }}
      onDrop={onDrop}
      data-testid="plan-canvas"
    >
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        scaleX={s}
        scaleY={s}
        x={vp.x}
        y={vp.y}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => setCursor(null)}
      >
        {/* background reference + grid */}
        <Layer listening={false}>
          {showGridShape(ed.showGrid, vp, size)}
          {bgImage && scene.background?.visible !== false && scene.background && (
            <KImage
              image={bgImage}
              x={scene.background.x}
              y={scene.background.y}
              scaleX={scene.background.scale}
              scaleY={scene.background.scale}
              opacity={scene.background.opacity}
            />
          )}
        </Layer>

        {/* rooms + walls + openings */}
        <Layer>
          {scene.rooms.map((r) => (
            <RoomShape key={r.id} room={r} scene={scene} selected={ed.selection.includes(r.id)} s={s} />
          ))}
          {scene.walls.map((w) => (
            <WallShape key={w.id} wall={w} scene={scene} selected={ed.selection.includes(w.id)} onSelect={() => !ed.previewing && useEditor.getState().select([w.id])} />
          ))}
          {scene.openings.map((o) => {
            const w = scene.walls.find((x) => x.id === o.wallId);
            return w ? (
              <OpeningShape key={o.id} wall={w} opening={o} selected={ed.selection.includes(o.id)} onSelect={() => !ed.previewing && useEditor.getState().select([o.id])} />
            ) : null;
          })}
          {scene.rooms.map((r) => (
            <RoomLabel key={`l_${r.id}`} room={r} s={s} />
          ))}
        </Layer>

        {/* clearance zones */}
        <Layer listening={false}>
          {ed.showClearances &&
            issues
              .filter((i) => i.zone && i.severity !== "info")
              .map((i) => {
                const pts = rectCorners(i.zone!).flatMap((p) => [p.x, p.y]);
                return <Line key={i.id} points={pts} closed fill="rgba(183,121,31,0.10)" stroke="#b7791f" strokeWidth={1} dash={[5, 4]} strokeScaleEnabled={false} />;
              })}
        </Layer>

        {/* furniture */}
        <Layer>
          {sorted.map((item) => {
            const c = getCatalogItem(item.catalogId);
            if (!c) return null;
            const sev = issueByItem.get(item.id);
            const selected = ed.selection.includes(item.id);
            const hovered = ed.hoverId === item.id;
            const stroke = sev === "error" ? "#c0392b" : selected ? BRAND : hovered ? "#6b665e" : "#3a3833";
            return (
              <Group
                key={item.id}
                id={item.id}
                ref={(n) => {
                  if (n) nodeRefs.current.set(item.id, n);
                  else nodeRefs.current.delete(item.id);
                }}
                x={item.x}
                y={item.y}
                rotation={item.rotation}
                draggable={!item.locked && !ed.previewing && ed.tool === "select" && !spaceDown}
                onMouseDown={(e) => {
                  if (ed.tool !== "select" || ed.previewing || spaceDown) return;
                  e.cancelBubble = true;
                  const store = useEditor.getState();
                  if (e.evt.shiftKey || e.evt.metaKey) store.select([item.id], true);
                  else if (!store.selection.includes(item.id)) store.select([item.id]);
                }}
                onMouseEnter={() => useEditor.getState().setHover(item.id)}
                onMouseLeave={() => useEditor.getState().setHover(null)}
                onDragStart={(e) => onItemDragStart(item, e)}
                onDragMove={(e) => onItemDragMove(item, e)}
                onDragEnd={onItemDragEnd}
                onTransformStart={() => useEditor.getState().checkpoint()}
                onTransform={onTransform}
                onTransformEnd={onTransformEnd}
              >
                <ItemGlyph kind={c.model} w={item.width} d={item.depth} color={item.color} stroke={stroke} strokeWidth={selected || sev === "error" ? 1.8 : 1.1} />
                {sev === "error" && <Rect x={-item.width / 2 - 2} y={-item.depth / 2 - 2} width={item.width + 4} height={item.depth + 4} stroke="#c0392b" strokeWidth={1} dash={[4, 3]} strokeScaleEnabled={false} listening={false} />}
                {s > 2.2 && !c.fixture && item.width > 20 && c.layer !== "surface" && (
                  <Text
                    text={item.label ?? c.name}
                    fontSize={fs(10.5)}
                    fill="#57534c"
                    width={fs(140)}
                    offsetX={fs(70)}
                    offsetY={fs(5)}
                    align="center"
                    listening={false}
                    rotation={-item.rotation}
                    opacity={0.75}
                  />
                )}
              </Group>
            );
          })}
          <Transformer
            ref={trRef}
            rotateEnabled
            resizeEnabled={!!single && !!singleCat?.resizable && ed.selection.length === 1}
            keepRatio={false}
            ignoreStroke
            flipEnabled={false}
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={7}
            borderStroke={BRAND}
            borderStrokeWidth={1.2}
            anchorStroke={BRAND}
            anchorFill="#ffffff"
            anchorSize={9}
            anchorCornerRadius={5}
            rotateAnchorOffset={22}
            enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"]}
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 4 || newBox.height < 4 ? oldBox : newBox)}
          />
        </Layer>

        {/* overlays */}
        <Layer listening={false}>
          {guides.map((g, i) =>
            g.axis === "x" ? (
              <Line key={i} points={[g.value, g.from, g.value, g.to]} stroke={BRAND} strokeWidth={1} dash={[4, 3]} strokeScaleEnabled={false} />
            ) : (
              <Line key={i} points={[g.from, g.value, g.to, g.value]} stroke={BRAND} strokeWidth={1} dash={[4, 3]} strokeScaleEnabled={false} />
            ),
          )}
          {single && ed.showDims && !ed.previewing && <DimensionOverlay item={single} scene={scene} faces={faces} s={s} />}
          {mode.kind === "marquee" && (
            <Rect
              x={Math.min(mode.a.x, mode.b.x)}
              y={Math.min(mode.a.y, mode.b.y)}
              width={Math.abs(mode.b.x - mode.a.x)}
              height={Math.abs(mode.b.y - mode.a.y)}
              fill="rgba(180,101,74,0.08)"
              stroke={BRAND}
              strokeWidth={1}
              strokeScaleEnabled={false}
            />
          )}
          {mode.kind === "room" && (
            <Group>
              <Rect
                x={Math.min(mode.a.x, mode.b.x)}
                y={Math.min(mode.a.y, mode.b.y)}
                width={Math.abs(mode.b.x - mode.a.x)}
                height={Math.abs(mode.b.y - mode.a.y)}
                fill="rgba(180,101,74,0.06)"
                stroke={BRAND}
                strokeWidth={1.5}
                strokeScaleEnabled={false}
              />
              <Text
                x={Math.min(mode.a.x, mode.b.x)}
                y={Math.min(mode.a.y, mode.b.y) - fs(18)}
                text={`${formatFtIn(Math.abs(mode.b.x - mode.a.x))} × ${formatFtIn(Math.abs(mode.b.y - mode.a.y))}`}
                fontSize={fs(12)}
                fill={BRAND}
              />
            </Group>
          )}
          {ed.tool === "wall" && wallStart && cursor && (
            <MeasureLine a={wallStart} b={snapPoint(cursor, wallStart)} s={s} color={WALL_INK} thick={4} />
          )}
          {ed.tool === "measure" && measure && (measure.b || cursor) && <MeasureLine a={measure.a} b={measure.b ?? snapPoint(cursor!, measure.a)} s={s} color={BRAND} />}
          {(ed.tool === "door" || ed.tool === "window") && cursor && (() => {
            const nw = nearestWall(cursor);
            if (!nw) return null;
            const p = add(nw.wall.a, vscale(wallDir(nw.wall), nw.offset));
            return <Circle x={p.x} y={p.y} radius={fs(6)} fill={BRAND} opacity={0.8} />;
          })()}
        </Layer>
      </Stage>
    </div>
  );
}

function showGridShape(show: boolean, vp: { scale: number; x: number; y: number }, size: { w: number; h: number }) {
  if (!show) return null;
  return (
    <Shape
      sceneFunc={(ctx) => {
        const s = vp.scale;
        const x0 = -vp.x / s;
        const y0 = -vp.y / s;
        const x1 = x0 + size.w / s;
        const y1 = y0 + size.h / s;
        const minor = s > 1.2 ? 12 : s > 0.5 ? 24 : 60;
        const major = minor * 5;
        const c = ctx._context;
        c.save();
        for (const [step, color, lw] of [
          [minor, "rgba(60,55,45,0.06)", 1],
          [major, "rgba(60,55,45,0.11)", 1],
        ] as const) {
          c.beginPath();
          c.strokeStyle = color;
          c.lineWidth = lw / s;
          for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
            c.moveTo(x, y0);
            c.lineTo(x, y1);
          }
          for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
            c.moveTo(x0, y);
            c.lineTo(x1, y);
          }
          c.stroke();
        }
        c.restore();
      }}
    />
  );
}

function RoomShape({ room, scene, selected, s }: { room: Room; scene: Scene; selected: boolean; s: number }) {
  const floor = room.floor ?? scene.style.floor;
  const fill = ROOM_TINT[room.type] ?? FLOOR_TINTS[floor] ?? "#f4ece0";
  void s;
  return (
    <Line
      name="room"
      points={room.polygon.flatMap((p) => [p.x, p.y])}
      closed
      fill={fill}
      stroke={selected ? BRAND : undefined}
      strokeWidth={selected ? 2 : 0}
      dash={[6, 4]}
      strokeScaleEnabled={false}
    />
  );
}

function RoomLabel({ room, s }: { room: Room; s: number }) {
  const c = polygonCentroid(room.polygon);
  const b = polygonBounds(room.polygon);
  const area = polygonArea(room.polygon);
  const rectangular = room.polygon.length === 4;
  const fs = (px: number) => px / s;
  const w = 220 / s;
  return (
    <Group x={c.x - w / 2} y={c.y - fs(14)} listening={false} opacity={0.9}>
      <Text text={room.name.toUpperCase()} width={w} align="center" fontSize={fs(10)} letterSpacing={fs(1.2)} fill="#8a847a" fontStyle="600" />
      <Text
        y={fs(14)}
        text={`${formatSqft(area)}${rectangular ? ` · ${formatFtIn(b.maxX - b.minX)} × ${formatFtIn(b.maxY - b.minY)}` : ""}`}
        width={w}
        align="center"
        fontSize={fs(10)}
        fill="#a39d93"
      />
    </Group>
  );
}

function WallShape({ wall, scene, selected, onSelect }: { wall: Wall; scene: Scene; selected: boolean; onSelect: () => void }) {
  const pieces = wallSolidRects(wall, scene.openings);
  return (
    <Group onMouseDown={(e) => { if (useEditor.getState().tool === "select") { e.cancelBubble = true; onSelect(); } }}>
      {pieces.map((p, i) => (
        <Line
          key={i}
          points={rectCorners(p).flatMap((q) => [q.x, q.y])}
          closed
          fill={selected ? BRAND : WALL_INK}
          stroke={selected ? BRAND : WALL_INK}
          strokeWidth={0.5}
          strokeScaleEnabled={false}
        />
      ))}
    </Group>
  );
}

function OpeningShape({ wall, opening: o, selected, onSelect }: { wall: Wall; opening: Opening; selected: boolean; onSelect: () => void }) {
  const dir = wallDir(wall);
  const n = wallLeftNormal(wall);
  const c = openingCenter(wall, o);
  const half = o.width / 2;
  const t = wall.thickness / 2;
  const s0 = add(c, vscale(dir, -half));
  const s1 = add(c, vscale(dir, half));
  const color = selected ? BRAND : "#3a3833";
  const onDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (useEditor.getState().tool !== "select") return;
    e.cancelBubble = true;
    onSelect();
  };
  if (o.kind === "window") {
    const pts = [add(s0, vscale(n, t)), add(s1, vscale(n, t)), add(s1, vscale(n, -t)), add(s0, vscale(n, -t))];
    return (
      <Group onMouseDown={onDown}>
        <Line points={pts.flatMap((p) => [p.x, p.y])} closed fill="#ffffff" stroke={color} strokeWidth={1} strokeScaleEnabled={false} />
        <Line points={[s0.x, s0.y, s1.x, s1.y]} stroke={color} strokeWidth={1} strokeScaleEnabled={false} />
        <Line points={[add(s0, vscale(n, t * 0.4)).x, add(s0, vscale(n, t * 0.4)).y, add(s1, vscale(n, t * 0.4)).x, add(s1, vscale(n, t * 0.4)).y]} stroke={color} strokeWidth={0.6} strokeScaleEnabled={false} opacity={0.6} />
      </Group>
    );
  }
  if (o.kind === "opening") {
    return (
      <Group onMouseDown={onDown}>
        <Line points={[add(s0, vscale(n, t)).x, add(s0, vscale(n, t)).y, add(s0, vscale(n, -t)).x, add(s0, vscale(n, -t)).y]} stroke={color} strokeWidth={1} strokeScaleEnabled={false} />
        <Line points={[add(s1, vscale(n, t)).x, add(s1, vscale(n, t)).y, add(s1, vscale(n, -t)).x, add(s1, vscale(n, -t)).y]} stroke={color} strokeWidth={1} strokeScaleEnabled={false} />
      </Group>
    );
  }
  // door: hinge at one end, leaf opened 90° into the swing side
  const hinge = o.hinge === "start" ? s0 : s1;
  const closedDir = o.hinge === "start" ? dir : vscale(dir, -1);
  const swingN = o.swing === "left" ? n : vscale(n, -1);
  const hingeFace = add(hinge, vscale(swingN, t));
  const leafEnd = add(hingeFace, vscale(swingN, o.width));
  const a1 = Math.atan2(closedDir.y, closedDir.x);
  const a2 = Math.atan2(swingN.y, swingN.x);
  const diff = normDeg(rad2deg(a2 - a1));
  const start = Math.abs(diff - 90) < 1 ? a1 : a2;
  return (
    <Group onMouseDown={onDown}>
      <Line points={[hingeFace.x, hingeFace.y, leafEnd.x, leafEnd.y]} stroke={color} strokeWidth={1.6} strokeScaleEnabled={false} />
      <Shape
        sceneFunc={(ctx, shape) => {
          ctx.beginPath();
          ctx.arc(hingeFace.x, hingeFace.y, o.width, start, start + deg2rad(90), false);
          ctx.strokeShape(shape);
        }}
        stroke={color}
        strokeWidth={0.8}
        dash={[4, 3]}
        strokeScaleEnabled={false}
        opacity={0.8}
      />
    </Group>
  );
}

function MeasureLine({ a, b, s, color, thick }: { a: Point; b: Point; s: number; color: string; thick?: number }) {
  const len = dist(a, b);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const d = norm(sub(b, a));
  const nrm = { x: -d.y, y: d.x };
  const label = formatFtIn(len);
  return (
    <Group>
      <Line points={[a.x, a.y, b.x, b.y]} stroke={color} strokeWidth={thick ? thick : 1.5} strokeScaleEnabled={!!thick} opacity={thick ? 0.6 : 1} />
      <Circle x={a.x} y={a.y} radius={3 / s} fill={color} />
      <Circle x={b.x} y={b.y} radius={3 / s} fill={color} />
      <Group x={mid.x + nrm.x * (14 / s)} y={mid.y + nrm.y * (14 / s)}>
        <Rect x={-28 / s} y={-9 / s} width={56 / s} height={18 / s} fill="#ffffff" cornerRadius={4 / s} stroke={color} strokeWidth={1} strokeScaleEnabled={false} />
        <Text x={-28 / s} y={-6 / s} width={56 / s} align="center" text={label} fontSize={11 / s} fill={color} />
      </Group>
    </Group>
  );
}

function DimensionOverlay({ item, scene, faces, s }: { item: Item; scene: Scene; faces: ReturnType<typeof wallFaces>; s: number }) {
  const rays = clearanceRays(scene, item, faces);
  const fs = (px: number) => px / s;
  const top = rectCorners({ cx: item.x, cy: item.y, w: item.width, d: item.depth, rot: item.rotation });
  const minY = Math.min(...top.map((p) => p.y));
  return (
    <Group>
      {rays.map((r) => {
        if (r.length < 0.5) return null;
        const mid = { x: (r.from.x + r.to.x) / 2, y: (r.from.y + r.to.y) / 2 };
        const label = formatFtIn(r.length);
        return (
          <Group key={r.side}>
            <Line points={[r.from.x, r.from.y, r.to.x, r.to.y]} stroke="#4b6584" strokeWidth={1} dash={[3, 3]} strokeScaleEnabled={false} />
            <Circle x={r.to.x} y={r.to.y} radius={fs(2.5)} fill="#4b6584" />
            <Group x={mid.x} y={mid.y}>
              <Rect x={fs(-22)} y={fs(-8)} width={fs(44)} height={fs(16)} fill="#4b6584" cornerRadius={fs(8)} />
              <Text x={fs(-22)} y={fs(-5)} width={fs(44)} align="center" text={label} fontSize={fs(10)} fill="#ffffff" />
            </Group>
          </Group>
        );
      })}
      <Group x={item.x} y={minY - fs(20)}>
        <Rect x={fs(-40)} y={fs(-9)} width={fs(80)} height={fs(18)} fill={BRAND} cornerRadius={fs(9)} />
        <Text x={fs(-40)} y={fs(-5.5)} width={fs(80)} align="center" text={`${Math.round(item.width)}" × ${Math.round(item.depth)}"`} fontSize={fs(10.5)} fill="#ffffff" />
      </Group>
    </Group>
  );
}
