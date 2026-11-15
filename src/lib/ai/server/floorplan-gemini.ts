import "server-only";
import { z } from "zod";
import { FloorplanExtractionSchema, type FloorplanExtraction } from "../floorplan-schema";

/**
 * Floor plan geometry with Gemini. Gemini is trained to point at image
 * locations on a 0–1000 normalized grid, so we ask for that and convert to
 * pixels ourselves. The response is validated against the same schema the
 * Claude reader uses; anything malformed is rejected, never patched.
 */

const N = z.number();
// same shape as FloorplanExtractionSchema, but coordinates on the 0–1000 grid
const NormalizedSchema = z.object({
  walls: z.array(z.object({ x1: N, y1: N, x2: N, y2: N, thickness: N, exterior: z.boolean() })),
  openings: z.array(z.object({ kind: z.enum(["door", "window", "opening"]), x1: N, y1: N, x2: N, y2: N })),
  rooms: z.array(
    z.object({
      name: z.string(),
      type: z.enum(["living", "bedroom", "kitchen", "dining", "bathroom", "closet", "entry", "office", "studio", "laundry", "balcony", "other"]),
      polygon: z.array(z.object({ x: N, y: N })),
      labeled_dimensions: z.string().nullable(),
    }),
  ),
  fixtures: z.array(
    z.object({
      type: z.enum(["kitchen-counter", "kitchen-island", "refrigerator", "range", "sink-counter", "toilet", "bathtub", "shower", "vanity", "closet", "washer-dryer"]),
      x: N,
      y: N,
      width: N,
      depth: N,
      rotation: N,
    }),
  ),
  dimension_annotations: z.array(z.object({ text: z.string(), inches: N, x1: N, y1: N, x2: N, y2: N })),
  notes: z.string(),
});

const PROMPT = `This image is an apartment floor plan. Extract its architecture as precise geometry.

COORDINATES: every coordinate is an integer on a 0-1000 normalized grid: x from 0 (left edge) to 1000 (right edge), y from 0 (top edge) to 1000 (bottom edge), each axis normalized independently.

- walls: centerline segments of every wall (x1,y1)-(x2,y2). Merge collinear pieces; split at corners so walls meet exactly. "thickness" is the wall thickness on the same grid (use the x-axis scale). exterior=true for perimeter walls.
- openings: doors, windows and open passages, as the two endpoints of the gap along the wall they sit in.
- rooms: one polygon per room following the interior faces of its walls, listed clockwise. Name it as labeled (or by function) and classify the type. If the plan prints room dimensions (e.g. 12'6" x 11'), copy that text to labeled_dimensions, else null.
- fixtures: built-ins drawn on the plan (kitchen counters, island, refrigerator, range, sink, toilet, bathtub, shower, vanity, closets, washer/dryer) with center x,y, width/depth on the grid (x-axis scale) and rotation in degrees (0 = front faces down the image).
- dimension_annotations: every printed measurement you can actually read, with its value converted to inches and the grid endpoints of what it measures. Never guess a measurement.
- notes: anything uncertain.

Return only JSON matching the schema.`;

type Normalized = z.infer<typeof NormalizedSchema>;

