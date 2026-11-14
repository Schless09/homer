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

/** Parse user input like `7' 2"`, `86`, `7ft 2in`, `2.2m`, `180cm` into inches. */
export function parseLength(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const metric = s.match(/^([\d.]+)\s*(m|cm|mm)$/);
  if (metric) {
    const v = parseFloat(metric[1]);
    const factor = metric[2] === "m" ? 39.3701 : metric[2] === "cm" ? 0.393701 : 0.0393701;
    return v * factor;
  }
  const ftIn = s.match(/^(?:([\d.]+)\s*(?:'|ft|feet|foot))?\s*(?:([\d.]+)\s*(?:"|in|inch|inches)?)?$/);
  if (ftIn && (ftIn[1] || ftIn[2])) {
    const ft = ftIn[1] ? parseFloat(ftIn[1]) : 0;
    const inch = ftIn[2] ? parseFloat(ftIn[2]) : 0;
    // a bare number is inches
    return ft * 12 + inch;
  }
  return null;
}
