"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, Lightformer, Line, OrbitControls, OrthographicCamera, PerspectiveCamera, PointerLockControls } from "@react-three/drei";
import { useShallow } from "zustand/react/shallow";
import { getCatalogItem } from "@/lib/catalog/items";
import { dist, norm, polygonBounds, polygonCentroid, rectCorners, sub } from "@/lib/scene/geometry";
import { snapItem, wallFaces } from "@/lib/scene/snapping";
import type { Item, Opening, Scene, Wall } from "@/lib/scene/types";
import { validateScene } from "@/lib/scene/validate";
import { useDisplayScene, useEditor } from "@/store/editor";
import { useViewport } from "@/store/viewport";
import { Furniture3D } from "./Furniture3D";
import { ProductModel } from "./ProductModel";
import { floorTexture } from "./textures";

const LIGHTING = {
  day: { hemi: 1.15, sky: "#ffffff", ground: "#d9cbb5", sun: 2.4, sunColor: "#fff4e6", sunPos: [-0.4, 1, -0.6], bg: "#f3f0ea", env: 0.55 },
  golden: { hemi: 0.75, sky: "#ffe9d0", ground: "#b8977a", sun: 2.8, sunColor: "#ffbb7a", sunPos: [-1, 0.45, -0.3], bg: "#efe2d4", env: 0.4 },
  evening: { hemi: 0.22, sky: "#7d8db0", ground: "#30281f", sun: 0.25, sunColor: "#9fb2d8", sunPos: [0.5, 1, 0.4], bg: "#2a2c33", env: 0.12 },
} as const;

function sceneExtent(scene: Scene) {
  const pts = [...scene.walls.flatMap((w) => [w.a, w.b]), ...scene.rooms.flatMap((r) => r.polygon)];
  if (!pts.length) return { cx: 120, cz: 120, size: 300 };
  const b = polygonBounds(pts);
  return { cx: (b.minX + b.maxX) / 2, cz: (b.minY + b.maxY) / 2, size: Math.max(b.maxX - b.minX, b.maxY - b.minY), b };
}

// ───────────────────────── walls ─────────────────────────

function WallMesh({ wall, openings, color, height }: { wall: Wall; openings: Opening[]; color: string; height: number }) {
  const L = dist(wall.a, wall.b);
  const dir = norm(sub(wall.b, wall.a));
  const angle = -Math.atan2(dir.y, dir.x);
  const segs: { from: number; to: number; y0: number; y1: number }[] = [];
  const ops = openings.filter((o) => o.wallId === wall.id).sort((a, b) => a.offset - b.offset);
  let cursor = 0;
  for (const o of ops) {
    const s = Math.max(0, o.offset - o.width / 2);
    const e = Math.min(L, o.offset + o.width / 2);
    if (s > cursor) segs.push({ from: cursor, to: s, y0: 0, y1: height });
    const top = o.kind === "window" ? o.sill + o.height : o.height;
    if (o.kind === "window" && o.sill > 0) segs.push({ from: s, to: e, y0: 0, y1: Math.min(o.sill, height) });
    if (top < height) segs.push({ from: s, to: e, y0: top, y1: height });
    cursor = Math.max(cursor, e);
  }
  if (cursor < L) segs.push({ from: cursor, to: L, y0: 0, y1: height });
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.92 }), [color]);
  return (
    <group position={[wall.a.x, 0, wall.a.y]} rotation={[0, angle, 0]}>
      {segs
        .filter((s) => s.to - s.from > 0.2 && s.y1 - s.y0 > 0.2)
        .map((s, i) => (
          <mesh key={i} position={[(s.from + s.to) / 2, (s.y0 + s.y1) / 2, 0]} castShadow receiveShadow material={mat}>
            <boxGeometry args={[s.to - s.from, s.y1 - s.y0, wall.thickness]} />
          </mesh>
        ))}
      {ops
        .filter((o) => o.kind === "window" && o.sill < height)
        .map((o) => {
          const top = Math.min(o.sill + o.height, height);
          return (
            <group key={o.id} position={[o.offset, (o.sill + top) / 2, 0]}>
              <mesh>
                <boxGeometry args={[o.width, top - o.sill, 0.4]} />
                <meshStandardMaterial color="#cfe3ea" transparent opacity={0.28} roughness={0.05} metalness={0.2} />
              </mesh>
              <mesh>
                <boxGeometry args={[o.width, 1.2, wall.thickness + 0.4]} />
                <meshStandardMaterial color="#f6f4f0" />
              </mesh>
              <mesh position={[0, -(top - o.sill) / 2, 1]}>
                <boxGeometry args={[o.width + 2, 1, wall.thickness + 2]} />
                <meshStandardMaterial color="#f6f4f0" />
              </mesh>
            </group>
          );
        })}
    </group>
  );
}

