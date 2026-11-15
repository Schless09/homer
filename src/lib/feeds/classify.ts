import type { CategoryId, ModelKind, Style } from "@/lib/catalog/types";

export interface Classification {
  category: CategoryId;
  model: ModelKind;
  /** a built-in sample with the same model kind supplies placement/clearance rules */
  templateId: string;
  rug?: boolean;
}

/**
 * Map a retail product to our catalog taxonomy from its title and feed
 * category. Order matters: specific phrases ("sofa table", "coffee table")
 * are checked before generic words ("sofa", "table").
 */
const RULES: { re: RegExp; c: Classification; not?: RegExp }[] = [
  { re: /\b(tv|media)\s+(stand|console|cabinet|unit)|\bentertainment\s+(center|console)/, c: { category: "tv-stands", model: "tv-stand", templateId: "tv-stand-60" } },
  { re: /\bround\b.*\b(coffee|cocktail)\s+table|\bdrum\s+(coffee\s+)?table/, c: { category: "coffee-tables", model: "round-coffee-table", templateId: "coffee-round-36" } },
  { re: /\b(sofa|console|entry|entryway|hall)\s+table\b|\bconsole\b/, c: { category: "side-tables", model: "console", templateId: "console-table" } },
  { re: /\bcoffee\s+table|cocktail\s+table/, c: { category: "coffee-tables", model: "coffee-table", templateId: "coffee-rect-48" } },
  { re: /\b(side|end|accent|drink|nesting)\s+table/, c: { category: "side-tables", model: "side-table", templateId: "side-table-round" } },
  { re: /\bsectional/, c: { category: "sectionals", model: "sectional", templateId: "sectional-l-96" } },
  { re: /\bloveseat|love\s+seat|settee/, c: { category: "sofas", model: "loveseat", templateId: "loveseat-60" } },
  { re: /\bsofa\s+bed|sleeper\s+sofa/, c: { category: "sofas", model: "sofa", templateId: "sofa-classic-84" } },
  { re: /\bsofa|couch\b/, c: { category: "sofas", model: "sofa", templateId: "sofa-classic-84" } },
  { re: /\bnight\s?stand|bedside\s+table/, c: { category: "nightstands", model: "nightstand", templateId: "nightstand-oak" } },
  { re: /\bday\s?bed/, c: { category: "beds", model: "bed", templateId: "daybed" } },
  { re: /\b(platform|upholstered|panel|canopy|storage|sleigh|poster|metal|wood(en)?)?\s*bed(\s+frame)?\b/, c: { category: "beds", model: "bed", templateId: "bed-queen" }, not: /\bbed\s*(sheet|linen|skirt|spread|side)|bedding|pillow|duvet|comforter|mattress\s+protector/ },
  { re: /\bdresser|chest\s+of\s+drawers|\bchest\b/, c: { category: "dressers", model: "dresser", templateId: "dresser-6" } },
  { re: /\bsideboard|buffet|credenza/, c: { category: "storage", model: "dresser", templateId: "cabinet-low" } },
  { re: /\bwardrobe|armoire/, c: { category: "storage", model: "wardrobe", templateId: "wardrobe" } },
  { re: /\bbook(case|shelf|shelves)|shelving\s+unit|etagere/, c: { category: "storage", model: "bookshelf", templateId: "bookshelf-tall" } },
  { re: /\b(office|task|desk|executive)\s+chair/, c: { category: "desks", model: "office-chair", templateId: "office-chair" } },
  { re: /\bdesk\b/, c: { category: "desks", model: "desk", templateId: "desk-48" } },
  { re: /\b(counter|bar)\s*(height\s+)?stool/, c: { category: "dining-chairs", model: "stool", templateId: "counter-stool" } },
  { re: /\b(dining|side|kitchen)\s+chair/, c: { category: "dining-chairs", model: "chair", templateId: "dining-chair" } },
  { re: /\b(dining|kitchen)\s+bench|\bbench\b/, c: { category: "dining-chairs", model: "bench", templateId: "bench-dining" } },
  { re: /\bround\b.*\b(dining|kitchen|pedestal)\s+table|\bpedestal\s+(dining\s+)?table/, c: { category: "dining-tables", model: "round-table", templateId: "dining-round-48" } },
  { re: /\b(dining|kitchen)\s+table/, c: { category: "dining-tables", model: "dining-table", templateId: "dining-rect-48" } },
  { re: /\b(accent|lounge|arm|club|swivel|reading|barrel|slipper)\s*chair|\barmchair/, c: { category: "chairs", model: "armchair", templateId: "armchair-lounge" } },
  { re: /\bottoman|pouf/, c: { category: "chairs", model: "ottoman", templateId: "ottoman-round" } },
  { re: /\bround\b.*\brug\b/, c: { category: "rugs", model: "round-rug", templateId: "rug-round-6", rug: true } },
  { re: /\b(area\s+)?rug\b/, c: { category: "rugs", model: "rug", templateId: "rug-5x8", rug: true }, not: /\brug\s+pad/ },
  { re: /\bfloor\s+lamp|torchiere|arc\s+lamp/, c: { category: "lamps", model: "floor-lamp", templateId: "floor-lamp-arc" } },
  { re: /\b(table|desk|bedside)\s+lamp/, c: { category: "lamps", model: "table-lamp", templateId: "table-lamp" } },
  { re: /\b(floor|full[-\s]length|leaning)\s+mirror/, c: { category: "decor", model: "mirror", templateId: "mirror-floor" } },
  { re: /\b(faux|artificial|potted)\s+.*(tree|plant)|\b(fiddle|olive|ficus|monstera)\b.*(tree|plant)?/, c: { category: "plants", model: "plant", templateId: "plant-fiddle" } },
  { re: /\b(tv|television)\b/, c: { category: "tvs", model: "tv", templateId: "tv-55" }, not: /\bstand|console|mount/ },
];

