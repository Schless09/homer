"use client";

import { Circle, Ellipse, Group, Line, Rect, Shape, Star, Text } from "react-konva";
import type { ModelKind } from "@/lib/catalog/types";

/**
 * Top-down architectural glyphs for every furniture kind, drawn in inches
 * around the item's center. Local frame: width along x, depth along y,
 * back edge at -d/2, front edge at +d/2.
 */

const INK = "#3a3833";
const PAPER = "#fbfaf7";

function shade(hex: string, amt: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

/** Soften the item color for plan view so the drawing stays readable. */
function tint(hex: string | undefined, fallback = "#d8d0c4") {
  const c = hex ?? fallback;
  const h = c.replace("#", "");
  const n = parseInt(h, 16);
  const mix = (v: number) => Math.round(v * 0.55 + 255 * 0.45);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

interface Props {
  kind: ModelKind;
  w: number;
  d: number;
  color?: string;
  stroke?: string;
  strokeWidth?: number;
  dash?: number[];
}

export function ItemGlyph({ kind, w, d, color, stroke = INK, strokeWidth = 1.1, dash }: Props) {
  const fill = tint(color);
  const S = { stroke, strokeWidth, strokeScaleEnabled: false, dash } as const;
  const hw = w / 2;
  const hd = d / 2;
  const base = <Rect x={-hw} y={-hd} width={w} height={d} fill={fill} cornerRadius={Math.min(w, d) * 0.06} {...S} />;

  switch (kind) {
    case "bed": {
      const frame = Math.min(3, w * 0.04);
      const mattressY = -hd + Math.min(4, d * 0.05);
      const pillowH = Math.min(14, d * 0.16);
      const pillows = w > 50 ? 2 : 1;
      const pw = (w - frame * 2 - 6) / pillows - (pillows - 1) * 2;
      return (
        <Group>
          {base}
          <Rect x={-hw + frame} y={mattressY} width={w - frame * 2} height={d - (mattressY + hd) - frame} fill={PAPER} cornerRadius={3} {...S} />
          {Array.from({ length: pillows }).map((_, i) => (
            <Rect key={i} x={-hw + frame + 3 + i * (pw + 4)} y={mattressY + 3} width={pw} height={pillowH} fill="#ffffff" cornerRadius={4} {...S} />
          ))}
          <Line points={[-hw + frame, mattressY + pillowH + 12, hw - frame, mattressY + pillowH + 12]} {...S} />
          <Line points={[-hw + frame, mattressY + pillowH + 18, hw - frame, mattressY + pillowH + 18]} {...S} opacity={0.5} />
        </Group>
      );
    }
    case "sofa":
    case "loveseat":
    case "armchair": {
      const back = d * 0.26;
      const arm = Math.min(w * 0.12, 8);
      const seats = kind === "armchair" ? 1 : kind === "loveseat" ? 2 : w > 80 ? 3 : 2;
      const sw = (w - arm * 2) / seats;
      return (
        <Group>
          {base}
          <Rect x={-hw} y={-hd} width={w} height={back} fill={shade("#000000", 0)} opacity={0.07} />
          <Line points={[-hw + arm, -hd + back, hw - arm, -hd + back]} {...S} />
          <Rect x={-hw} y={-hd} width={arm} height={d} cornerRadius={2} fill={fill} {...S} />
          <Rect x={hw - arm} y={-hd} width={arm} height={d} cornerRadius={2} fill={fill} {...S} />
          {Array.from({ length: seats - 1 }).map((_, i) => (
            <Line key={i} points={[-hw + arm + sw * (i + 1), -hd + back, -hw + arm + sw * (i + 1), hd - 2]} {...S} opacity={0.6} />
          ))}
        </Group>
      );
    }
    case "sectional": {
      const back = Math.min(10, d * 0.15);
      const seatD = Math.min(40, d * 0.55);
      const chaiseW = Math.min(38, w * 0.34);
      const arm = 7;
      // L outline: full-width back + seat, chaise extends forward on the local left
      const pts = [-hw, -hd, hw, -hd, hw, -hd + seatD, -hw + chaiseW, -hd + seatD, -hw + chaiseW, hd, -hw, hd];
      const seats = 3;
      const sw = (w - chaiseW - arm) / seats;
      return (
        <Group>
          <Line points={pts} closed fill={fill} {...S} />
          <Line points={[-hw + back, -hd + back, hw - arm, -hd + back]} {...S} />
          <Line points={[-hw + back, -hd + back, -hw + back, hd]} {...S} opacity={0.6} />
          <Rect x={hw - arm} y={-hd} width={arm} height={seatD} fill={fill} {...S} />
          <Line points={[-hw + back, -hd + seatD, -hw + chaiseW, -hd + seatD]} {...S} opacity={0.6} />
          {Array.from({ length: seats - 1 }).map((_, i) => (
            <Line key={i} points={[-hw + chaiseW + sw * (i + 1), -hd + back, -hw + chaiseW + sw * (i + 1), -hd + seatD]} {...S} opacity={0.6} />
          ))}
        </Group>
      );
    }
    case "ottoman":
    case "round-coffee-table":
    case "round-table":
    case "stool":
    case "side-table":
      return (
        <Group>
          <Ellipse radiusX={hw} radiusY={hd} fill={fill} {...S} />
          {kind === "round-table" && <Ellipse radiusX={hw * 0.18} radiusY={hd * 0.18} {...S} opacity={0.4} />}
          {kind === "ottoman" && <Ellipse radiusX={hw * 0.7} radiusY={hd * 0.7} {...S} opacity={0.4} />}
        </Group>
      );
    case "coffee-table":
    case "dining-table":
    case "console":
    case "bench":
      return (
        <Group>
          {base}
          <Rect x={-hw + 2} y={-hd + 2} width={w - 4} height={d - 4} cornerRadius={1} {...S} opacity={0.35} />
        </Group>
      );
    case "chair":
      return (
        <Group>
          <Rect x={-hw + 1} y={-hd + d * 0.18} width={w - 2} height={d * 0.8} fill={fill} cornerRadius={3} {...S} />
          <Rect x={-hw} y={-hd} width={w} height={d * 0.2} fill={fill} cornerRadius={2} {...S} />
        </Group>
      );
    case "office-chair":
      return (
        <Group>
          <Star numPoints={5} innerRadius={hw * 0.15} outerRadius={hw * 0.95} fill="transparent" {...S} opacity={0.35} />
          <Circle radius={hw * 0.72} fill={fill} {...S} />
          <Shape
            sceneFunc={(ctx, shape) => {
              ctx.beginPath();
              ctx.arc(0, 0, hw * 0.9, Math.PI * 1.15, Math.PI * 1.85);
              ctx.strokeShape(shape);
            }}
            {...S}
            strokeWidth={3}
          />
        </Group>
      );
    case "desk":
      return (
        <Group>
          {base}
          <Rect x={-w * 0.2} y={-hd + 3} width={w * 0.4} height={2.5} fill={INK} opacity={0.6} />
          <Rect x={-w * 0.12} y={hd - 9} width={w * 0.24} height={5} cornerRadius={1} {...S} opacity={0.5} />
        </Group>
      );
    case "dresser":
    case "nightstand":
    case "tv-stand": {
      const n = kind === "nightstand" ? 1 : kind === "tv-stand" ? 3 : 2;
      return (
        <Group>
          {base}
          {Array.from({ length: n }).map((_, i) => (
            <Line key={i} points={[-hw + (w / (n + 1)) * (i + 1), -hd + 2, -hw + (w / (n + 1)) * (i + 1), hd - 2]} {...S} opacity={0.45} />
          ))}
          <Line points={[-hw, hd - 2, hw, hd - 2]} {...S} opacity={0.6} />
        </Group>
      );
    }
    case "wardrobe":
    case "closet":
      return (
        <Group>
          {base}
          <Line points={[-hw + 3, 0, hw - 3, 0]} {...S} dash={[4, 3]} opacity={0.7} />
          {kind === "wardrobe" && <Line points={[0, -hd, 0, hd]} {...S} opacity={0.5} />}
          {kind === "closet" &&
            Array.from({ length: Math.max(2, Math.floor(w / 6)) }).map((_, i, arr) => (
              <Line key={i} points={[-hw + (w / (arr.length + 1)) * (i + 1), -4, -hw + (w / (arr.length + 1)) * (i + 1), 4]} {...S} opacity={0.4} />
            ))}
        </Group>
      );
    case "bookshelf":
      return (
        <Group>
          {base}
          {Array.from({ length: Math.max(1, Math.floor(w / 16)) }).map((_, i, arr) => (
            <Line key={i} points={[-hw + (w / (arr.length + 1)) * (i + 1), -hd + 1, -hw + (w / (arr.length + 1)) * (i + 1), hd - 1]} {...S} opacity={0.45} />
          ))}
        </Group>
      );
    case "tv":
      return <Rect x={-hw} y={-hd} width={w} height={Math.max(d, 1.5)} fill="#1b1b1b" {...S} />;
    case "mirror":
      return <Rect x={-hw} y={-hd} width={w} height={Math.max(d, 1.5)} fill="#dfe8ea" {...S} />;
    case "rug":
      return (
        <Group>
          <Rect x={-hw} y={-hd} width={w} height={d} fill={tint(color, "#e9e1d4")} opacity={0.75} stroke={stroke} strokeWidth={0.8} strokeScaleEnabled={false} dash={[6, 4]} />
          <Rect x={-hw + 4} y={-hd + 4} width={w - 8} height={d - 8} stroke={stroke} strokeWidth={0.6} strokeScaleEnabled={false} opacity={0.3} />
        </Group>
      );
    case "round-rug":
      return (
        <Group>
          <Ellipse radiusX={hw} radiusY={hd} fill={tint(color, "#e9e1d4")} opacity={0.75} stroke={stroke} strokeWidth={0.8} strokeScaleEnabled={false} dash={[6, 4]} />
          <Ellipse radiusX={hw - 4} radiusY={hd - 4} stroke={stroke} strokeWidth={0.6} strokeScaleEnabled={false} opacity={0.3} />
        </Group>
      );
    case "floor-lamp":
    case "table-lamp":
      return (
        <Group>
          <Circle radius={hw} fill="#fff8e8" {...S} />
          <Circle radius={hw * 0.3} fill={tint(color, "#c9b48a")} {...S} />
          <Line points={[-hw * 0.6, 0, hw * 0.6, 0]} {...S} opacity={0.4} />
          <Line points={[0, -hw * 0.6, 0, hw * 0.6]} {...S} opacity={0.4} />
        </Group>
      );
    case "plant":
      return (
        <Group>
          <Star numPoints={7} innerRadius={hw * 0.55} outerRadius={hw} fill="#9fb592" {...S} />
          <Circle radius={hw * 0.42} fill="#7e9a70" {...S} opacity={0.9} />
        </Group>
      );
    case "counter":
    case "island":
      return (
        <Group>
          <Rect x={-hw} y={-hd} width={w} height={d} fill="#efede8" {...S} />
          <Line points={[-hw, hd - 1.5, hw, hd - 1.5]} {...S} opacity={0.5} />
        </Group>
      );
    case "sink-counter":
      return (
        <Group>
          <Rect x={-hw} y={-hd} width={w} height={d} fill="#efede8" {...S} />
          <Rect x={-w * 0.32} y={-hd + d * 0.25} width={w * 0.64} height={d * 0.55} cornerRadius={3} fill="#ffffff" {...S} />
          <Circle y={-hd + d * 0.18} radius={1.2} fill={INK} />
        </Group>
      );
    case "range":
      return (
        <Group>
          <Rect x={-hw} y={-hd} width={w} height={d} fill="#e4e4e2" {...S} />
          {[
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ].map(([sx, sy], i) => (
            <Circle key={i} x={sx * w * 0.22} y={sy * d * 0.2} radius={Math.min(w, d) * 0.14} {...S} />
          ))}
        </Group>
      );
    case "fridge":
      return (
        <Group>
          <Rect x={-hw} y={-hd} width={w} height={d} fill="#e9eaeb" {...S} />
          <Line points={[-hw, -hd, hw, hd]} {...S} opacity={0.25} />
          <Line points={[hw, -hd, -hw, hd]} {...S} opacity={0.25} />
          <Text text="REF" x={-hw} y={-3} width={w} align="center" fontSize={6} fill={INK} opacity={0.6} />
        </Group>
      );
    case "washer":
      return (
        <Group>
          <Rect x={-hw} y={-hd} width={w} height={d} fill="#f0f0ee" {...S} />
          <Circle radius={Math.min(w, d) * 0.3} {...S} />
          <Text text="W/D" x={-hw} y={hd - 7} width={w} align="center" fontSize={4.5} fill={INK} opacity={0.6} />
        </Group>
      );
    case "toilet":
      return (
        <Group>
          <Rect x={-hw + 1} y={-hd} width={w - 2} height={d * 0.27} cornerRadius={2} fill="#ffffff" {...S} />
          <Ellipse y={d * 0.12} radiusX={hw * 0.85} radiusY={d * 0.36} fill="#ffffff" {...S} />
        </Group>
      );
    case "tub":
      return (
        <Group>
          <Rect x={-hw} y={-hd} width={w} height={d} fill="#ffffff" {...S} />
          <Rect x={-hw + 3} y={-hd + 3} width={w - 6} height={d - 6} cornerRadius={Math.min(w, d) * 0.3} {...S} />
          <Circle x={-hw + 9} radius={1.2} fill={INK} />
        </Group>
      );
    case "shower":
      return (
        <Group>
          <Rect x={-hw} y={-hd} width={w} height={d} fill="#eef4f5" {...S} />
          <Line points={[-hw, -hd, hw, hd]} {...S} opacity={0.4} />
          <Line points={[hw, -hd, -hw, hd]} {...S} opacity={0.4} />
          <Circle radius={1.5} {...S} />
        </Group>
      );
    case "vanity":
      return (
        <Group>
          <Rect x={-hw} y={-hd} width={w} height={d} fill="#f4f2ee" {...S} />
          <Ellipse y={1} radiusX={w * 0.28} radiusY={d * 0.28} fill="#ffffff" {...S} />
        </Group>
      );
    case "bunk":
    default:
      return base;
  }
}