/** Convert 0–1000 grid output into pixel-space extraction for the given image size. */
export function denormalize(n: Normalized, width: number, height: number): FloorplanExtraction {
  const X = (v: number) => (Math.max(0, Math.min(1000, v)) / 1000) * width;
  const Y = (v: number) => (Math.max(0, Math.min(1000, v)) / 1000) * height;
  const L = (v: number) => (Math.max(0, v) / 1000) * width;
  return FloorplanExtractionSchema.parse({
    walls: n.walls.map((w) => ({ x1: X(w.x1), y1: Y(w.y1), x2: X(w.x2), y2: Y(w.y2), thickness_px: L(w.thickness), exterior: w.exterior })),
    openings: n.openings.map((o) => ({ kind: o.kind, x1: X(o.x1), y1: Y(o.y1), x2: X(o.x2), y2: Y(o.y2) })),
    rooms: n.rooms.map((r) => ({ name: r.name, type: r.type, polygon: r.polygon.map((p) => ({ x: X(p.x), y: Y(p.y) })), labeled_dimensions: r.labeled_dimensions })),
    fixtures: n.fixtures.map((f) => ({ type: f.type, x: X(f.x), y: Y(f.y), width_px: L(f.width), depth_px: L(f.depth), rotation: f.rotation })),
    dimension_annotations: n.dimension_annotations.map((d) => ({ text: d.text, inches: d.inches, x1: X(d.x1), y1: Y(d.y1), x2: X(d.x2), y2: Y(d.y2) })),
    notes: n.notes,
  });
}

function jsonSchema() {
  const s = z.toJSONSchema(NormalizedSchema) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST to Gemini with retries on overload (429/500/503) and a fallback model,
 * since popular models periodically return "high demand" errors.
 */
/** Keep "thinking" short for extraction tasks; the parameter differs by model family. */
export function thinkingFor(model: string, level: "low" | "high" = "low"): Record<string, unknown> | undefined {
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: level === "low" ? 1024 : 8192 };
  if (/^gemini-[3-9]/.test(model) && !/image/.test(model)) return { thinkingLevel: level };
  return undefined;
}

export async function geminiGenerate(
  apiKey: string,
  models: string[],
  body: { generationConfig?: Record<string, unknown> } & Record<string, unknown>,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; attempts?: number; thinking?: "low" | "high" } = {},
): Promise<{ model: string; json: unknown }> {
  const f = opts.fetchImpl ?? fetch;
  let last = "";
  for (const model of models) {
    for (let attempt = 0; attempt < (opts.attempts ?? 3); attempt++) {
      let res: Response;
      try {
        const thinking = opts.thinking ? thinkingFor(model, opts.thinking) : undefined;
        const payload = thinking ? { ...body, generationConfig: { ...body.generationConfig, thinkingConfig: thinking } } : body;
        res = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
        });
      } catch (e) {
        // a model that hangs under load: move straight on to the fallback model
        last = `Gemini ${model} did not respond (${e instanceof Error ? e.name : "error"})`;
        break;
      }
      if (res.ok) return { model, json: await res.json() };
      last = `Gemini error ${res.status} (${model}): ${(await res.text()).slice(0, 200)}`;
      if (![429, 500, 503].includes(res.status)) throw new Error(last);
      await sleep(1200 * 2 ** attempt);
    }
  }
  throw new Error(last || "Gemini request failed");
}

export async function extractFloorplanGemini(
  image: { data: string; mediaType: string; width: number; height: number },
  opts: { apiKey: string; model: string; fallbackModel?: string; fetchImpl?: typeof fetch; thinking?: "low" | "high"; timeoutMs?: number },
): Promise<FloorplanExtraction & { model?: string }> {
  const body = {
    contents: [{ role: "user", parts: [{ inline_data: { mime_type: image.mediaType, data: image.data } }, { text: PROMPT }] }],
    generationConfig: { responseMimeType: "application/json", responseJsonSchema: jsonSchema(), temperature: 0 },
  };
  const models = [opts.model, ...(opts.fallbackModel && opts.fallbackModel !== opts.model ? [opts.fallbackModel] : [])];
  const { json } = await geminiGenerate(opts.apiKey, models, body, { fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs ?? 50_000, thinking: opts.thinking ?? "low" });
  const out = json as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
  const text = out.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error(`Gemini returned no floor plan (${out.candidates?.[0]?.finishReason ?? "no candidates"}).`);
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new Error("Gemini returned malformed JSON for the floor plan.");
  }
  const parsed = NormalizedSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Floor plan didn't match the expected structure: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
  return denormalize(parsed.data, image.width, image.height);
}
