/** Format inches as feet/inches, e.g. 86 -> 7' 2". */
export function formatFtIn(inches: number): string {
  const sign = inches < 0 ? "-" : "";
  const total = Math.round(Math.abs(inches));
  const ft = Math.floor(total / 12);
  const inch = total % 12;
  if (ft === 0) return `${sign}${inch}"`;
  if (inch === 0) return `${sign}${ft}'`;
  return `${sign}${ft}' ${inch}"`;
}

export function formatInches(inches: number): string {
  return `${Math.round(inches * 10) / 10}"`;
}

export function formatDims(w: number, d: number, h?: number): string {
  const parts = [`${Math.round(w)}"W`, `${Math.round(d)}"D`];
  if (h !== undefined) parts.push(`${Math.round(h)}"H`);
  return parts.join(" × ");
}

export function sqft(squareInches: number): number {
  return squareInches / 144;
}

export function formatSqft(squareInches: number): string {
  return `${Math.round(sqft(squareInches)).toLocaleString()} sq ft`;
}

export function formatPrice(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * Parse a length into inches. Handles the ways floor plans and people write it:
 * 12'-2", 12' 2", 12'2", 12′-2″, 12 ft 2 in, 12.5', 146", 146 in, 3.7m, 370cm, 3700mm.
 * A bare number is treated as inches.
 */
export function parseLength(input: string): number | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[′’‘`´]/g, "'")
    .replace(/[″”“]|''/g, '"')
    .replace(/,/g, ".")
    .replace(/\s+/g, " ");
  if (!s) return null;
  const metric = s.match(/^(\d+(?:\.\d+)?) ?(m|cm|mm)$/);
  if (metric) {
    const v = parseFloat(metric[1]);
    const factor = metric[2] === "m" ? 39.3701 : metric[2] === "cm" ? 0.393701 : 0.0393701;
    return v * factor;
  }
  // feet, optionally followed by inches, with an optional hyphen/space between: 12'-2", 12' 2, 12ft 2in
  const ftIn = s.match(/^(\d+(?:\.\d+)?) ?(?:'|ft\.?|feet|foot)(?: ?-? ?(\d+(?:\.\d+)?) ?(?:"|in\.?|inch|inches)?)?$/);
  if (ftIn) return parseFloat(ftIn[1]) * 12 + (ftIn[2] ? parseFloat(ftIn[2]) : 0);
  const inOnly = s.match(/^(\d+(?:\.\d+)?) ?(?:"|in\.?|inch|inches)?$/);
  if (inOnly) return parseFloat(inOnly[1]);
  return null;
}

/** Split a room label like 12'-2"x14'-7" or 12' 2" × 14' 7" into two lengths (inches). */
export function parseRoomSize(label: string): [number, number] | null {
  const parts = label
    .replace(/[′’‘`´]/g, "'")
    .replace(/[″”“]/g, '"')
    .split(/\s*(?:x|×|by)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length !== 2) return null;
  const a = parseLength(parts[0]);
  const b = parseLength(parts[1]);
  return a && b && a > 24 && b > 24 ? [a, b] : null;
}
