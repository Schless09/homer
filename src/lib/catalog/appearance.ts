import { z } from "zod";
import type { ModelKind } from "./types";

/**
 * How a product LOOKS, in a form the 3D models and render prompts can use.
 * Filled at import: from the product photo by a vision model when available,
 * otherwise from the product title/description. Dimensions never come from here.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const MATERIALS = ["linen", "boucle", "velvet", "leather", "wool", "cotton", "wood", "metal", "marble", "stone", "glass", "rattan", "lacquer", "ceramic", "plastic"] as const;
export const LEG_STYLES = ["none", "plinth", "tapered", "turned", "block", "hairpin", "slim-metal", "sled", "pedestal", "x-base", "caster"] as const;
export const ARM_STYLES = ["none", "track", "slope", "rolled", "flared", "rounded"] as const;
export const BACK_STYLES = ["tight", "loose-cushions", "channel", "button-tufted", "slatted", "low", "high", "wingback", "panel"] as const;
export const PATTERNS = ["solid", "striped", "geometric", "diamond", "floral", "distressed", "abstract", "border"] as const;

export const AppearanceSchema = z.object({
  primaryColor: hex,
  secondaryColor: hex.nullable(),
  material: z.enum(MATERIALS),
  frameMaterial: z.enum(MATERIALS).nullable(),
  legStyle: z.enum(LEG_STYLES),
  legColor: hex.nullable(),
  armStyle: z.enum(ARM_STYLES).nullable(),
  backStyle: z.enum(BACK_STYLES).nullable(),
  seatCushions: z.number().int().min(0).max(5).nullable(),
  tufting: z.enum(["none", "button", "channel"]),
  silhouette: z.enum(["boxy", "rounded", "low", "tall"]),
  pattern: z.enum(PATTERNS),
  finish: z.enum(["matte", "satin", "gloss"]),
  summary: z.string().max(160),
});
export type Appearance = z.infer<typeof AppearanceSchema>;
export type MaterialKind = Appearance["material"];

const FABRICS: MaterialKind[] = ["linen", "boucle", "velvet", "leather", "wool", "cotton"];
export const isFabric = (m: MaterialKind | null | undefined) => !!m && FABRICS.includes(m);

const UPHOLSTERED: ModelKind[] = ["sofa", "sectional", "loveseat", "armchair", "ottoman", "office-chair"];

function find<T extends string>(text: string, table: [RegExp, T][]): T | null {
  for (const [re, v] of table) if (re.test(text)) return v;
  return null;
}

const MAT_WORDS: [RegExp, MaterialKind][] = [
  [/boucl/, "boucle"],
  [/velvet|velour|mohair/, "velvet"],
  [/leather|suede|vegan leather|faux leather/, "leather"],
  [/rattan|cane|wicker|seagrass|jute|woven/, "rattan"],
  [/marble|travertine/, "marble"],
  [/concrete|terrazzo|stone|slate/, "stone"],
  [/glass/, "glass"],
  [/lacquer|high[-\s]gloss/, "lacquer"],
  [/ceramic|porcelain/, "ceramic"],
  [/wool/, "wool"],
  [/linen/, "linen"],
  [/cotton|chenille|tweed|performance fabric|polyester|fabric|upholster/, "cotton"],
  [/walnut|oak|ash|teak|acacia|mango wood|solid wood|wood|veneer|birch|pine/, "wood"],
  [/steel|iron|metal|aluminum|brass/, "metal"],
];
const WOOD_HEX: [RegExp, string][] = [
  [/walnut|espresso|dark wood/, "#6b4429"],
  [/white oak|ash|birch|blonde|light wood/, "#d8c3a0"],
  [/teak|acacia|mango|honey/, "#9c6a3f"],
  [/oak|natural wood/, "#c49a6c"],
  [/black|ebon/, "#232323"],
  [/brass|gold/, "#b8955a"],
  [/chrome|nickel|stainless/, "#c9cdd1"],
];

/** Text-only fallback when no vision model is configured. */
export function appearanceFromText(text: string, model: ModelKind, primaryColor: string): Appearance {
  const t = text.toLowerCase();
  const upholstered = UPHOLSTERED.includes(model) || (model === "bed" && /upholster|tufted|channel|velvet|boucl|linen|fabric/.test(t));
  let material = find(t, MAT_WORDS) ?? (upholstered ? "cotton" : "wood");
  if (upholstered && !isFabric(material) && material !== "rattan") material = find(t, MAT_WORDS.filter(([, m]) => isFabric(m))) ?? "cotton";
  const legs =
    find(t, [
      [/hairpin/, "hairpin"],
      [/pedestal|tulip base|drum base/, "pedestal"],
      [/sled|cantilever/, "sled"],
      [/x[-\s]?base|trestle/, "x-base"],
      [/caster|wheel/, "caster"],
      [/turned(?: \w+)? legs?|spindle/, "turned"],
      [/tapered|splayed|mid[-\s]century/, "tapered"],
      [/block leg|bun feet|bun foot/, "block"],
      [/plinth|skirted|floor[-\s]hugging|platform base|no legs/, "plinth"],
      [/metal leg|steel leg|iron leg|brass leg|metal frame|steel frame/, "slim-metal"],
    ] as [RegExp, Appearance["legStyle"]][]) ?? (model === "round-table" ? "pedestal" : model === "rug" || model === "round-rug" || model === "plant" ? "none" : "tapered");
  const legMetal = /metal|steel|iron|brass|chrome|hairpin/.test(t) && legs !== "turned";
  const legColor = find(t.replace(/(?:upholster|fabric|cushion).{0,30}/g, ""), WOOD_HEX) ?? (legMetal ? "#1f1f1f" : "#4a3526");
  const arm = UPHOLSTERED.includes(model)
    ? find(t, [
        [/armless/, "none"],
        [/rolled arm|roll arm|english arm/, "rolled"],
        [/slope|sloped|angled arm/, "slope"],
        [/flared|flare arm/, "flared"],
        [/curved|rounded|round arm|sculptural|barrel/, "rounded"],
        [/track arm|square arm/, "track"],
      ] as [RegExp, Appearance["armStyle"] & string][]) ?? "track"
    : null;
  // "hand-tufted" describes how rugs are made, not upholstery tufting
  const tuftable = upholstered || model === "bed";
  const tufting = !tuftable ? "none" : /channel/.test(t) ? "channel" : /button|(?<!hand[-\s])tufted|chesterfield/.test(t) ? "button" : "none";
  const back = !tuftable ? null : find(t, [
    [/wingback|wing back/, "wingback"],
    [/channel/, "channel"],
    [/button|(?<!hand[-\s])tufted|chesterfield/, "button-tufted"],
    [/slat|spindle back/, "slatted"],
    [/loose (back )?cushion|pillow back|plush/, "loose-cushions"],
    [/low[-\s]back|low[-\s]profile/, "low"],
    [/high[-\s]back/, "high"],
  ] as [RegExp, Appearance["backStyle"] & string][]);
  const pattern =
    model === "rug" || model === "round-rug"
      ? (find(t, [
          [/stripe/, "striped"],
          [/diamond|trellis|moroccan/, "diamond"],
          [/geometric|grid|check/, "geometric"],
          [/floral|botanical|persian|oriental|medallion/, "floral"],
          [/distress|vintage|overdyed|faded/, "distressed"],
          [/abstract|watercolor|marbled/, "abstract"],
          [/border|bordered/, "border"],
        ] as [RegExp, Appearance["pattern"]][]) ?? "solid")
      : "solid";
  const silhouette = /round|curved|sculptural|organic|barrel|drum/.test(t) ? "rounded" : /low[-\s]profile|low[-\s]slung|lounge/.test(t) ? "low" : /tall|high/.test(t) ? "tall" : "boxy";
  const cushions = t.match(/(\d)[-\s](?:seat|cushion)/)?.[1];
  return {
    primaryColor,
    secondaryColor: null,
    material,
    frameMaterial: legMetal ? "metal" : "wood",
    legStyle: legs,
    legColor,
    armStyle: arm,
    backStyle: back ?? (UPHOLSTERED.includes(model) ? "tight" : null),
    seatCushions: cushions ? Math.min(5, Number(cushions)) : null,
    tufting,
    silhouette,
    pattern,
    finish: material === "lacquer" || material === "glass" ? "gloss" : material === "leather" || material === "marble" ? "satin" : "matte",
    summary: text.slice(0, 120),
  };
}

/** Short natural-language description for render prompts. */
export function describeAppearance(a: Appearance): string {
  const parts = [a.summary];
  if (a.legStyle !== "none") parts.push(`${a.legStyle} ${a.frameMaterial ?? ""} legs`.replace(/\s+/g, " "));
  if (a.tufting !== "none") parts.push(`${a.tufting} tufting`);
  if (a.pattern !== "solid") parts.push(`${a.pattern} pattern`);
  return parts.join(", ");
}
