"use client";

import { createContext, memo, useContext, useMemo } from "react";
import { RoundedBox } from "@react-three/drei";
import type { ModelKind } from "@/lib/catalog/types";
import { isFabric, type Appearance, type MaterialKind } from "@/lib/catalog/appearance";
import { Surface, rugTexture } from "./materials";

/**
 * Procedural furniture, built in inches. Local frame: x = width, y = up,
 * z = depth with the front of the piece facing +z (plan +y).
 *
 * A product's Appearance (from its photo or description) switches materials,
 * legs, arms, backs, tufting and patterns, so retailer products read as the
 * actual piece. Built-in samples use the defaults below.
 */

const LEG = "#3b2c22";
const METAL = "#2a2a2a";
const WHITE = "#f4f2ee";

type Mat = "fabric" | "wood" | "metal" | "ceramic" | "stone" | "plastic" | "glass" | "leg";

interface Look {
  fabric: MaterialKind;
  body: MaterialKind;
  frame: MaterialKind;
  legStyle: Appearance["legStyle"] | "default";
  legColor: string | null;
  arm: NonNullable<Appearance["armStyle"]>;
  back: NonNullable<Appearance["backStyle"]> | null;
  cushions: number | null;
  tufting: Appearance["tufting"];
  silhouette: Appearance["silhouette"];
  pattern: Appearance["pattern"];
  upholstered: boolean;
  secondary: string | null;
  finish: Appearance["finish"];
}

const DEFAULT_LOOK: Look = {
  fabric: "cotton",
  body: "wood",
  frame: "wood",
  legStyle: "default",
  legColor: null,
  arm: "track",
  back: null,
  cushions: null,
  tufting: "none",
  silhouette: "boxy",
  pattern: "solid",
  upholstered: false,
  secondary: null,
  finish: "matte",
};

const LookCtx = createContext<Look>(DEFAULT_LOOK);

function lookFrom(a: Appearance | undefined): Look {
  if (!a) return DEFAULT_LOOK;
  const fabric = isFabric(a.material) ? a.material : a.material === "rattan" ? "rattan" : "cotton";
  return {
    fabric,
    body: isFabric(a.material) ? (a.frameMaterial && !isFabric(a.frameMaterial) ? a.frameMaterial : "wood") : a.material,
    frame: a.frameMaterial && !isFabric(a.frameMaterial) ? a.frameMaterial : "wood",
    legStyle: a.legStyle,
    legColor: a.legColor,
    arm: a.armStyle ?? "track",
    back: a.backStyle,
    cushions: a.seatCushions,
    tufting: a.tufting,
    silhouette: a.silhouette,
    pattern: a.pattern,
    upholstered: isFabric(a.material),
    secondary: a.secondaryColor,
    finish: a.finish,
  };
}

function resolve(mat: Mat, look: Look): MaterialKind {
  switch (mat) {
    case "fabric":
      return look.fabric;
    case "wood":
      return look.body;
    case "leg":
      return look.frame;
    case "stone":
      return "marble";
    default:
      return mat;
  }
}

function M({ color, mat = "wood", emissive, opacity }: { color: string; mat?: Mat; emissive?: string; opacity?: number }) {
  const look = useContext(LookCtx);
  return <Surface kind={resolve(mat, look)} color={color} finish={mat === "wood" || mat === "fabric" ? look.finish : undefined} emissive={emissive} opacity={opacity} />;
}

/** Box positioned by its center. */
function B({ w, h, d, x = 0, y = 0, z = 0, color, mat, r, rx = 0, rz = 0 }: { w: number; h: number; d: number; x?: number; y?: number; z?: number; color: string; mat?: Mat; r?: number; rx?: number; rz?: number }) {
  const look = useContext(LookCtx);
  const radius = r && look.silhouette === "rounded" && mat === "fabric" ? r * 1.8 : r;
  if (radius) {
    return (
      <RoundedBox args={[w, h, d]} radius={Math.min(radius, w / 2, h / 2, d / 2) * 0.999} smoothness={3} position={[x, y, z]} rotation={[rx, 0, rz]} castShadow receiveShadow>
        <M color={color} mat={mat} />
      </RoundedBox>
    );
  }
  return (
    <mesh position={[x, y, z]} rotation={[rx, 0, rz]} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <M color={color} mat={mat} />
    </mesh>
  );
}

function Cyl({ rt, rb, h, x = 0, y = 0, z = 0, color, mat, seg = 28, rx = 0, rz = 0 }: { rt: number; rb?: number; h: number; x?: number; y?: number; z?: number; color: string; mat?: Mat; seg?: number; rx?: number; rz?: number }) {
  return (
    <mesh position={[x, y, z]} rotation={[rx, 0, rz]} castShadow receiveShadow>
      <cylinderGeometry args={[rt, rb ?? rt, h, seg]} />
      <M color={color} mat={mat} />
    </mesh>
  );
}

