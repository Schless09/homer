import "server-only";

type Effort = "low" | "medium" | "high";
const effort = (v: string | undefined, d: Effort): Effort => (v === "low" || v === "medium" || v === "high" ? v : d);

/**
 * Server-side AI configuration. Keys never leave the server.
 *
 * Cost-first defaults: every user-facing AI call runs on Claude Haiku 5.5.
 * The deterministic solver + validator do the spatial reasoning, so a small
 * model is enough for conversational design. Each task can be escalated
 * independently via env vars (e.g. ANTHROPIC_VISION_MODEL=claude-sonnet-5-5).
 */
/** Gemini key: a Homer-specific one if set, otherwise the shared GEMINI_API_KEY. */
export function geminiKey(): string | undefined {
  return process.env.HOMER_GEMINI_API_KEY || process.env.GEMINI_API_KEY || undefined;
}

/**
 * Model routing:
 *  - AI designer (chat + tool use): Claude Haiku
 *  - product photo look descriptions: Claude Haiku
 *  - floor plan geometry from images: Gemini (falls back to Claude if no Gemini key)
 *  - photorealistic renders with product photos: Gemini image model
 */
export function aiConfig() {
  const base = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
  const claude = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const gemini = !!geminiKey();
  return {
    claude,
    designerModel: process.env.ANTHROPIC_DESIGNER_MODEL || base,
    designerEffort: effort(process.env.ANTHROPIC_DESIGNER_EFFORT, "medium"),
    visionModel: process.env.ANTHROPIC_VISION_MODEL || base,
    visionEffort: effort(process.env.ANTHROPIC_VISION_EFFORT, "medium"),
    floorplanProvider: (gemini ? "gemini" : claude ? "claude" : null) as "gemini" | "claude" | null,
    geminiFloorplanModel: process.env.HOMER_GEMINI_FLOORPLAN_MODEL || "gemini-3.6-flash",
    geminiFloorplanFallback: process.env.HOMER_GEMINI_FLOORPLAN_FALLBACK || "gemini-2.5-flash",
    imageProvider: gemini ? "gemini" : process.env.REPLICATE_API_TOKEN ? "replicate" : null,
    geminiImageModel: process.env.HOMER_GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image",
    geminiImageFallback: process.env.HOMER_GEMINI_IMAGE_FALLBACK || "gemini-2.5-flash-image",
    replicateModel: process.env.REPLICATE_RENDER_MODEL || "black-forest-labs/flux-kontext-pro",
  };
}
