/**
 * Minimal RFC 4180 parser for affiliate product feeds. Handles quoted fields,
 * escaped quotes and newlines inside quotes, and auto-detects comma, tab or
 * pipe delimiters (Impact/Awin use CSV, CJ and Rakuten often use TSV or pipes).
 */
export function detectDelimiter(headerLine: string): string {
  const counts = [",", "\t", "|"].map((d) => ({ d, n: headerLine.split(d).length }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 1 ? counts[0].d : ",";
}

export function parseDelimited(text: string, delimiter?: string): Record<string, string>[] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n/) === -1 ? src.length : src.search(/\r?\n/));
  const d = delimiter ?? detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") inQuotes = true;
    else if (ch === d) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return o;
  });
}

/** Parse a feed body: JSON (array, or {products|items|data: [...]}) or delimited text. */
export function parseFeed(body: string, format?: "csv" | "tsv" | "json"): Record<string, unknown>[] {
  const t = body.trim();
  if (format === "json" || (!format && (t.startsWith("[") || t.startsWith("{")))) {
    const j = JSON.parse(t) as unknown;
    if (Array.isArray(j)) return j as Record<string, unknown>[];
    const o = j as Record<string, unknown>;
    for (const k of ["products", "items", "data", "Items", "Products"]) if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
    throw new Error("JSON feed must be an array or contain a products/items array.");
  }
  return parseDelimited(t, format === "tsv" ? "\t" : undefined);
}
