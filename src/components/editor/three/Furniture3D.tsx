"use client";

import { memo } from "react";
import { RoundedBox } from "@react-three/drei";
import type { ModelKind } from "@/lib/catalog/types";

/**
 * Procedural furniture, built in inches. Local frame: x = width, y = up,
 * z = depth with the front of the piece facing +z (plan +y).
 */

const LEG = "#3b2c22";
const METAL = "#2a2a2a";
const WHITE = "#f4f2ee";

type Mat = "fabric" | "wood" | "metal" | "ceramic" | "stone" | "plastic" | "glass";
const ROUGH: Record<Mat, { roughness: number; metalness: number }> = {
  fabric: { roughness: 0.95, metalness: 0 },
  wood: { roughness: 0.62, metalness: 0 },
  metal: { roughness: 0.38, metalness: 0.35 },
  ceramic: { roughness: 0.25, metalness: 0 },
  stone: { roughness: 0.3, metalness: 0 },
  plastic: { roughness: 0.5, metalness: 0 },
  glass: { roughness: 0.05, metalness: 0.1 },
};

function M({ color, mat = "wood", emissive, opacity }: { color: string; mat?: Mat; emissive?: string; opacity?: number }) {
  const r = ROUGH[mat];
  return (
    <meshStandardMaterial
      color={color}
      roughness={r.roughness}
      metalness={r.metalness}
      emissive={emissive ?? "#000000"}
      emissiveIntensity={emissive ? 1.4 : 0}
      transparent={opacity !== undefined}
      opacity={opacity ?? 1}
    />
  );
}

/** Box positioned by its center. */
function B({ w, h, d, x = 0, y = 0, z = 0, color, mat, r }: { w: number; h: number; d: number; x?: number; y?: number; z?: number; color: string; mat?: Mat; r?: number }) {
  if (r) {
    return (
      <RoundedBox args={[w, h, d]} radius={Math.min(r, w / 2, h / 2, d / 2) * 0.999} smoothness={3} position={[x, y, z]} castShadow receiveShadow>
        <M color={color} mat={mat} />
      </RoundedBox>
    );
  }
  return (
    <mesh position={[x, y, z]} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <M color={color} mat={mat} />
    </mesh>
  );
}

function Cyl({ rt, rb, h, x = 0, y = 0, z = 0, color, mat, seg = 28 }: { rt: number; rb?: number; h: number; x?: number; y?: number; z?: number; color: string; mat?: Mat; seg?: number }) {
  return (
    <mesh position={[x, y, z]} castShadow receiveShadow>
      <cylinderGeometry args={[rt, rb ?? rt, h, seg]} />
      <M color={color} mat={mat} />
    </mesh>
  );
}

function Legs({ w, d, h, inset = 2, r = 0.8, color = LEG, round = true }: { w: number; d: number; h: number; inset?: number; r?: number; color?: string; round?: boolean }) {
  const pts = [
    [-w / 2 + inset, -d / 2 + inset],
    [w / 2 - inset, -d / 2 + inset],
    [-w / 2 + inset, d / 2 - inset],
    [w / 2 - inset, d / 2 - inset],
  ];
  return (
    <>
      {pts.map(([x, z], i) =>
        round ? <Cyl key={i} rt={r} rb={r * 0.7} h={h} x={x} y={h / 2} z={z} color={color} seg={10} /> : <B key={i} w={r * 2} h={h} d={r * 2} x={x} y={h / 2} z={z} color={color} />,
      )}
    </>
  );
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

function SofaBody({ w, d, h, color, seats, arms = true }: { w: number; d: number; h: number; color: string; seats: number; arms?: boolean }) {
  const legH = 4;
  const baseH = 11;
  const arm = arms ? Math.min(7, w * 0.12) : 0;
  const backD = Math.min(9, d * 0.27);
  const seatW = (w - arm * 2) / seats;
  return (
    <group>
      <Legs w={w} d={d} h={legH} inset={3} r={0.9} />
      <B w={w} h={baseH} d={d} y={legH + baseH / 2} color={color} mat="fabric" r={1.5} />
      {Array.from({ length: seats }).map((_, i) => (
        <B key={i} w={seatW - 0.6} h={5} d={d - backD - 1} x={-w / 2 + arm + seatW * (i + 0.5)} y={legH + baseH + 2.5} z={backD / 2} color={color} mat="fabric" r={2.2} />
      ))}
      <B w={w - arm * 2} h={h - legH - baseH} d={backD} y={legH + baseH + (h - legH - baseH) / 2} z={-d / 2 + backD / 2} color={color} mat="fabric" r={2.5} />
      {arms && (
        <>
          <B w={arm} h={h * 0.72 - legH} d={d} x={-w / 2 + arm / 2} y={legH + (h * 0.72 - legH) / 2} color={color} mat="fabric" r={2.4} />
          <B w={arm} h={h * 0.72 - legH} d={d} x={w / 2 - arm / 2} y={legH + (h * 0.72 - legH) / 2} color={color} mat="fabric" r={2.4} />
        </>
      )}
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
  switch (kind) {
    case "bed": {
      const baseH = 12;
      const mattressH = 9;
      const headH = Math.max(h, 30);
      return (
        <group>
          <B w={w} h={baseH} d={d} y={baseH / 2} color={color} r={1} />
          <B w={w - 3} h={mattressH} d={d - 6} y={baseH + mattressH / 2} z={1.5} color="#fbfaf7" mat="fabric" r={3} />
          <B w={w - 2} h={2.2} d={d * 0.62} y={baseH + mattressH + 0.6} z={d * 0.19} color="#ece6dc" mat="fabric" r={1} />
          <B w={w - 1} h={3} d={14} y={baseH + mattressH + 1} z={d * 0.19 - d * 0.31 + 7} color="#e3dbcf" mat="fabric" r={1.4} />
          {w > 50 ? (
            <>
              <B w={w / 2 - 5} h={5} d={13} x={-w / 4 + 0.5} y={baseH + mattressH + 2.5} z={-d / 2 + 13} color="#ffffff" mat="fabric" r={2.5} />
              <B w={w / 2 - 5} h={5} d={13} x={w / 4 - 0.5} y={baseH + mattressH + 2.5} z={-d / 2 + 13} color="#ffffff" mat="fabric" r={2.5} />
            </>
          ) : (
            <B w={w - 10} h={5} d={13} y={baseH + mattressH + 2.5} z={-d / 2 + 13} color="#ffffff" mat="fabric" r={2.5} />
          )}
          <B w={w} h={headH} d={3} y={headH / 2} z={-d / 2 + 1.5} color={color} r={1} />
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
      return (
        <mesh position={[0, 0.25, 0]} receiveShadow>
          <boxGeometry args={[w, 0.5, d]} />
          <M color={color} mat="fabric" />
        </mesh>
      );
    case "round-rug":
      return <Cyl rt={w / 2} h={0.5} y={0.25} color={color} mat="fabric" seg={48} />;
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
