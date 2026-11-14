import type { FloorMaterial } from "@/lib/scene/types";

export const FLOOR_COLORS: Record<FloorMaterial, { base: string; line: string }> = {
  oak: { base: "#c9a57a", line: "#b48d62" },
  walnut: { base: "#7a5236", line: "#664430" },
  maple: { base: "#e1c9a2", line: "#d0b68d" },
  concrete: { base: "#bdbab4", line: "#aeaba5" },
  "tile-white": { base: "#f1f0ec", line: "#d9d6d0" },
  "tile-gray": { base: "#a9a8a4", line: "#94938f" },
  "carpet-oatmeal": { base: "#d9cdb8", line: "#d1c4ae" },
  herringbone: { base: "#c19a6b", line: "#a7825a" },
};

export function FloorSwatch({ material, size = 36 }: { material: FloorMaterial; size?: number }) {
  const c = FLOOR_COLORS[material];
  const lines: React.ReactNode[] = [];
  if (material === "tile-white" || material === "tile-gray") {
    for (let i = 1; i < 3; i++) {
      lines.push(<line key={`h${i}`} x1={0} x2={size} y1={(size / 3) * i} y2={(size / 3) * i} stroke={c.line} />);
      lines.push(<line key={`v${i}`} y1={0} y2={size} x1={(size / 3) * i} x2={(size / 3) * i} stroke={c.line} />);
    }
  } else if (material === "herringbone") {
    for (let i = -size; i < size * 2; i += 8) {
      lines.push(<line key={`a${i}`} x1={i} y1={0} x2={i + size} y2={size} stroke={c.line} />);
      lines.push(<line key={`b${i}`} x1={i + size} y1={0} x2={i} y2={size} stroke={c.line} opacity={0.5} />);
    }
  } else if (material !== "concrete" && material !== "carpet-oatmeal") {
    for (let i = 1; i < 5; i++) lines.push(<line key={i} x1={0} x2={size} y1={(size / 5) * i} y2={(size / 5) * i} stroke={c.line} />);
  }
  return (
    <svg width={size} height={size} className="rounded-md border border-black/10" aria-hidden>
      <rect width={size} height={size} fill={c.base} />
      {lines}
    </svg>
  );
}
