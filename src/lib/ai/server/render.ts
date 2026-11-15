import "server-only";
import { aiConfig } from "./config";

/**
 * Photorealistic rendering is an asynchronous job behind a provider seam.
 * The editable 3D scene stays the source of truth; renders are previews.
 *
 * Providers:
 *  - Gemini image model (HOMER_GEMINI_API_KEY): takes the 3D snapshot PLUS the
 *    real product photos as references, so the render shows the actual pieces.
 *  - Replicate (REPLICATE_API_TOKEN): snapshot + text description only.
 * Without either, the feature reports itself as not configured.
 */

export interface RenderJob {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string;
  error?: string;
}

export interface ReferenceImage {
  label: string;
  mimeType: string;
  /** base64, no data: prefix */
  data: string;
}

export interface RenderInput {
  image: string;
  prompt: string;
  references: ReferenceImage[];
}

export interface RenderProvider {
  id: string;
  /** true when the provider uses product photos as visual references */
  usesReferences: boolean;
  start(input: RenderInput): Promise<RenderJob>;
  get(id: string): Promise<RenderJob>;
}

function splitDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) throw new Error("Snapshot must be a base64 data URL");
  return { mimeType: m[1], data: m[2] };
}

/**
 * Gemini image generation is synchronous (~10-30 s), so the "job" completes in
 * the start call and the client's polling loop simply sees it succeeded.
 */
export function gemini(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): RenderProvider {
  return {
    id: "gemini",
    usesReferences: true,
    async start({ image, prompt, references }) {
      const snap = splitDataUrl(image);
      const parts: Record<string, unknown>[] = [{ text: prompt }, { text: "Image 1 — 3D layout snapshot:" }, { inline_data: { mime_type: snap.mimeType, data: snap.data } }];
      references.forEach((r, i) => {
        parts.push({ text: `Image ${i + 2} — product reference: ${r.label}` }, { inline_data: { mime_type: r.mimeType, data: r.data } });
      });
      const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
        signal: AbortSignal.timeout(55_000),
      });
      if (!res.ok) throw new Error(`Render provider error ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const body = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string }; inline_data?: { mime_type: string; data: string } }[] }; finishReason?: string }[] };
      const outParts = body.candidates?.[0]?.content?.parts ?? [];
      for (const p of outParts) {
        const d = p.inlineData ?? (p.inline_data ? { mimeType: p.inline_data.mime_type, data: p.inline_data.data } : undefined);
        if (d?.data) return { id: "sync", status: "succeeded", output: `data:${d.mimeType};base64,${d.data}` };
      }
      return { id: "sync", status: "failed", error: `No image returned (${body.candidates?.[0]?.finishReason ?? "unknown reason"}).` };
    },
    async get() {
      return { id: "sync", status: "failed", error: "Gemini renders complete synchronously." };
    },
  };
}

function normalize(p: { id: string; status: string; output?: unknown; error?: unknown }): RenderJob {
  const out = Array.isArray(p.output) ? p.output[0] : p.output;
  return {
    id: p.id,
    status: (["starting", "processing", "succeeded", "failed", "canceled"].includes(p.status) ? p.status : "processing") as RenderJob["status"],
    output: typeof out === "string" ? out : undefined,
    error: p.error ? String(p.error) : undefined,
  };
}

function replicate(token: string, model: string): RenderProvider {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  return {
    id: "replicate",
    usesReferences: false,
    async start({ image, prompt }) {
      const r = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ input: { prompt, input_image: image, output_format: "jpg" } }),
      });
      if (!r.ok) throw new Error(`Render provider error ${r.status}: ${await r.text()}`);
      return normalize(await r.json());
    },
    async get(id) {
      const r = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(id)}`, { headers });
      if (!r.ok) throw new Error(`Render provider error ${r.status}`);
      return normalize(await r.json());
    },
  };
}

export function renderProvider(): RenderProvider | null {
  const cfg = aiConfig();
  // a Homer-specific key so another app's Gemini quota/billing is never used
  const geminiKey = process.env.HOMER_GEMINI_API_KEY;
  if (geminiKey) return gemini(geminiKey, cfg.geminiImageModel);
  const token = process.env.REPLICATE_API_TOKEN;
  if (token) return replicate(token, cfg.replicateModel);
  return null;
}

/** Fetch product photos server-side (only URLs stored in our catalog, never client-supplied URLs). */
export async function loadReferenceImages(items: { label: string; url: string }[], fetchImpl: typeof fetch = fetch): Promise<ReferenceImage[]> {
  const out = await Promise.all(
    items.map(async ({ label, url }) => {
      try {
        if (!/^https:\/\//.test(url)) return null;
        const r = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
        const type = (r.headers.get("content-type") ?? "").split(";")[0].trim();
        if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return null;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.byteLength > 4_000_000) return null;
        return { label, mimeType: type, data: buf.toString("base64") };
      } catch {
        return null;
      }
    }),
  );
  return out.filter((x): x is ReferenceImage => !!x);
}

export function buildRenderPrompt(base: string, style: { wallColor: string; floor: string }, pieces: string[], referenceCount = 0) {
  return [
    "Turn this 3D interior model screenshot into a photorealistic interior photograph.",
    referenceCount
      ? `The ${referenceCount} product reference photo(s) after the snapshot show real products that appear in the room. Replace each matching simplified 3D piece with that exact product, reproducing its design, shape, color, material and details faithfully; keep its position, orientation and size from the snapshot.`
      : "",
    "Keep the exact room geometry, camera angle, furniture positions, sizes and proportions. Do not add, remove or move furniture, walls, doors or windows.",
    `Walls painted ${style.wallColor}; ${style.floor.replace("-", " ")} flooring.`,
    pieces.length ? `Furniture: ${pieces.join(", ")}.` : "",
    "Soft natural light, realistic materials and textures, architectural photography, 24mm lens.",
    base ? `Style direction from the user: ${base}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
