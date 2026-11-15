/**
 * Extract real dimensions (inches) from feed fields or product text.
 * Only explicit measurements are accepted; nothing is guessed. Returns null
 * when width and depth can't both be determined.
 */

export interface ParsedDims {
  width: number;
  depth: number;
  height?: number;
  source: string;
}

const NUM = String.raw`(\d+(?:\.\d+)?)`;

/** Convert "84", "84in", "213 cm", "7'", "5' 3\"", "7 ft" to inches. */
export function toInches(raw: string, defaultUnit: "in" | "cm" = "in"): number | null {
  const s = raw.trim().toLowerCase().replace(/,/g, ".");
  const ftIn = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inches)?)?$/);
  if (ftIn) return parseFloat(ftIn[1]) * 12 + (ftIn[2] ? parseFloat(ftIn[2]) : 0);
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(cm|mm|m|inches|inch|in|"|”|'')?$/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const unit = m[2] ?? defaultUnit;
  if (unit === "cm") return v / 2.54;
  if (unit === "mm") return v / 25.4;
  if (unit === "m") return v * 39.3701;
  return v;
}

function unitHint(text: string): "in" | "cm" {
  return /\bcm\b|centimet/i.test(text) && !/\bin\b|inch|"/i.test(text) ? "cm" : "in";
}

const LABELS: Record<string, "w" | "d" | "h"> = {
  w: "w",
  wide: "w",
  width: "w",
  l: "w",
  length: "w",
  long: "w",
  d: "d",
  deep: "d",
  depth: "d",
  h: "h",
  high: "h",
  height: "h",
  tall: "h",
};

/** Parse labeled measurements like `84"W x 36"D x 33"H`, `W 84 in`, `Width: 84"`. */
function parseLabeled(text: string): Partial<Record<"w" | "d" | "h", number>> {
  const out: Partial<Record<"w" | "d" | "h", number>> = {};
  const unit = unitHint(text);
  const labels = Object.keys(LABELS).sort((a, b) => b.length - a.length).join("|");
  // number then label: 84"W, 84 in. W, 84 W, 84" wide
  const after = new RegExp(String.raw`${NUM}\s*(cm|mm|inches|inch|in\.?|"|”|'')?\s*(${labels})\b`, "gi");
  // label then number: W 84", Width: 84 in
  const before = new RegExp(String.raw`\b(${labels})\s*[:=]?\s*${NUM}\s*(cm|mm|inches|inch|in\.?|"|”|'')?`, "gi");
  for (const m of text.matchAll(after)) {
    const k = LABELS[m[3].toLowerCase()];
    const v = toInches(m[1] + (m[2] ? m[2].replace(".", "").replace(/inches|inch/, "in") : ""), unit);
    if (k && v && out[k] === undefined) out[k] = v;
  }
  for (const m of text.matchAll(before)) {
    const k = LABELS[m[1].toLowerCase()];
    const v = toInches(m[2] + (m[3] ? m[3].replace(".", "").replace(/inches|inch/, "in") : ""), unit);
    if (k && v && out[k] === undefined) out[k] = v;
  }
  return out;
}

/** Unlabeled `84 x 36 x 33 in` (read as W × D × H) or `8' x 10'` (rugs). */
function parseUnlabeled(text: string): { a: number; b: number; c?: number } | null {
  const unit = unitHint(text);
  const part = String.raw`(\d+(?:\.\d+)?\s*(?:'|ft)?\s*(?:\d+(?:\.\d+)?\s*(?:"|in)?)?|\d+(?:\.\d+)?\s*(?:cm|"|in)?)`;
  const re = new RegExp(String.raw`${part}\s*[x×X]\s*${part}(?:\s*[x×X]\s*${part})?\s*(cm|in|inches|ft|feet|")?`);
  const m = text.match(re);
  if (!m) return null;
  const trailing = m[4]?.toLowerCase();
  const conv = (p: string | undefined) => {
    if (!p) return null;
    let q = p.trim();
    if (trailing && /^\d+(\.\d+)?$/.test(q)) q += trailing === "feet" ? "ft" : trailing === "inches" ? "in" : trailing;
    return toInches(q, unit);
  };
  const a = conv(m[1]);
  const b = conv(m[2]);
  const c = conv(m[3]);
  if (!a || !b) return null;
  return { a, b, c: c ?? undefined };
}

const FIELD_ALIASES = {
  w: ["width", "product_width", "item_width", "width_in", "width (in)", "overall width", "length", "product_length"],
  d: ["depth", "product_depth", "item_depth", "depth_in", "depth (in)", "overall depth"],
  h: ["height", "product_height", "item_height", "height_in", "height (in)", "overall height"],
  text: ["dimensions", "product_dimensions", "size", "measurements", "overall dimensions", "product_size"],
};

function field(row: Record<string, unknown>, names: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((x) => x.toLowerCase().replace(/[_\s]+/g, " ").trim() === n.replace(/[_\s]+/g, " "));
    const v = k ? row[k] : undefined;
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return undefined;
}

export function extractDimensions(row: Record<string, unknown>, title: string, description: string, opts: { rug?: boolean } = {}): ParsedDims | null {
  // 1) dedicated numeric fields
  const unitField = field(row, ["dimension_unit", "unit", "units", "size_unit"]);
  const unit = unitField && /cm/i.test(unitField) ? "cm" : "in";
  const fw = field(row, FIELD_ALIASES.w);
  const fd = field(row, FIELD_ALIASES.d);
  const fh = field(row, FIELD_ALIASES.h);
  if (fw && fd) {
    const w = toInches(fw, unit);
    const d = toInches(fd, unit);
    const h = fh ? toInches(fh, unit) : null;
    if (w && d) return { width: w, depth: d, height: h ?? undefined, source: "feed fields" };
  }
  // 2) text sources, most specific first
  const sources: [string, string | undefined][] = [
    ["dimensions field", field(row, FIELD_ALIASES.text)],
    ["title", title],
    ["description", description],
  ];
  for (const [src, text] of sources) {
    if (!text) continue;
    const lab = parseLabeled(text);
    if (lab.w && lab.d) return { width: lab.w, depth: lab.d, height: lab.h, source: src };
    if (opts.rug || src === "dimensions field") {
      const u = parseUnlabeled(text);
      if (u) {
        if (opts.rug) return { width: Math.max(u.a, u.b), depth: Math.min(u.a, u.b), height: 0.5, source: src };
        return { width: u.a, depth: u.b, height: u.c, source: `${src} (W × D × H order)` };
      }
    }
  }
  return null;
}
