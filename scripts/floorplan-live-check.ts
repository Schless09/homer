/**
 * Live check of Gemini floor plan reading on a plan image with known geometry.
 *   NODE_OPTIONS=--conditions=react-server npx tsx --tsconfig tsconfig.json scripts/floorplan-live-check.ts <plan.png> [model]
 * Needs GEMINI_API_KEY (or HOMER_GEMINI_API_KEY).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extractFloorplanGemini } from "../src/lib/ai/server/floorplan-gemini";
import { suggestScale } from "../src/lib/import/fromExtraction";

async function main() {
  const file = process.argv[2];
  const model = process.argv[3] ?? "gemini-3.6-flash";
  const key = process.env.HOMER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!file || !key) throw new Error("usage: <plan.png> [model], with GEMINI_API_KEY set");
  const buf = readFileSync(file);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const t = Date.now();
  const cache = process.env.FLOORPLAN_CACHE;
  const ex =
    cache && existsSync(cache)
      ? (JSON.parse(readFileSync(cache, "utf8")) as Awaited<ReturnType<typeof extractFloorplanGemini>>)
      : await extractFloorplanGemini({ data: buf.toString("base64"), mediaType: "image/png", width, height }, { apiKey: key, model, fallbackModel: process.env.FALLBACK ?? "gemini-2.5-flash", thinking: (process.env.THINKING as "low" | "high") ?? "low", timeoutMs: 120_000 });
  if (cache && !existsSync(cache)) writeFileSync(cache, JSON.stringify(ex));
  console.log(`model ${model}: ${((Date.now() - t) / 1000).toFixed(1)}s, image ${width}x${height}`);
  console.log(`walls ${ex.walls.length} (exterior ${ex.walls.filter((w) => w.exterior).length}), openings ${ex.openings.length} (${ex.openings.map((o) => o.kind[0]).join("")}), rooms ${ex.rooms.length}, fixtures ${ex.fixtures.length}, dims ${ex.dimension_annotations.length}`);
  for (const r of ex.rooms) {
    const xs = r.polygon.map((p) => p.x);
    const ys = r.polygon.map((p) => p.y);
    console.log(`  room ${r.name.padEnd(12)} ${r.type.padEnd(9)} px bbox ${Math.round(Math.min(...xs))},${Math.round(Math.min(...ys))} → ${Math.round(Math.max(...xs))},${Math.round(Math.max(...ys))}  label: ${r.labeled_dimensions ?? "-"}`);
  }
  for (const d of ex.dimension_annotations) console.log(`  dim "${d.text}" = ${d.inches}" over ${Math.round(Math.hypot(d.x2 - d.x1, d.y2 - d.y1))}px`);
  const s = suggestScale(ex, 1);
  console.log("stated total sqft:", ex.stated_total_sqft);
  console.log("suggested scale:", s ? `${s.inchesPerPx.toFixed(3)} in/px from ${s.basis} [${s.confidence}]${s.areaCheck ? ` area ${s.areaCheck.computedSqft} vs listed ${s.areaCheck.statedSqft} ${s.areaCheck.ok ? "ok" : "MISMATCH"}` : ""}` : "none");
  const ext = ex.walls.filter((w) => w.exterior);
  if (ext.length) {
    const xs = ext.flatMap((w) => [w.x1, w.x2]);
    const ys = ext.flatMap((w) => [w.y1, w.y2]);
    console.log(`exterior extent px: x ${Math.round(Math.min(...xs))}–${Math.round(Math.max(...xs))}, y ${Math.round(Math.min(...ys))}–${Math.round(Math.max(...ys))}`);
  }
  if (ex.notes) console.log("notes:", ex.notes.slice(0, 200));
}
main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