/** Four legs (or a base) in the product's leg style. */
function Legs({ w, d, h, inset = 2, r = 0.8, color, round = true }: { w: number; d: number; h: number; inset?: number; r?: number; color?: string; round?: boolean }) {
  const look = useContext(LookCtx);
  const c = look.legColor ?? color ?? LEG;
  const style = look.legStyle === "default" ? (round ? "tapered" : "block") : look.legStyle;
  const pts = [
    [-w / 2 + inset, -d / 2 + inset],
    [w / 2 - inset, -d / 2 + inset],
    [-w / 2 + inset, d / 2 - inset],
    [w / 2 - inset, d / 2 - inset],
  ];
  if (h <= 0.2 || style === "none") return null;
  switch (style) {
    case "plinth":
      return <B w={w - inset * 2} h={h} d={d - inset * 2} y={h / 2} color={c} mat="leg" />;
    case "sled":
      return (
        <>
          {[-1, 1].map((sx) => (
            <group key={sx}>
              <B w={0.8} h={0.8} d={d - inset * 2} x={sx * (w / 2 - inset)} y={0.4} color={c} mat="leg" />
              <B w={0.8} h={h} d={0.8} x={sx * (w / 2 - inset)} y={h / 2} z={-d / 2 + inset} color={c} mat="leg" />
              <B w={0.8} h={h} d={0.8} x={sx * (w / 2 - inset)} y={h / 2} z={d / 2 - inset} color={c} mat="leg" />
            </group>
          ))}
        </>
      );
    case "pedestal":
      return (
        <>
          <Cyl rt={Math.min(w, d) * 0.08} rb={Math.min(w, d) * 0.12} h={h} y={h / 2} color={c} mat="leg" />
          <Cyl rt={Math.min(w, d) * 0.28} h={1} y={0.5} color={c} mat="leg" />
        </>
      );
    case "x-base":
      return (
        <>
          {[-1, 1].map((sx) => (
            <group key={sx} position={[sx * (w / 2 - inset - 2), 0, 0]}>
              <B w={1.2} h={Math.hypot(h, d * 0.8)} d={1.6} y={h / 2} color={c} mat="leg" rx={Math.atan2(d * 0.8, h)} />
              <B w={1.2} h={Math.hypot(h, d * 0.8)} d={1.6} y={h / 2} color={c} mat="leg" rx={-Math.atan2(d * 0.8, h)} />
            </group>
          ))}
          <B w={w - inset * 2 - 4} h={1.2} d={1.2} y={h * 0.5} color={c} mat="leg" />
        </>
      );
    case "caster":
      return (
        <>
          {pts.map(([x, z], i) => (
            <mesh key={i} position={[x, Math.min(h, 2) / 2, z]}>
              <sphereGeometry args={[Math.min(h, 2) / 2, 10, 8]} />
              <M color="#222222" mat="plastic" />
            </mesh>
          ))}
        </>
      );
    case "hairpin":
      return (
        <>
          {pts.map(([x, z], i) => (
            <group key={i} position={[x, 0, z]}>
              <Cyl rt={0.22} h={h} x={-0.8} y={h / 2} color={c} mat="leg" seg={6} rz={0.12} />
              <Cyl rt={0.22} h={h} x={0.8} y={h / 2} color={c} mat="leg" seg={6} rz={-0.12} />
            </group>
          ))}
        </>
      );
    default: {
      const rr = style === "slim-metal" ? 0.35 : style === "block" ? r * 1.4 : r;
      return (
        <>
          {pts.map(([x, z], i) =>
            style === "block" ? (
              <B key={i} w={rr * 2} h={h} d={rr * 2} x={x} y={h / 2} z={z} color={c} mat="leg" />
            ) : style === "turned" ? (
              <group key={i}>
                <Cyl rt={rr * 0.8} rb={rr * 0.6} h={h} x={x} y={h / 2} z={z} color={c} mat="leg" seg={12} />
                <mesh position={[x, h * 0.55, z]}>
                  <sphereGeometry args={[rr * 1.15, 12, 8]} />
                  <M color={c} mat="leg" />
                </mesh>
              </group>
            ) : (
              <Cyl key={i} rt={rr} rb={style === "tapered" ? rr * 0.55 : rr} h={h} x={x} y={h / 2} z={z} color={c} mat="leg" seg={10} />
            ),
          )}
        </>
      );
    }
  }
}

/** Button tufting or channel grooves on a flat upholstered face (front faces +z). */
function Tufting({ w, h, x = 0, y, z }: { w: number; h: number; x?: number; y: number; z: number }) {
  const look = useContext(LookCtx);
  if (look.tufting === "button") {
    const cols = Math.max(2, Math.round(w / 9));
    const rows = Math.max(1, Math.round(h / 8));
    const out: React.ReactNode[] = [];
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++)
        out.push(
          <mesh key={`${i}-${j}`} position={[x - w / 2 + (w / cols) * (i + 0.5) + (j % 2 ? w / cols / 2 : 0) * 0, y - h / 2 + (h / rows) * (j + 0.5), z]}>
            <sphereGeometry args={[0.55, 8, 6]} />
            <meshStandardMaterial color="#000000" transparent opacity={0.35} />
          </mesh>,
        );
    return <>{out}</>;
  }
  if (look.tufting === "channel") {
    const n = Math.max(3, Math.round(w / 7));
    return (
      <>
        {Array.from({ length: n - 1 }).map((_, i) => (
          <mesh key={i} position={[x - w / 2 + (w / n) * (i + 1), y, z]}>
            <boxGeometry args={[0.35, h * 0.92, 0.3]} />
            <meshStandardMaterial color="#000000" transparent opacity={0.3} />
          </mesh>
        ))}
      </>
    );
  }
  return null;
}

