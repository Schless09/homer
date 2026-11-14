import type { CatalogItem } from "@/lib/catalog/types";

/** Small top-down SVG illustration of a catalog item, scaled to its real proportions. */
export function CatalogThumb({ item, color, size = 64 }: { item: CatalogItem; color?: string; size?: number }) {
  const c = color ?? item.colors[0]?.hex ?? "#d8d0c4";
  const maxDim = Math.max(item.width, item.depth);
  const pad = 6;
  const k = (size - pad * 2) / maxDim;
  const w = Math.max(item.width * k, 3);
  const d = Math.max(item.depth * k, 3);
  const x = (size - w) / 2;
  const y = (size - d) / 2;
  const ink = "#3a3833";
  const sw = 1;
  const soft = `color-mix(in srgb, ${c} 60%, white)`;

  let body: React.ReactNode;
  switch (item.model) {
    case "bed":
      body = (
        <>
          <rect x={x} y={y} width={w} height={d} rx={2} fill={soft} stroke={ink} strokeWidth={sw} />
          <rect x={x + 2} y={y + 3} width={w - 4} height={d - 5} rx={2} fill="#fbfaf7" stroke={ink} strokeWidth={sw * 0.8} />
          <rect x={x + 4} y={y + 5} width={w / 2 - 6} height={d * 0.14} rx={2} fill="#fff" stroke={ink} strokeWidth={0.7} />
          <rect x={x + w / 2 + 2} y={y + 5} width={w / 2 - 6} height={d * 0.14} rx={2} fill="#fff" stroke={ink} strokeWidth={0.7} />
          <line x1={x + 2} x2={x + w - 2} y1={y + d * 0.35} y2={y + d * 0.35} stroke={ink} strokeWidth={0.7} />
        </>
      );
      break;
    case "sofa":
    case "loveseat":
    case "armchair": {
      const back = d * 0.28;
      const arm = Math.min(w * 0.12, 7);
      body = (
        <>
          <rect x={x} y={y} width={w} height={d} rx={3} fill={soft} stroke={ink} strokeWidth={sw} />
          <line x1={x + arm} x2={x + w - arm} y1={y + back} y2={y + back} stroke={ink} strokeWidth={0.8} />
          <rect x={x} y={y} width={arm} height={d} rx={2} fill={soft} stroke={ink} strokeWidth={0.8} />
          <rect x={x + w - arm} y={y} width={arm} height={d} rx={2} fill={soft} stroke={ink} strokeWidth={0.8} />
        </>
      );
      break;
    }
    case "sectional": {
      const seat = d * 0.55;
      const chaise = w * 0.34;
      body = (
        <path
          d={`M${x} ${y} H${x + w} V${y + seat} H${x + chaise} V${y + d} H${x} Z`}
          fill={soft}
          stroke={ink}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
      );
      break;
    }
    case "round-table":
    case "round-coffee-table":
    case "side-table":
    case "ottoman":
    case "stool":
    case "round-rug":
      body = <ellipse cx={size / 2} cy={size / 2} rx={w / 2} ry={d / 2} fill={soft} stroke={ink} strokeWidth={sw} strokeDasharray={item.model === "round-rug" ? "3 2" : undefined} />;
      break;
    case "plant":
      body = (
        <>
          <circle cx={size / 2} cy={size / 2} r={w / 2} fill="#9fb592" stroke={ink} strokeWidth={sw} />
          <circle cx={size / 2} cy={size / 2} r={w / 4} fill="#7e9a70" />
        </>
      );
      break;
    case "floor-lamp":
    case "table-lamp":
      body = (
        <>
          <circle cx={size / 2} cy={size / 2} r={w / 2} fill="#fff8e8" stroke={ink} strokeWidth={sw} />
          <circle cx={size / 2} cy={size / 2} r={w / 6} fill={soft} stroke={ink} strokeWidth={0.6} />
        </>
      );
      break;
    case "tv":
      body = <rect x={x} y={size / 2 - 2} width={w} height={4} fill="#1b1b1b" />;
      break;
    case "rug":
      body = <rect x={x} y={y} width={w} height={d} fill={soft} stroke={ink} strokeWidth={0.8} strokeDasharray="3 2" />;
      break;
    case "chair":
      body = (
        <>
          <rect x={x} y={y + d * 0.2} width={w} height={d * 0.8} rx={3} fill={soft} stroke={ink} strokeWidth={sw} />
          <rect x={x} y={y} width={w} height={d * 0.2} rx={2} fill={soft} stroke={ink} strokeWidth={sw} />
        </>
      );
      break;
    case "office-chair":
      body = <circle cx={size / 2} cy={size / 2} r={w * 0.4} fill={soft} stroke={ink} strokeWidth={sw} />;
      break;
    default:
      body = (
        <>
          <rect x={x} y={y} width={w} height={d} rx={1.5} fill={soft} stroke={ink} strokeWidth={sw} />
          {["dresser", "nightstand", "tv-stand", "bookshelf", "wardrobe"].includes(item.model) && (
            <line x1={x + w / 2} x2={x + w / 2} y1={y + 1} y2={y + d - 1} stroke={ink} strokeWidth={0.6} opacity={0.6} />
          )}
        </>
      );
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {body}
    </svg>
  );
}