// ───────────────────────── floors ─────────────────────────

function Floors({ scene }: { scene: Scene }) {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {scene.rooms.map((r) => {
        const shape = new THREE.Shape(r.polygon.map((p) => new THREE.Vector2(p.x, p.y)));
        const mat = r.type === "bathroom" ? "tile-white" : r.floor ?? scene.style.floor;
        return (
          <mesh key={r.id} receiveShadow position={[0, 0, 0]}>
            <shapeGeometry args={[shape]} />
            <meshStandardMaterial map={floorTexture(mat)} roughness={mat.startsWith("tile") ? 0.35 : 0.72} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
}

// ───────────────────────── furniture ─────────────────────────

function ItemObject({
  item,
  selected,
  error,
  evening,
  interactive,
  onPointerDown,
}: {
  item: Item;
  selected: boolean;
  error: boolean;
  evening: boolean;
  interactive: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>, item: Item) => void;
}) {
  const c = getCatalogItem(item.catalogId);
  if (!c) return null;
  const corners = rectCorners({ cx: 0, cy: 0, w: item.width + 3, d: item.depth + 3, rot: 0 });
  return (
    <group
      position={[item.x, item.elevation, item.y]}
      rotation={[0, (-item.rotation * Math.PI) / 180, 0]}
      onPointerDown={interactive ? (e) => onPointerDown(e, item) : undefined}
      onPointerOver={interactive ? (e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={interactive ? () => { document.body.style.cursor = ""; } : undefined}
    >
      {c.modelUrl ? (
        <ProductModel url={c.modelUrl} w={item.width} d={item.depth} h={item.height} fallback={<Furniture3D kind={c.model} w={item.width} d={item.depth} h={item.height} color={item.color ?? c.colors[0]?.hex ?? "#cccccc"} evening={evening} />} />
      ) : (
        <Furniture3D kind={c.model} w={item.width} d={item.depth} h={item.height} color={item.color ?? c.colors[0]?.hex ?? "#cccccc"} evening={evening} />
      )}
      {(selected || error) && (
        <Line
          points={[...corners, corners[0]].map((p) => [p.x, 0.8, p.y] as [number, number, number])}
          color={error ? "#c0392b" : "#b4654a"}
          lineWidth={2.5}
          dashed={error}
          dashSize={4}
          gapSize={3}
        />
      )}
    </group>
  );
}

// ───────────────────────── cameras ─────────────────────────

function WalkControls({ start, bounds }: { start: THREE.Vector3; bounds?: { minX: number; maxX: number; minY: number; maxY: number } }) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    camera.position.copy(start);
    camera.lookAt(start.x + 1, start.y, start.z);
    const down = (e: KeyboardEvent) => (keys.current[e.code] = true);
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [camera, start]);
  useFrame((_, dt) => {
    const k = keys.current;
    const speed = (k.ShiftLeft ? 110 : 55) * dt;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    if (k.KeyW || k.ArrowUp) camera.position.addScaledVector(fwd, speed);
    if (k.KeyS || k.ArrowDown) camera.position.addScaledVector(fwd, -speed);
    if (k.KeyA || k.ArrowLeft) camera.position.addScaledVector(right, -speed);
    if (k.KeyD || k.ArrowRight) camera.position.addScaledVector(right, speed);
    if (bounds) {
      camera.position.x = Math.max(bounds.minX + 6, Math.min(bounds.maxX - 6, camera.position.x));
      camera.position.z = Math.max(bounds.minY + 6, Math.min(bounds.maxY - 6, camera.position.z));
    }
    camera.position.y = 64;
  });
  return <PointerLockControls />;
}

function CaptureBinder() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    useViewport.getState().setCapture3d(() => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL("image/jpeg", 0.88);
    });
    return () => useViewport.getState().setCapture3d(null);
  }, [gl, scene, camera]);
  return null;
}