function Rug({ w, d, color, round }: { w: number; d: number; color: string; round: boolean }) {
  const look = useContext(LookCtx);
  const map = useMemo(() => rugTexture(look.pattern, color, look.secondary), [look.pattern, look.secondary, color]);
  const mat = map ? <meshStandardMaterial map={map} roughness={1} /> : <M color={color} mat="fabric" />;
  return round ? (
    <mesh position={[0, 0.25, 0]} receiveShadow>
      <cylinderGeometry args={[w / 2, w / 2, 0.5, 48]} />
      {mat}
    </mesh>
  ) : (
    <mesh position={[0, 0.25, 0]} receiveShadow>
      <boxGeometry args={[w, 0.5, d]} />
      {mat}
    </mesh>
  );
}

/** Wrap a piece so its parts pick up the product's look. */
export function LookProvider({ appearance, children }: { appearance?: Appearance; children: React.ReactNode }) {
  const look = useMemo(() => lookFrom(appearance), [appearance]);
  return <LookCtx.Provider value={look}>{children}</LookCtx.Provider>;
}

interface Props {
  kind: ModelKind;
  w: number;
  d: number;
  h: number;
  color: string;
  material?: string;
  evening?: boolean;
}

function SofaArm({ x, w, h, d, y0, color, side }: { x: number; w: number; h: number; d: number; y0: number; color: string; side: -1 | 1 }) {
  const look = useContext(LookCtx);
  switch (look.arm) {
    case "none":
      return null;
    case "rolled":
      return (
        <group>
          <B w={w * 0.8} h={h - w * 0.5} d={d} x={x - side * w * 0.1} y={y0 + (h - w * 0.5) / 2} color={color} mat="fabric" r={1.5} />
          <Cyl rt={w * 0.55} h={d} x={x} y={y0 + h - w * 0.55} color={color} mat="fabric" rx={Math.PI / 2} />
        </group>
      );
    case "slope":
      return (
        <group>
          <B w={w} h={h * 0.75} d={d} x={x} y={y0 + (h * 0.75) / 2} color={color} mat="fabric" r={2} />
          <B w={w} h={h * 0.3} d={d * 0.55} x={x} y={y0 + h * 0.75 + h * 0.1} z={-d * 0.22} color={color} mat="fabric" r={2} />
        </group>
      );
    case "flared":
      return <B w={w} h={h} d={d} x={x + side * 0.8} y={y0 + h / 2} color={color} mat="fabric" r={2.4} rz={side * 0.09} />;
    case "rounded":
      return <B w={w * 1.15} h={h} d={d} x={x} y={y0 + h / 2} color={color} mat="fabric" r={Math.min(w, h) * 0.5} />;
    default:
      return <B w={w} h={h} d={d} x={x} y={y0 + h / 2} color={color} mat="fabric" r={2.4} />;
  }
}

function SofaBack({ w, h, d, y0, z, color }: { w: number; h: number; d: number; y0: number; z: number; color: string }) {
  const look = useContext(LookCtx);
  const back = look.back ?? "tight";
  const bh = back === "low" ? h * 0.7 : back === "high" || back === "wingback" ? h * 1.15 : h;
  if (back === "loose-cushions") {
    const n = look.cushions ?? (w > 70 ? 3 : 2);
    const cw = w / n;
    return (
      <group>
        <B w={w} h={bh * 0.55} d={d * 0.55} y={y0 + (bh * 0.55) / 2} z={z - d * 0.22} color={color} mat="fabric" r={1.5} />
        {Array.from({ length: n }).map((_, i) => (
          <B key={i} w={cw - 0.8} h={bh * 0.92} d={d * 0.75} x={-w / 2 + cw * (i + 0.5)} y={y0 + bh * 0.46} z={z + d * 0.1} color={color} mat="fabric" r={3} rx={-0.12} />
        ))}
      </group>
    );
  }
  return (
    <group>
      <B w={w} h={bh} d={d} y={y0 + bh / 2} z={z} color={color} mat="fabric" r={2.5} />
      <Tufting w={w * 0.9} h={bh * 0.8} y={y0 + bh / 2} z={z + d / 2 + 0.05} />
      {back === "wingback" && (
        <>
          <B w={3} h={bh * 0.6} d={d * 2.2} x={-w / 2 + 1.5} y={y0 + bh * 0.68} z={z + d * 0.8} color={color} mat="fabric" r={1.4} />
          <B w={3} h={bh * 0.6} d={d * 2.2} x={w / 2 - 1.5} y={y0 + bh * 0.68} z={z + d * 0.8} color={color} mat="fabric" r={1.4} />
        </>
      )}
    </group>
  );
}

