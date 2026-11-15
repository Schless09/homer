import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AppearanceSchema, type Appearance } from "@/lib/catalog/appearance";
import type { CatalogItem } from "@/lib/catalog/types";

/**
 * Read each product photo once (Claude Haiku by default) and record how the
 * piece looks: colors, materials, legs, arms, back, tufting, pattern. Runs at
 * import time only, so shoppers never wait on it and each photo is paid for
 * once (roughly $0.0002 per product on Haiku).
 */

const PROMPT = (item: CatalogItem) => `This is a retail product photo of "${item.name}" (${item.category.replace("-", " ")}).
Describe how the product itself looks (ignore the background, props and styling) so a simple 3D model can match it.
- primaryColor: the dominant color of the main surface (upholstery, top, body) as #rrggbb
- secondaryColor: a clearly different second color (e.g. contrast piping, rug pattern color, lamp shade), else null
- material: main visible surface; frameMaterial: legs/base/frame material (null if none visible)
- legStyle: none if legs aren't visible or it sits on the floor; plinth for a solid recessed base
- legColor: #rrggbb of the legs/base, else null
- armStyle/backStyle/seatCushions: for seating and beds; null when not applicable (backStyle covers headboards)
- tufting, silhouette, pattern (rugs/upholstery), finish
- summary: one short phrase a decorator would use, e.g. "cognac leather sofa with slim walnut tapered legs and sloped arms"
Only describe what is visible.`;

export interface EnrichOptions {
  model?: string;
  concurrency?: number;
  /** existing items by id; photo-based appearance is reused when the image hasn't changed */
  existing?: Map<string, CatalogItem>;
  onProgress?: (done: number, total: number) => void;
}

export function visionModel() {
  return process.env.ANTHROPIC_VISION_MODEL || process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
}

export function canEnrich() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

async function analyze(client: Anthropic, model: string, item: CatalogItem): Promise<Appearance | null> {
  if (!item.imageUrl || !/^https:\/\//.test(item.imageUrl)) return null;
  const res = await client.messages.parse({
    model,
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(AppearanceSchema) },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: item.imageUrl } },
          { type: "text", text: PROMPT(item) },
        ],
      },
    ],
  });
  if (res.stop_reason === "refusal") return null;
  return res.parsed_output ?? null;
}

/** Returns new item objects; items that can't be analyzed keep their text-based appearance. */
export async function enrichAppearance(items: CatalogItem[], opts: EnrichOptions = {}): Promise<{ items: CatalogItem[]; analyzed: number; reused: number; failed: number }> {
  if (!canEnrich()) return { items, analyzed: 0, reused: 0, failed: 0 };
  const client = new Anthropic();
  const model = opts.model ?? visionModel();
  const out = [...items];
  let analyzed = 0;
  let reused = 0;
  let failed = 0;
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < out.length) {
      const i = next++;
      const item = out[i];
      const prev = opts.existing?.get(item.id);
      if (prev?.appearanceSource === "photo" && prev.appearance && prev.imageUrl === item.imageUrl) {
        out[i] = { ...item, appearance: prev.appearance, appearanceSource: "photo", colors: [{ name: item.colors[0]?.name ?? "As shown", hex: prev.appearance.primaryColor }] };
        reused++;
      } else {
        try {
          const a = await analyze(client, model, item);
          if (a) {
            out[i] = { ...item, appearance: a, appearanceSource: "photo", colors: [{ name: item.colors[0]?.name ?? "As shown", hex: a.primaryColor }] };
            analyzed++;
          } else failed++;
        } catch (e) {
          failed++;
          if (e instanceof Anthropic.AuthenticationError) throw e;
          console.warn(`[appearance] ${item.id}:`, e instanceof Error ? e.message : e);
        }
      }
      opts.onProgress?.(++done, out.length);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 4) }, worker));
  return { items: out, analyzed, reused, failed };
}