// ───────────────────────── main ─────────────────────────

function World() {
  const scene = useDisplayScene();
  const ed = useEditor(
    useShallow((s) => ({ view: s.view, selection: s.selection, wallsVisible: s.wallsVisible, previewing: !!s.preview, snapToGrid: s.snapToGrid })),
  );
  const ext = useMemo(() => sceneExtent(scene), [scene]);
  const issues = useMemo(() => validateScene(scene), [scene]);
  const errorIds = useMemo(() => new Set(issues.filter((i) => i.severity === "error").map((i) => i.itemId)), [issues]);
  const faces = useMemo(() => wallFaces(scene), [scene]);
  const L = LIGHTING[scene.style.lighting];
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const [dragging, setDragging] = useState<{ id: string; offset: THREE.Vector2 } | null>(null);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const evening = scene.style.lighting === "evening";
  const wallMode = ed.view === "walk" ? "full" : ed.view === "top" ? "cutaway" : ed.wallsVisible;
  const wallHeight = wallMode === "full" ? 108 : wallMode === "cutaway" ? 30 : 3;
  const interactive = !ed.previewing && ed.view !== "walk";

  const onItemDown = (e: ThreeEvent<PointerEvent>, item: Item) => {
    e.stopPropagation();
    const store = useEditor.getState();
    if (e.shiftKey) {
      store.select([item.id], true);
      return;
    }
    store.select([item.id]);
    if (item.locked) return;
    e.ray.intersectPlane(plane, hit);
    store.checkpoint();
    setDragging({ id: item.id, offset: new THREE.Vector2(item.x - hit.x, item.y - hit.z) });
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    e.stopPropagation();
    if (!e.ray.intersectPlane(plane, hit)) return;
    const store = useEditor.getState();
    const item = store.scene.items.find((i) => i.id === dragging.id);
    if (!item) return;
    const raw = { x: hit.x + dragging.offset.x, y: hit.z + dragging.offset.y };
    const snapped = snapItem(store.scene, item, raw, { threshold: 6, grid: store.snapToGrid ? 1 : undefined, faces });
    const dx = snapped.x - item.x;
    const dy = snapped.y - item.y;
    store.patch((s) => ({
      ...s,
      items: s.items.map((i) => {
        if (i.id === item.id) return { ...i, x: snapped.x, y: snapped.y };
        if (i.elevation > 0 && Math.hypot(i.x - item.x, i.y - item.y) < Math.max(item.width, item.depth) / 2) return { ...i, x: i.x + dx, y: i.y + dy };
        return i;
      }),
    }));
  };

  const endDrag = () => setDragging(null);

  const sunDir = new THREE.Vector3(...L.sunPos).normalize();
  const sunPos = new THREE.Vector3(ext.cx, 0, ext.cz).add(sunDir.multiplyScalar(ext.size * 1.4));
  const half = ext.size * 0.9;

  const walkStart = useMemo(() => {
    const room = [...scene.rooms].sort((a, b) => polygonBounds(b.polygon).maxX - polygonBounds(b.polygon).minX - (polygonBounds(a.polygon).maxX - polygonBounds(a.polygon).minX))[0];
    const c = room ? polygonCentroid(room.polygon) : { x: ext.cx, y: ext.cz };
    return new THREE.Vector3(c.x, 64, c.y);
  }, [scene.rooms, ext.cx, ext.cz]);

  return (
    <>
      <color attach="background" args={[L.bg]} />
      <hemisphereLight args={[L.sky, L.ground, L.hemi]} />
      <directionalLight
        position={sunPos}
        intensity={L.sun}
        color={L.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.6}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={1}
        shadow-camera-far={ext.size * 4}
      >
        <object3D attach="target" position={[ext.cx, 0, ext.cz]} />
      </directionalLight>
      <Environment resolution={128} environmentIntensity={L.env}>
        <Lightformer form="rect" intensity={2} position={[0, 5, -5]} scale={[10, 5, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={1} position={[-5, 2, 5]} scale={[10, 3, 1]} color="#ffeedd" />
        <Lightformer form="circle" intensity={1.5} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={6} />
      </Environment>

      {ed.view === "top" ? (
        <OrthographicCamera makeDefault position={[ext.cx, 1200, ext.cz + 0.01]} zoom={Math.max(0.5, 700 / ext.size)} near={1} far={5000} up={[0, 0, -1]} />
      ) : ed.view === "walk" ? (
        <PerspectiveCamera makeDefault fov={70} near={2} far={6000} position={walkStart.toArray()} />
      ) : (
        <PerspectiveCamera makeDefault fov={40} near={4} far={8000} position={[ext.cx - ext.size * 0.55, ext.size * 0.95, ext.cz + ext.size * 1.05]} />
      )}
      {ed.view === "walk" ? (
        <WalkControls start={walkStart} bounds={"b" in ext ? ext.b : undefined} />
      ) : (
        <OrbitControls
          ref={controls}
          makeDefault
          target={[ext.cx, 0, ext.cz]}
          enabled={!dragging}
          enableRotate={ed.view !== "top"}
          maxPolarAngle={Math.PI / 2.05}
          minDistance={40}
          maxDistance={ext.size * 4}
          enableDamping
          dampingFactor={0.12}
        />
      )}
      <CaptureBinder />

      {/* ground + interaction plane */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[ext.cx, -0.2, ext.cz]}
        receiveShadow
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerMissed={() => !dragging && interactive && useEditor.getState().select([])}
        onPointerDown={(e) => {
          if (!dragging && interactive && e.button === 0) {
            // clicking the floor clears the selection (orbit still works)
            useEditor.getState().select([]);
          }
        }}
      >
        <planeGeometry args={[ext.size * 6, ext.size * 6]} />
        <meshStandardMaterial color={evening ? "#33302b" : "#e9e5dd"} roughness={1} />
      </mesh>

      <Floors scene={scene} />
      {scene.walls.map((w) => (
        <WallMesh key={w.id} wall={w} openings={scene.openings} color={scene.style.wallColor} height={wallHeight} />
      ))}
      {scene.items.map((it) => (
        <ItemObject
          key={it.id}
          item={it}
          selected={ed.selection.includes(it.id)}
          error={errorIds.has(it.id)}
          evening={evening}
          interactive={interactive}
          onPointerDown={onItemDown}
        />
      ))}
      {dragging && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ext.cx, 1, ext.cz]} onPointerMove={onMove} onPointerUp={endDrag}>
          <planeGeometry args={[ext.size * 6, ext.size * 6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}

export default function Scene3D() {
  const view = useEditor((s) => s.view);
  return (
    <div className="absolute inset-0" data-testid="scene-3d">
      <Canvas
        key={view === "top" ? "top" : view === "walk" ? "walk" : "persp"}
        shadows="soft"
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      >
        <World />
      </Canvas>
      {view === "walk" && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-xs text-white backdrop-blur">
          Click to look around · W A S D to walk · Shift to walk faster · Esc to release
        </div>
      )}
    </div>
  );
}