function SofaBody({ w, d, h, color, seats }: { w: number; d: number; h: number; color: string; seats: number }) {
  const look = useContext(LookCtx);
  const legH = look.legStyle === "plinth" ? 3 : look.legStyle === "none" ? 0 : 5;
  const baseH = look.legStyle === "none" ? 13 : 10;
  const arm = look.arm === "none" ? 0 : Math.min(look.arm === "rolled" ? 8 : 7, w * 0.12);
  const backD = Math.min(9, d * 0.27);
  const n = look.cushions ?? seats;
  const seatW = (w - arm * 2) / Math.max(1, n);
  const armH = h * 0.72 - legH;
  return (
    <group>
      <Legs w={w - 2} d={d - 2} h={legH} inset={3} r={0.9} />
      <B w={w} h={baseH} d={d} y={legH + baseH / 2} color={color} mat="fabric" r={1.5} />
      {n === 0 ? (
        <B w={w - arm * 2 - 0.6} h={4} d={d - backD - 1} y={legH + baseH + 2} z={backD / 2} color={color} mat="fabric" r={2} />
      ) : (
        Array.from({ length: n }).map((_, i) => (
          <B key={i} w={seatW - 0.6} h={5} d={d - backD - 1} x={-w / 2 + arm + seatW * (i + 0.5)} y={legH + baseH + 2.5} z={backD / 2} color={color} mat="fabric" r={2.2} />
        ))
      )}
      <SofaBack w={w - arm * 2} h={h - legH - baseH} d={backD} y0={legH + baseH} z={-d / 2 + backD / 2} color={color} />
      <SofaArm x={-w / 2 + arm / 2} w={arm} h={armH} d={d} y0={legH} color={color} side={-1} />
      <SofaArm x={w / 2 - arm / 2} w={arm} h={armH} d={d} y0={legH} color={color} side={1} />
    </group>
  );
}

function Drawers({ w, h, d, y0, rows, cols, color }: { w: number; h: number; d: number; y0: number; rows: number; cols: number; color: string }) {
  const out: React.ReactNode[] = [];
  const gap = 0.5;
  const dw = (w - 2) / cols;
  const dh = (h - 2) / rows;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      out.push(<B key={`${r}-${c}`} w={dw - gap} h={dh - gap} d={0.6} x={-w / 2 + 1 + dw * (c + 0.5)} y={y0 + 1 + dh * (r + 0.5)} z={d / 2 + 0.3} color={color} />);
      out.push(<B key={`k${r}-${c}`} w={Math.min(5, dw * 0.3)} h={0.6} d={0.8} x={-w / 2 + 1 + dw * (c + 0.5)} y={y0 + 1 + dh * (r + 0.5)} z={d / 2 + 0.9} color={METAL} mat="metal" />);
    }
  return <>{out}</>;
}

