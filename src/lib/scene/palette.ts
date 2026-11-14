import type { CatalogItem, Style } from "@/lib/catalog/types";

export interface Palette {
  id: string;
  name: string;
  wood: string;
  fabric: string;
  metal: string;
  accent: string;
  wallColor: string;
  floor: "oak" | "walnut" | "maple" | "concrete" | "tile-white" | "tile-gray" | "carpet-oatmeal" | "herringbone";
  styles: Style[];
}

export const PALETTES: Palette[] = [
  { id: "warm-minimal", name: "Warm minimalist", wood: "#c49a6c", fabric: "#ece4d6", metal: "#1f1f1f", accent: "#b4654a", wallColor: "#f3efe8", floor: "oak", styles: ["minimalist", "modern", "scandinavian"] },
  { id: "japandi", name: "Japandi", wood: "#d8c3a0", fabric: "#d8cbb5", metal: "#1f1f1f", accent: "#6f7350", wallColor: "#efe9df", floor: "maple", styles: ["japandi", "minimalist", "scandinavian"] },
  { id: "modern-luxury", name: "Modern luxury", wood: "#6b4429", fabric: "#f2ede3", metal: "#b8955a", accent: "#26344f", wallColor: "#eeeae4", floor: "herringbone", styles: ["luxury", "modern"] },
  { id: "mid-century", name: "Mid-century", wood: "#6b4429", fabric: "#8a4f2a", metal: "#b8955a", accent: "#6f7350", wallColor: "#f1ece2", floor: "walnut", styles: ["mid-century", "modern"] },
  { id: "industrial", name: "Industrial loft", wood: "#6b4429", fabric: "#3d3d3f", metal: "#1f1f1f", accent: "#8a4f2a", wallColor: "#e6e3de", floor: "concrete", styles: ["industrial", "modern"] },
  { id: "coastal", name: "Coastal", wood: "#e2d5bd", fabric: "#f2ede3", metal: "#c9cdd1", accent: "#5b6b7a", wallColor: "#f5f3ee", floor: "maple", styles: ["coastal", "scandinavian"] },
  { id: "boho", name: "Boho", wood: "#9c6a3f", fabric: "#d8cbb5", metal: "#b8955a", accent: "#b4654a", wallColor: "#f2ebe0", floor: "oak", styles: ["boho", "mid-century"] },
  { id: "moody", name: "Moody modern", wood: "#232323", fabric: "#3d3d3f", metal: "#b8955a", accent: "#26344f", wallColor: "#d9d4cc", floor: "walnut", styles: ["modern", "luxury", "industrial"] },
];

export function getPalette(id: string | undefined): Palette | undefined {
  return PALETTES.find((p) => p.id === id);
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function colorDistance(a: string, b: string) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/** Pick the catalog color option that best matches a palette. */
export function pickColor(c: CatalogItem, p: Palette | undefined): string | undefined {
  if (!c.colors.length) return undefined;
  if (!p) return c.colors[0].hex;
  const targets = [p.wood, p.fabric, p.metal];
  let best = c.colors[0];
  let bestD = Infinity;
  for (const opt of c.colors) {
    const d = Math.min(...targets.map((t) => colorDistance(opt.hex, t)));
    if (d < bestD) {
      bestD = d;
      best = opt;
    }
  }
  return best.hex;
}
