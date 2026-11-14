import "server-only";
import { aiConfig } from "./config";

/**
 * Photorealistic rendering is an asynchronous job behind a provider seam.
 * The editable 3D scene stays the source of truth; renders are previews.
 *
 * Provider implemented: Replicate (image-to-image models such as FLUX Kontext),
 * enabled by REPLICATE_API_TOKEN. Without it the feature reports itself as not
 * configured; the app never pretends to render.
 */

export interface RenderJob {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string;
  error?: string;
}

export interface RenderProvider {
  id: string;
  start(input: { image: string; prompt: string }): Promise<RenderJob>;
  get(id: string): Promise<RenderJob>;
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
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return null;
  return replicate(token, cfg.replicateModel);
}

export function buildRenderPrompt(base: string, style: { wallColor: string; floor: string }, pieces: string[]) {
  return [
    "Turn this 3D interior model screenshot into a photorealistic interior photograph.",
    "Keep the exact room geometry, camera angle, furniture positions, sizes and proportions. Do not add, remove or move furniture, walls, doors or windows.",
    `Walls painted ${style.wallColor}; ${style.floor.replace("-", " ")} flooring.`,
    pieces.length ? `Furniture: ${pieces.join(", ")}.` : "",
    "Soft natural light, realistic materials and textures, architectural photography, 24mm lens.",
    base ? `Style direction from the user: ${base}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