export const Furniture3D = memo(function Furniture3D({ kind, w, d, h, color, evening }: Props) {
  const look = useContext(LookCtx);
  switch (kind) {
    case "bed": {
      const legH = look.legStyle === "default" || look.legStyle === "plinth" || look.legStyle === "none" ? 0 : 6;
      const baseH = 12 - legH * 0.5;
      const mattressH = 9;
      const top = legH + baseH;
      const headH = Math.max(h, 30);
      const frameMat: Mat = look.upholstered ? "fabric" : "wood";
      const back = look.back;
      return (
        <group>
          <Legs w={w - 2} d={d - 2} h={legH} inset={3} r={1.1} />
          <B w={w} h={baseH} d={d} y={legH + baseH / 2} color={color} mat={frameMat} r={look.upholstered ? 2 : 1} />
          <B w={w - 3} h={mattressH} d={d - 6} y={top + mattressH / 2} z={1.5} color="#fbfaf7" mat="fabric" r={3} />
          <B w={w - 2} h={2.2} d={d * 0.62} y={top + mattressH + 0.6} z={d * 0.19} color="#ece6dc" mat="fabric" r={1} />
          <B w={w - 1} h={3} d={14} y={top + mattressH + 1} z={d * 0.19 - d * 0.31 + 7} color="#e3dbcf" mat="fabric" r={1.4} />
          {w > 50 ? (
            <>
              <B w={w / 2 - 5} h={5} d={13} x={-w / 4 + 0.5} y={top + mattressH + 2.5} z={-d / 2 + 13} color="#ffffff" mat="fabric" r={2.5} />
              <B w={w / 2 - 5} h={5} d={13} x={w / 4 - 0.5} y={top + mattressH + 2.5} z={-d / 2 + 13} color="#ffffff" mat="fabric" r={2.5} />
            </>
          ) : (
            <B w={w - 10} h={5} d={13} y={top + mattressH + 2.5} z={-d / 2 + 13} color="#ffffff" mat="fabric" r={2.5} />
          )}
          {back === "slatted" ? (
            <group>
              <B w={w} h={2} d={2.5} y={headH - 1} z={-d / 2 + 1.5} color={color} mat={frameMat} />
              {Array.from({ length: Math.round(w / 7) }).map((_, i, arr) => (
                <B key={i} w={2.2} h={headH - top} d={1.6} x={-w / 2 + (w / arr.length) * (i + 0.5)} y={top + (headH - top) / 2} z={-d / 2 + 1.5} color={color} mat={frameMat} />
              ))}
            </group>
          ) : (
            <>
              <B w={w} h={headH} d={look.upholstered ? 4 : 3} y={headH / 2} z={-d / 2 + 1.5} color={color} mat={frameMat} r={look.upholstered ? 2 : 1} />
              <Tufting w={w * 0.9} h={(headH - top - mattressH) * 0.85} y={top + mattressH + (headH - top - mattressH) / 2} z={-d / 2 + 3.6} />
            </>
          )}
        </group>
      );
    }
    case "sofa":
      return <SofaBody w={w} d={d} h={h} color={color} seats={w > 80 ? 3 : 2} />;
    case "loveseat":
      return <SofaBody w={w} d={d} h={h} color={color} seats={2} />;
    case "armchair":
      return <SofaBody w={w} d={d} h={h} color={color} seats={1} />;
    case "sectional": {
      const seatD = Math.min(40, d * 0.55);
      const chaiseW = Math.min(38, w * 0.34);
      const legH = 4;
      const baseH = 11;
      const backD = 9;
      const arm = 7;
      return (
        <group>
          {/* main run along the back */}
          <B w={w} h={baseH} d={seatD} y={legH + baseH / 2} z={-d / 2 + seatD / 2} color={color} mat="fabric" r={1.5} />
          {/* chaise on the local left */}
          <B w={chaiseW} h={baseH} d={d - seatD} x={-w / 2 + chaiseW / 2} y={legH + baseH / 2} z={-d / 2 + seatD + (d - seatD) / 2} color={color} mat="fabric" r={1.5} />
          <B w={w - arm} h={h - legH - baseH} d={backD} x={-arm / 2} y={legH + baseH + (h - legH - baseH) / 2} z={-d / 2 + backD / 2} color={color} mat="fabric" r={2.5} />
          <B w={arm} h={h * 0.72 - legH} d={seatD} x={w / 2 - arm / 2} y={legH + (h * 0.72 - legH) / 2} z={-d / 2 + seatD / 2} color={color} mat="fabric" r={2.4} />
          {[0, 1, 2].map((i) => {
            const sw = (w - chaiseW - arm) / 3;
            return <B key={i} w={sw - 0.6} h={5} d={seatD - backD - 1} x={-w / 2 + chaiseW + sw * (i + 0.5)} y={legH + baseH + 2.5} z={-d / 2 + backD + (seatD - backD) / 2} color={color} mat="fabric" r={2.2} />;
          })}
          <B w={chaiseW - 1} h={5} d={d - backD - 1} x={-w / 2 + chaiseW / 2} y={legH + baseH + 2.5} z={-d / 2 + backD + (d - backD) / 2} color={color} mat="fabric" r={2.2} />
          <Legs w={w} d={seatD} h={legH} inset={3} />
        </group>
      );
    }
    case "ottoman":
      return <Cyl rt={w / 2} h={h} y={h / 2} color={color} mat="fabric" />;
    case "coffee-table":
    case "dining-table":
    case "desk":
    case "console": {
      const top = kind === "coffee-table" ? 1.6 : 1.4;
      const isMarble = color === "#ece9e4" || color === "#2b2a29";
      return (
        <group>
          <B w={w} h={top} d={d} y={h - top / 2} color={color} mat={isMarble ? "stone" : "wood"} r={0.5} />
          {kind === "coffee-table" && isMarble ? (
            <>
              <B w={w * 0.15} h={h - top} d={d * 0.8} x={-w * 0.3} y={(h - top) / 2} color={color} mat="stone" />
              <B w={w * 0.15} h={h - top} d={d * 0.8} x={w * 0.3} y={(h - top) / 2} color={color} mat="stone" />
            </>
          ) : (
            <Legs w={w} d={d} h={h - top} inset={2.5} r={kind === "desk" ? 0.7 : 1} color={kind === "desk" ? METAL : LEG} round={kind !== "desk"} />
          )}
          {kind === "coffee-table" && <B w={w - 6} h={0.8} d={d - 6} y={5} color={color} />}
          {kind === "desk" && (
            <>
              <B w={22} h={13} d={1} y={h + 9} z={-d / 2 + 5} color="#1a1a1a" mat="plastic" />
              <B w={3} h={3} d={3} y={h + 1.5} z={-d / 2 + 5} color="#1a1a1a" mat="plastic" />
              <B w={14} h={0.6} d={5} y={h + 0.3} z={d / 2 - 7} color="#d8d6d2" mat="plastic" />
            </>
          )}
        </group>
      );
    }
    case "round-coffee-table":
      return (
        <group>
          <Cyl rt={w / 2} h={h} y={h / 2} color={color} mat={color === "#d9cbb3" ? "stone" : "wood"} seg={40} />
        </group>
      );
    case "round-table":
      return (
        <group>
          <Cyl rt={w / 2} h={1.4} y={h - 0.7} color={color} seg={40} />
          <Cyl rt={2.2} rb={3.2} h={h - 1.4} y={(h - 1.4) / 2} color={color} />
          <Cyl rt={w * 0.22} h={1.2} y={0.6} color={color} />
        </group>
      );
    case "side-table":
      return (
        <group>
          <Cyl rt={w / 2} h={1.2} y={h - 0.6} color={color} seg={32} />
          <Cyl rt={1} h={h - 1.2} y={(h - 1.2) / 2} color={color} />
          <Cyl rt={w * 0.3} h={0.8} y={0.4} color={color} />
        </group>
      );
    case "chair": {
      const seatY = 18;
      const upholstered = color.startsWith("#f2") || color.startsWith("#8a") || color.startsWith("#3d");
      return (
        <group>
          <B w={w} h={2} d={d * 0.85} y={seatY - 1} z={d * 0.07} color={color} mat={upholstered ? "fabric" : "wood"} r={0.8} />
          <B w={w} h={h - seatY} d={1.6} y={seatY + (h - seatY) / 2} z={-d / 2 + 0.8} color={color} mat={upholstered ? "fabric" : "wood"} r={0.6} />
          <Legs w={w} d={d} h={seatY - 2} inset={1.5} r={0.6} color={upholstered ? LEG : color} />
        </group>
      );
    }
    case "stool":
      return (
        <group>
          <Cyl rt={w / 2 - 1} h={1.8} y={h - 0.9} color={color} />
          <Legs w={w * 0.7} d={d * 0.7} h={h - 1.8} inset={0} r={0.5} color={color} />
          <Cyl rt={w * 0.36} h={0.6} y={h * 0.35} color={METAL} mat="metal" />
        </group>
      );
    case "bench":
      return (
        <group>
          <B w={w} h={2} d={d} y={h - 1} color={color} r={0.4} />
          <B w={1.5} h={h - 2} d={d - 2} x={-w / 2 + 3} y={(h - 2) / 2} color={color} />
          <B w={1.5} h={h - 2} d={d - 2} x={w / 2 - 3} y={(h - 2) / 2} color={color} />
        </group>
      );
    case "office-chair":
      return (
        <group>
          <B w={w * 0.75} h={3} d={d * 0.7} y={19} z={2} color={color} mat="fabric" r={1.2} />
          <B w={w * 0.7} h={20} d={2} y={32} z={-d * 0.3} color={color} mat="fabric" r={1} />
          <Cyl rt={1} h={14} y={10} color={METAL} mat="metal" />
          {[0, 72, 144, 216, 288].map((a) => (
            <B key={a} w={1.4} h={1.4} d={w * 0.48} y={2} z={0} color={METAL} mat="metal" />
          )).map((el, i) => (
            <group key={i} rotation={[0, (i * 72 * Math.PI) / 180, 0]}>
              <group position={[0, 0, w * 0.22]}>{el}</group>
            </group>
          ))}
        </group>
      );
    case "dresser":
    case "nightstand":
    case "tv-stand": {
      const legH = kind === "tv-stand" ? 4 : 3;
      const bodyH = h - legH;
      const rows = kind === "nightstand" ? 2 : kind === "tv-stand" ? 1 : bodyH > 40 ? 5 : 3;
      const cols = kind === "nightstand" || bodyH > 40 ? 1 : kind === "tv-stand" ? 3 : 2;
      return (
        <group>
          <Legs w={w} d={d} h={legH} inset={2} r={0.7} />
          <B w={w} h={bodyH} d={d - 1} y={legH + bodyH / 2} z={-0.5} color={color} r={0.4} />
          <Drawers w={w} h={bodyH} d={d - 1} y0={legH} rows={rows} cols={cols} color={color} />
        </group>
      );
    }
    case "wardrobe":
    case "closet":
      return (
        <group>
          <B w={w} h={h} d={d} y={h / 2} color={color} r={0.3} />
          {Array.from({ length: kind === "closet" ? Math.max(2, Math.round(w / 30)) : 2 }).map((_, i, arr) => {
            const pw = w / arr.length;
            return (
              <group key={i}>
                <B w={pw - 0.6} h={h - 2} d={0.5} x={-w / 2 + pw * (i + 0.5)} y={h / 2} z={d / 2 + 0.25} color={color} />
                <B w={0.6} h={10} d={1} x={-w / 2 + pw * (i + 0.5) + (i % 2 ? -pw / 2 + 3 : pw / 2 - 3)} y={h * 0.5} z={d / 2 + 0.9} color={METAL} mat="metal" />
              </group>
            );
          })}
        </group>
      );
    case "bookshelf": {
      const shelves = Math.max(3, Math.round(h / 15));
      const bookColors = ["#8a4f2a", "#3d4f5f", "#c9b48a", "#6f7350", "#b4654a", "#e8e2d6", "#2d2d2d"];
      return (
        <group>
          <B w={1} h={h} d={d} x={-w / 2 + 0.5} y={h / 2} color={color} />
          <B w={1} h={h} d={d} x={w / 2 - 0.5} y={h / 2} color={color} />
          <B w={w} h={h} d={0.5} y={h / 2} z={-d / 2 + 0.25} color={color} />
          {Array.from({ length: shelves + 1 }).map((_, i) => (
            <B key={i} w={w - 2} h={0.9} d={d - 0.5} y={(h / shelves) * i + 0.45} z={0.25} color={color} />
          ))}
          {Array.from({ length: shelves }).map((_, s) =>
            Array.from({ length: Math.floor((w - 4) / 4) }).map((__, b) =>
              (b + s) % 5 === 4 ? null : (
                <B key={`${s}-${b}`} w={1.4 + ((b * 7 + s) % 3) * 0.4} h={8 + ((b * 3 + s) % 4)} d={d * 0.7} x={-w / 2 + 3 + b * 4} y={(h / shelves) * s + 1 + (8 + ((b * 3 + s) % 4)) / 2} color={bookColors[(b * 5 + s * 3) % bookColors.length]} mat="fabric" />
              ),
            ),
          )}
        </group>
      );
    }
    case "tv":
      return (
        <group>
          <B w={w} h={h} d={1.2} y={h / 2 + 2} color="#111111" mat="plastic" />
          <mesh position={[0, h / 2 + 2, 0.61]}>
            <planeGeometry args={[w - 1, h - 1]} />
            <meshStandardMaterial color="#0d1620" roughness={0.15} metalness={0.4} emissive={evening ? "#1b2a3a" : "#000000"} />
          </mesh>
          <B w={8} h={2} d={6} y={1} color="#111111" mat="plastic" />
        </group>
      );
    case "mirror":
      return (
        <group rotation={[-0.08, 0, 0]}>
          <B w={w} h={h} d={1.2} y={h / 2} color={color} mat="metal" />
          <mesh position={[0, h / 2, 0.62]}>
            <planeGeometry args={[w - 2, h - 2]} />
            <meshStandardMaterial color="#e4ecee" roughness={0.08} metalness={0.45} />
          </mesh>
        </group>
      );
    case "rug":
    case "round-rug":
      return <Rug w={w} d={d} color={color} round={kind === "round-rug"} />;
    case "floor-lamp":
      return (
        <group>
          <Cyl rt={w * 0.35} h={1.2} y={0.6} color={color} mat="metal" />
          <Cyl rt={0.5} h={h - 12} y={(h - 12) / 2} color={color} mat="metal" />
          <mesh position={[0, h - 6, 0]} castShadow>
            <cylinderGeometry args={[w * 0.38, w * 0.48, 12, 28, 1, true]} />
            <meshStandardMaterial color="#f5efe2" roughness={0.9} side={2} emissive={evening ? "#ffcf8a" : "#000000"} emissiveIntensity={evening ? 0.9 : 0} />
          </mesh>
          {evening && <pointLight position={[0, h - 8, 0]} intensity={4500} distance={260} decay={2} color="#ffcf8a" castShadow={false} />}
        </group>
      );
    case "table-lamp":
      return (
        <group>
          <Cyl rt={w * 0.22} rb={w * 0.28} h={h * 0.5} y={h * 0.25} color={color} mat="ceramic" />
          <mesh position={[0, h * 0.72, 0]}>
            <cylinderGeometry args={[w * 0.36, w * 0.48, h * 0.42, 24, 1, true]} />
            <meshStandardMaterial color="#f5efe2" roughness={0.9} side={2} emissive={evening ? "#ffcf8a" : "#000000"} emissiveIntensity={evening ? 0.9 : 0} />
          </mesh>
          {evening && <pointLight position={[0, h * 0.7, 0]} intensity={1800} distance={160} decay={2} color="#ffcf8a" />}
        </group>
      );
    case "plant": {
      const potH = Math.min(14, h * 0.25);
      return (
        <group>
          <Cyl rt={w * 0.3} rb={w * 0.24} h={potH} y={potH / 2} color="#d9cdb8" mat="ceramic" />
          <Cyl rt={0.6} h={h * 0.5} y={potH + h * 0.25} color="#6b5440" />
          {[
            [0, 0.72, 0, 0.42],
            [0.18, 0.58, 0.1, 0.32],
            [-0.16, 0.62, -0.08, 0.34],
            [0.05, 0.86, -0.12, 0.3],
            [-0.08, 0.5, 0.16, 0.28],
          ].map(([x, y, z, r], i) => (
            <mesh key={i} position={[x * w, y * h, z * w]} castShadow>
              <icosahedronGeometry args={[r * w, 1]} />
              <meshStandardMaterial color={color} roughness={0.8} flatShading />
            </mesh>
          ))}
        </group>
      );
    }
    case "counter":
    case "island":
      return (
        <group>
          <B w={w - 1} h={h - 4.5} d={d - 2} y={(h - 4.5) / 2 + 3} z={-0.5} color="#ffffff" />
          <B w={w - 1} h={3.5} d={d - 4} y={1.75} z={-1} color="#d8d4cc" />
          <B w={w} h={1.5} d={d} y={h - 0.75} color={color} mat="stone" />
          {kind === "counter" && <B w={w} h={30} d={13} y={h + 24} z={-d / 2 + 6.5} color="#ffffff" />}
        </group>
      );
    case "sink-counter":
      return (
        <group>
          <B w={w - 1} h={h - 1.5} d={d - 2} y={(h - 1.5) / 2} z={-0.5} color="#ffffff" />
          <B w={w} h={1.5} d={d} y={h - 0.75} color={color} mat="stone" />
          <B w={w * 0.62} h={0.4} d={d * 0.55} y={h + 0.05} z={1} color="#b9bcbf" mat="metal" />
          <Cyl rt={0.6} h={10} y={h + 5} z={-d / 2 + 3} color="#c9cdd1" mat="metal" />
          <B w={1} h={1} d={6} y={h + 10} z={-d / 2 + 6} color="#c9cdd1" mat="metal" />
          <B w={w} h={30} d={13} y={h + 24} z={-d / 2 + 6.5} color="#ffffff" />
        </group>
      );
    case "range":
      return (
        <group>
          <B w={w} h={h} d={d} y={h / 2} color={color} mat="metal" />
          <B w={w - 1} h={0.4} d={d - 4} y={h + 0.2} z={1} color="#1b1b1b" mat="glass" />
          <B w={w - 4} h={h * 0.45} d={0.4} y={h * 0.4} z={d / 2 + 0.2} color="#222222" mat="glass" />
          <B w={w} h={14} d={20} y={h + 30} z={-d / 2 + 10} color={color} mat="metal" />
        </group>
      );
    case "fridge":
      return (
        <group>
          <B w={w} h={h} d={d} y={h / 2} color={color} mat="metal" r={0.6} />
          <B w={w - 0.5} h={0.4} d={0.6} y={h * 0.62} z={d / 2} color="#9a9da0" mat="metal" />
          <B w={0.8} h={22} d={1.2} x={-w / 2 + 3} y={h * 0.8} z={d / 2 + 0.8} color="#9a9da0" mat="metal" />
          <B w={0.8} h={18} d={1.2} x={-w / 2 + 3} y={h * 0.4} z={d / 2 + 0.8} color="#9a9da0" mat="metal" />
        </group>
      );
    case "washer":
      return (
        <group>
          <B w={w} h={h} d={d} y={h / 2} color={color} mat="plastic" r={0.6} />
          {[0.27, 0.73].map((f) => (
            <mesh key={f} position={[0, h * f, d / 2 + 0.1]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[w * 0.32, w * 0.32, 0.6, 28]} />
              <meshStandardMaterial color="#9fb0b8" roughness={0.1} metalness={0.3} />
            </mesh>
          ))}
        </group>
      );
    case "toilet":
      return (
        <group>
          <B w={w - 2} h={14} d={7} y={22} z={-d / 2 + 3.5} color={WHITE} mat="ceramic" r={1.2} />
          <mesh position={[0, 8, 4]} scale={[1, 1, 1.35]} castShadow>
            <cylinderGeometry args={[w * 0.42, w * 0.3, 16, 28]} />
            <M color={WHITE} mat="ceramic" />
          </mesh>
          <mesh position={[0, 16.3, 4]} scale={[1, 1, 1.35]}>
            <cylinderGeometry args={[w * 0.44, w * 0.44, 0.8, 28]} />
            <M color={WHITE} mat="ceramic" />
          </mesh>
        </group>
      );
    case "tub":
      return (
        <group>
          <B w={w} h={h} d={d} y={h / 2} color={WHITE} mat="ceramic" r={1} />
          <B w={w - 6} h={1} d={d - 6} y={h - 0.3} color="#dfe9ec" mat="ceramic" r={0.4} />
        </group>
      );
    case "shower":
      return (
        <group>
          <B w={w} h={3} d={d} y={1.5} color={WHITE} mat="ceramic" />
          <mesh position={[0, h / 2, d / 2 - 0.25]}>
            <boxGeometry args={[w, h, 0.4]} />
            <M color="#cfe3ea" mat="glass" opacity={0.3} />
          </mesh>
          <Cyl rt={2.5} h={0.6} y={h - 6} z={-d / 2 + 4} color="#c9cdd1" mat="metal" />
        </group>
      );
    case "vanity":
      return (
        <group>
          <B w={w} h={h - 1.5} d={d - 1} y={(h - 1.5) / 2} z={-0.5} color={color} />
          <B w={w} h={1.5} d={d} y={h - 0.75} color="#eeece8" mat="stone" />
          <mesh position={[0, h + 0.1, 1]} scale={[1, 1, 0.7]}>
            <cylinderGeometry args={[w * 0.28, w * 0.28, 0.4, 28]} />
            <meshStandardMaterial color="#ffffff" roughness={0.2} />
          </mesh>
          <B w={w * 0.8} h={26} d={1} y={h + 20} z={-d / 2 + 0.5} color="#e4ecee" mat="glass" />
        </group>
      );
    default:
      return <B w={w} h={h} d={d} y={h / 2} color={color} />;
  }
});