export function classifyProduct(title: string, feedCategory = ""): Classification | null {
  const t = `${title} ${feedCategory}`.toLowerCase();
  for (const r of RULES) {
    if (r.re.test(title.toLowerCase()) && !(r.not && r.not.test(t))) return r.c;
  }
  // fall back to the feed's category path if the title alone is ambiguous
  for (const r of RULES) {
    if (r.re.test(t) && !(r.not && r.not.test(t))) return r.c;
  }
  return null;
}

/** Plausible footprint ranges per category; anything outside is a parsing mistake or a non-furniture item. */
export const DIM_RANGES: Record<CategoryId, { w: [number, number]; d: [number, number] }> = {
  sofas: { w: [48, 130], d: [26, 50] },
  sectionals: { w: [70, 180], d: [34, 130] },
  chairs: { w: [14, 50], d: [14, 50] },
  beds: { w: [36, 96], d: [70, 105] },
  nightstands: { w: [10, 36], d: [10, 26] },
  dressers: { w: [20, 90], d: [12, 26] },
  desks: { w: [16, 90], d: [14, 42] },
  "dining-tables": { w: [24, 130], d: [24, 60] },
  "dining-chairs": { w: [12, 80], d: [12, 30] },
  "coffee-tables": { w: [14, 80], d: [14, 50] },
  "side-tables": { w: [8, 84], d: [8, 30] },
  "tv-stands": { w: [24, 110], d: [10, 28] },
  tvs: { w: [20, 90], d: [0.5, 12] },
  rugs: { w: [24, 220], d: [18, 200] },
  lamps: { w: [4, 40], d: [4, 40] },
  plants: { w: [4, 48], d: [4, 48] },
  storage: { w: [12, 110], d: [8, 30] },
  decor: { w: [6, 60], d: [0.5, 30] },
  fixtures: { w: [10, 200], d: [10, 60] },
};

export function guessStyles(text: string): Style[] {
  const t = text.toLowerCase();
  const out: Style[] = [];
  const add = (s: Style, ...words: string[]) => words.some((w) => t.includes(w)) && !out.includes(s) && out.push(s);
  add("mid-century", "mid-century", "midcentury", "mid century", "retro");
  add("scandinavian", "scandinavian", "nordic", "scandi");
  add("industrial", "industrial", "metal frame", "iron");
  add("japandi", "japandi", "japanese");
  add("luxury", "velvet", "marble", "brass", "luxe", "boucle", "bouclé");
  add("boho", "rattan", "cane", "wicker", "jute", "boho");
  add("traditional", "traditional", "tufted", "rolled arm", "classic");
  add("coastal", "coastal", "linen slipcover", "whitewash");
  add("minimalist", "minimal", "clean lines", "low profile");
  if (!out.length) out.push("modern");
  return out;
}
