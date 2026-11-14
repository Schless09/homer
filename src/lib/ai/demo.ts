import { CATALOG, getCatalogItem } from "@/lib/catalog/items";
import type { ModelKind } from "@/lib/catalog/types";
import type { DesignAction } from "@/lib/scene/actions";
import { applyActions } from "@/lib/scene/actions";
import { polygonArea } from "@/lib/scene/geometry";
import { PALETTES, getPalette, pickColor, type Palette } from "@/lib/scene/palette";
import { fitCheck, generateAlternatives, solveLayout, type PlacementRequest, type Strategy } from "@/lib/scene/solver";
import type { Item, Scene } from "@/lib/scene/types";
import { formatFtIn, formatPrice, formatSqft } from "@/lib/scene/units";
import { sceneMetrics, validateScene } from "@/lib/scene/validate";
import { describePlacement } from "./narrate";
import type { DesignRequest, DesignResponse } from "./types";

/**
 * Built-in, rule-based designer used when no ANTHROPIC_API_KEY is configured.
 * It understands a useful subset of requests and uses the same layout solver,
 * validation and action pipeline as the Claude designer.
 */

interface Wish {
  key: string;
  catalogId: string;
  quantity: number;
}

const has = (t: string, ...words: (string | RegExp)[]) => words.some((w) => (typeof w === "string" ? t.includes(w) : w.test(t)));

function totalArea(scene: Scene) {
  return scene.rooms.filter((r) => !["bathroom", "closet"].includes(r.type)).reduce((s, r) => s + polygonArea(r.polygon), 0);
}

function parseWishes(t: string, scene: Scene): Wish[] {
  const w: Wish[] = [];
  const push = (key: string, catalogId: string, quantity = 1) => {
    if (!w.some((x) => x.key === key)) w.push({ key, catalogId, quantity });
  };
  const big = totalArea(scene) / 144 > 800;
  if (has(t, "king")) push("bed", "bed-king");
  else if (has(t, "queen")) push("bed", has(t, "upholster", "tufted", "luxury") ? "bed-queen-upholstered" : "bed-queen");
  else if (has(t, /\bfull\b/, "double bed")) push("bed", "bed-full");
  else if (has(t, "twin")) push("bed", "bed-twin");
  else if (has(t, "daybed")) push("bed", "daybed");
  else if (has(t, /\bbeds?\b/)) push("bed", "bed-queen");
  if (has(t, "sectional")) push("seating", big || has(t, "large", "big") ? "sectional-l-112" : "sectional-l-96");
  else if (has(t, "loveseat")) push("seating", "loveseat-60");
  else if (has(t, "sofa", "couch")) {
    const m = t.match(/(\d{2,3})\s*(?:"|inch|in\b|-inch)/);
    const target = m ? Number(m[1]) : undefined;
    const sofas = CATALOG.filter((c) => c.category === "sofas");
    const pick = target ? sofas.reduce((a, b) => (Math.abs(b.width - target) < Math.abs(a.width - target) ? b : a)) : undefined;
    push("seating", pick?.id ?? (has(t, "small", "compact", "apartment") || !big ? "sofa-apartment-72" : "sofa-classic-84"));
  }
  if (has(t, /\btv\b/, "television", "media")) {
    push("tvstand", has(t, "65") ? "tv-stand-72" : "tv-stand-60");
    push("tv", has(t, "65") ? "tv-65" : "tv-55");
  }
  if (has(t, "desk", "office", "work from home", "wfh", "workspace")) {
    push("desk", has(t, "standing") ? "desk-standing" : has(t, "large", "two monitor", "dual") ? "desk-60" : "desk-48");
    push("office-chair", "office-chair");
  }
  const diningMatch = t.match(/(?:seat|seats|for)\s*(\d|two|four|six)/);
  const seats = diningMatch ? ({ two: 2, four: 4, six: 6 } as Record<string, number>)[diningMatch[1]] ?? Number(diningMatch[1]) : undefined;
  if (has(t, "dining", "eat", "breakfast", "bistro", "kitchen table")) {
    const n = seats ?? (big ? 4 : 2);
    push("dining", n >= 6 ? "dining-rect-72" : n >= 4 ? "dining-round-48" : "dining-round-36");
    push("chairs", "dining-chair", n);
  }
  if (has(t, "stool", "bar seating")) push("stools", "counter-stool", 2);
  if (has(t, "dresser")) push("dresser", "dresser-6");
  if (has(t, "nightstand", "bedside")) push("nightstand", "nightstand-oak", 2);
  if (has(t, "bookshel", "bookcase", "books")) push("books", "bookshelf-tall");
  if (has(t, "wardrobe", "armoire")) push("wardrobe", "wardrobe");
  if (has(t, "armchair", "accent chair", "reading chair", "lounge chair")) push("armchair", "armchair-lounge");
  if (has(t, "coffee table")) push("coffee", "coffee-rect-48");
  if (has(t, /\brugs?\b/)) push("rug", big ? "rug-8x10" : "rug-5x8");
  if (has(t, "plant", "greenery")) push("plant", "plant-fiddle");
  if (has(t, "lamp", "lighting")) push("lamp", "floor-lamp-arc");
  if (has(t, "mirror")) push("mirror", "mirror-floor");
  if (has(t, "bench")) push("bench", "bench-dining");
  return w;
}

function complement(wishes: Wish[], scene: Scene): Wish[] {
  const out = [...wishes];
  const keys = new Set(wishes.map((w) => w.key));
  const add = (key: string, catalogId: string, quantity = 1) => {
    if (!keys.has(key)) {
      keys.add(key);
      out.push({ key, catalogId, quantity });
    }
  };
  if (keys.has("bed")) {
    add("nightstand", "nightstand-oak", 2);
    add("table-lamp", "table-lamp");
  }
  if (keys.has("seating")) {
    add("coffee", keys.has("seating") && wishes.find((w) => w.key === "seating")?.catalogId.startsWith("sectional") ? "coffee-round-36" : "coffee-rect-48");
    add("rug", totalArea(scene) / 144 > 800 ? "rug-8x10" : "rug-5x8");
    add("lamp", "floor-lamp-arc");
  }
  if (keys.has("tv") && !keys.has("tvstand")) add("tvstand", "tv-stand-60");
  if (keys.has("desk")) add("office-chair", "office-chair");
  add("plant", "plant-olive");
  return out;
}

function defaultWishes(scene: Scene): Wish[] {
  const bedrooms = scene.rooms.filter((r) => r.type === "bedroom");
  const isStudio = scene.rooms.some((r) => r.type === "studio") || bedrooms.length === 0;
  const big = totalArea(scene) / 144 > 800;
  const w: Wish[] = [
    { key: "bed", catalogId: "bed-queen", quantity: 1 },
    { key: "nightstand", catalogId: "nightstand-oak", quantity: 2 },
    { key: "table-lamp", catalogId: "table-lamp", quantity: 1 },
    { key: "seating", catalogId: isStudio ? "sectional-l-96" : big ? "sofa-classic-84" : "sofa-apartment-72", quantity: 1 },
    { key: "coffee", catalogId: isStudio ? "coffee-round-36" : "coffee-rect-48", quantity: 1 },
    { key: "tvstand", catalogId: "tv-stand-60", quantity: 1 },
    { key: "tv", catalogId: "tv-55", quantity: 1 },
    { key: "rug", catalogId: big ? "rug-8x10" : "rug-5x8", quantity: 1 },
    { key: "lamp", catalogId: "floor-lamp-paper", quantity: 1 },
    { key: "plant", catalogId: "plant-fiddle", quantity: 1 },
    { key: "dining", catalogId: big ? "dining-round-48" : "dining-round-36", quantity: 1 },
    { key: "chairs", catalogId: "dining-chair", quantity: big ? 4 : 2 },
  ];
  if (isStudio) w.push({ key: "desk", catalogId: "desk-48", quantity: 1 }, { key: "office-chair", catalogId: "office-chair", quantity: 1 });
  else {
    w.push({ key: "dresser", catalogId: "dresser-6", quantity: 1 }, { key: "armchair", catalogId: "armchair-lounge", quantity: 1 });
  }
  if (bedrooms.length >= 2) {
    w.push({ key: "bed2", catalogId: "bed-full", quantity: 1 }, { key: "desk", catalogId: "desk-48", quantity: 1 }, { key: "office-chair", catalogId: "office-chair", quantity: 1 });
  }
  return w;
}

function detectPalette(t: string): Palette | undefined {
  if (has(t, "japandi", "japanese", "zen", "wabi")) return getPalette("japandi");
  if (has(t, "luxury", "luxe", "elegant", "glam", "high-end", "upscale")) return getPalette("modern-luxury");
  if (has(t, "mid-century", "midcentury", "retro", "mcm")) return getPalette("mid-century");
  if (has(t, "industrial", "loft")) return getPalette("industrial");
  if (has(t, "coastal", "beach", "airy")) return getPalette("coastal");
  if (has(t, "boho", "bohemian", "eclectic")) return getPalette("boho");
  if (has(t, "moody", "dark", "dramatic")) return getPalette("moody");
  if (has(t, "warm", "minimal", "scandi", "scandinavian", "cozy", "oak", "cream")) return getPalette("warm-minimal");
  return undefined;
}

function detectBudget(t: string): number | undefined {
  const m = t.match(/\$\s?([\d,.]+)\s*(k)?/) ?? t.match(/([\d,.]+)\s*(k)?\s*(?:dollars|budget)/);
  if (!m) return undefined;
  const v = parseFloat(m[1].replace(/,/g, ""));
  return m[2] ? v * 1000 : v;
}

function detectStrategy(t: string): Strategy {
  if (has(t, "open space", "open floor", "more space", "maximize space", "spacious", "open up")) return "open";
  if (has(t, "functional", "practical", "work", "efficient")) return "functional";
  return "design";
}

/** Bring the sample total under budget: drop decor first, then step core pieces down one tier at a time (never below a usable size). */
function fitBudget(wishes: Wish[], budget: number): { wishes: Wish[]; dropped: string[] } {
  const priceOf = (ws: Wish[]) => ws.reduce((s, w) => s + (getCatalogItem(w.catalogId)?.price ?? 0) * w.quantity, 0);
  let ws = wishes.map((w) => ({ ...w }));
  const dropped: string[] = [];
  for (const key of ["plant", "mirror", "books", "bench", "lamp", "armchair", "table-lamp"]) {
    if (priceOf(ws) <= budget) break;
    const idx = ws.findIndex((w) => w.key === key);
    if (idx >= 0) {
      dropped.push(getCatalogItem(ws[idx].catalogId)!.name);
      ws = ws.filter((_, i) => i !== idx);
    }
  }
  const minWidth: Partial<Record<string, number>> = { beds: 56, sofas: 72, sectionals: 90 };
  let guard = 0;
  while (priceOf(ws) > budget && guard++ < 40) {
    const ranked = [...ws].sort((a, b) => getCatalogItem(b.catalogId)!.price * b.quantity - getCatalogItem(a.catalogId)!.price * a.quantity);
    let swapped = false;
    for (const w of ranked) {
      const c = getCatalogItem(w.catalogId)!;
      const next = CATALOG.filter(
        (x) => !x.fixture && x.price < c.price && (x.category === c.category || (c.category === "sectionals" && x.category === "sofas")) && x.width >= (minWidth[x.category] ?? 0),
      ).sort((a, b) => b.price - a.price)[0];
      if (next) {
        w.catalogId = next.id;
        swapped = true;
        break;
      }
    }
    if (!swapped) {
      const idx = ws.findIndex((w) => ["rug", "coffee", "dresser", "tvstand", "tv"].includes(w.key));
      if (idx < 0) break;
      dropped.push(getCatalogItem(ws[idx].catalogId)!.name);
      ws = ws.filter((_, i) => i !== idx);
    }
  }
  return { wishes: ws, dropped };
}

const toRequests = (ws: Wish[]): PlacementRequest[] => ws.map((w) => ({ catalogId: w.catalogId, quantity: w.quantity }));

function existingRequests(scene: Scene): PlacementRequest[] {
  return scene.items.filter((i) => !i.fixed && !i.locked).map((i) => ({ catalogId: i.catalogId, color: i.color, material: i.material }));
}

function itemsByModel(scene: Scene, models: ModelKind[]): Item[] {
  return scene.items.filter((i) => {
    const c = getCatalogItem(i.catalogId);
    return c && models.includes(c.model);
  });
}

function highlights(scene: Scene, items: Item[]): string[] {
  const keyModels: ModelKind[] = ["bed", "sectional", "sofa", "loveseat", "desk", "round-table", "dining-table", "tv-stand", "dresser"];
  return items
    .filter((i) => keyModels.includes(getCatalogItem(i.catalogId)?.model as ModelKind))
    .slice(0, 6)
    .map((i) => `• ${describePlacement(scene, i)}`);
}

function layoutResponse(
  scene: Scene,
  wishes: Wish[],
  opts: { palette?: Palette; strategy: Strategy; keepExisting: boolean; budget?: number; dropped?: string[]; intro?: string },
): DesignResponse {
  const res = solveLayout(scene, toRequests(wishes), { strategy: opts.strategy, keepExisting: opts.keepExisting, palette: opts.palette, seed: 17 });
  const actions: DesignAction[] = [{ action: "set_layout", items: res.items }];
  if (opts.palette) {
    actions.push({ action: "set_wall_color", color: opts.palette.wallColor }, { action: "set_floor", material: opts.palette.floor });
  }
  const next = applyActions(scene, actions).scene;
  const m = sceneMetrics(next, validateScene(next));
  const lines: string[] = [];
  lines.push(opts.intro ?? `Here's a ${opts.palette ? opts.palette.name.toLowerCase() + " " : ""}layout using ${res.added.length} pieces from the catalog, all at their real dimensions.`);
  const hl = highlights(next, res.added);
  if (hl.length) lines.push("", ...hl);
  lines.push("", `${Math.round(m.openPct * 100)}% of the ${formatSqft(m.totalArea)} stays open floor. Estimated total ${formatPrice(m.totalPrice)} (sample prices).`);
  if (opts.budget !== undefined) {
    lines.push(m.totalPrice <= opts.budget ? `That's within your ${formatPrice(opts.budget)} budget.` : `That's still ${formatPrice(m.totalPrice - opts.budget)} over your ${formatPrice(opts.budget)} budget with the most affordable options I have.`);
    if (opts.dropped?.length) lines.push(`To stay on budget I left out: ${opts.dropped.join(", ")}.`);
  }
  for (const f of res.failed) {
    lines.push(`⚠ ${f.reason}${f.suggestion ? ` A ${f.suggestion.name} (${formatFtIn(f.suggestion.width)} wide) would fit.` : ""}`);
  }
  if (m.warnings + m.errors > 0) lines.push(`I flagged ${m.warnings + m.errors} spacing note(s) in the Space check panel.`);
  lines.push("", "Review the preview, then accept or discard it. You can drag anything afterward.");
  return { provider: "demo", message: lines.join("\n"), title: opts.palette ? `${opts.palette.name} layout` : "New layout", actions };
}

export function runDemoDesigner(req: DesignRequest): DesignResponse {
  const scene = req.scene;
  const t = req.message.toLowerCase();
  const palette = detectPalette(t) ?? getPalette(req.preferences?.style);
  const budget = detectBudget(t) ?? req.preferences?.budget;
  const furnished = scene.items.some((i) => !i.fixed);

  if (!scene.rooms.length) {
    return {
      provider: "demo",
      actions: [],
      message:
        "I need room outlines before I can furnish anything. Use Build → Draw room to trace your rooms over the floor plan (or start from a sample apartment), then ask me again.",
    };
  }

  // ── alternatives
  if (has(t, "three layout", "3 layout", "alternatives", "options", "different layout", "compare", "variations")) {
    const wishes = parseWishes(t, scene);
    const base = wishes.length ? complement(wishes, scene) : furnished ? null : defaultWishes(scene);
    const requests = base ? toRequests(base) : existingRequests(scene);
    const alts = generateAlternatives(scene, requests, { palette, keepExisting: false });
    const lines = [
      `I generated three layouts with the same ${requests.reduce((s, r) => s + (r.quantity ?? 1), 0)} pieces:`,
      "",
      ...alts.map((a) => `• ${a.name}: ${Math.round(a.metrics.openPct * 100)}% open floor, ${a.metrics.warnings + a.metrics.errors} spacing notes${a.failed.length ? `, ${a.failed.length} piece(s) didn't fit` : ""}.`),
      "",
      "Switch between them in the preview bar and accept the one you like. Each stays fully editable.",
    ];
    return {
      provider: "demo",
      message: lines.join("\n"),
      title: "Three layout options",
      actions: [{ action: "set_layout", items: alts[0].items }, ...(palette ? ([{ action: "set_wall_color", color: palette.wallColor }, { action: "set_floor", material: palette.floor }] as DesignAction[]) : [])],
      alternatives: alts,
    };
  }

  // ── fit questions
  if (has(t, "can i fit", "will it fit", "would fit", "does it fit", "is there room", "fit a", "fit an", "room for")) {
    const wishes = parseWishes(t, scene);
    if (!wishes.length) {
      return { provider: "demo", actions: [], message: "Which piece should I check? Try \"Can I fit a king bed?\" or \"Is there room for a 90-inch sofa?\"" };
    }
    const lines: string[] = [];
    const actions: DesignAction[] = [];
    let working = scene;
    for (const w of wishes) {
      const c = getCatalogItem(w.catalogId)!;
      // "Can I fit a king bed?" usually means instead of the current bed
      const same = working.items.filter((i) => !i.fixed && getCatalogItem(i.catalogId)?.model === c.model && i.catalogId !== c.id);
      if (same.length) {
        const old = same[0];
        const oldName = getCatalogItem(old.catalogId)?.name ?? "current piece";
        const carried = working.items.filter((i) => i.elevation > 0 && Math.hypot(i.x - old.x, i.y - old.y) < Math.max(old.width, old.depth) / 2);
        const without = { ...working, items: working.items.filter((i) => i !== old && !carried.includes(i)) };
        const r = fitCheck(without, c.id);
        if (r.fits && r.item) {
          const next = { ...without, items: [...without.items, r.item] };
          lines.push(`✓ Yes. The ${c.name} (${c.width}" × ${c.depth}") fits in place of your ${oldName}: ${describePlacement(next, r.item).replace(c.name + " ", "")}, with every walkway and door swing still clear.`);
          actions.push({ action: "remove_item", item_id: old.id }, { action: "add_item", catalog_id: c.id, x: r.item.x, y: r.item.y, rotation: r.item.rotation, color: old.color && c.colors.some((x) => x.hex === old.color) ? old.color : r.item.color });
          working = next;
        } else {
          const extra = c.width - old.width;
          lines.push(`✗ Not without crowding the room. Swapping your ${oldName} for the ${c.name} adds ${formatFtIn(Math.abs(extra))} of width${r.failure ? ` and ${r.failure.reason.charAt(0).toLowerCase()}${r.failure.reason.slice(1)}` : "."}`);
          if (r.failure?.suggestion) lines.push(`  A ${r.failure.suggestion.name} would fit.`);
        }
        continue;
      }
      const r = fitCheck(working, c.id);
      if (r.fits && r.item) {
        const next = { ...working, items: [...working.items, r.item] };
        lines.push(`✓ Yes, the ${c.name} (${c.width}" × ${c.depth}") fits: ${describePlacement(next, r.item).replace(c.name + " ", "")}, keeping the required clearances.`);
        actions.push({ action: "add_item", catalog_id: c.id, x: r.item.x, y: r.item.y, rotation: r.item.rotation, color: r.item.color });
        working = next;
      } else {
        lines.push(`✗ Not as the room is furnished now. ${r.failure?.reason ?? ""}${r.failure?.suggestion ? ` A ${r.failure.suggestion.name} would fit.` : ""}`);
      }
    }
    if (actions.length) lines.push("", "I staged the placement as a preview so you can see it.");
    return { provider: "demo", message: lines.join("\n"), title: "Fit check", actions };
  }

  // ── face the TV
  if (has(t, "face the tv", "faces the tv", "facing the tv", "toward the tv", "towards the tv")) {
    const seat = itemsByModel(scene, ["sectional", "sofa", "loveseat"])[0];
    const tv = itemsByModel(scene, ["tv-stand", "tv"])[0];
    if (!seat || !tv) return { provider: "demo", actions: [], message: "I need both a sofa and a TV in the room to do that." };
    // move the TV stand to face the seating rather than rotating a wall-anchored sofa
    const without = { ...scene, items: scene.items.filter((i) => i.id !== tv.id && !(i.elevation > 0 && Math.hypot(i.x - tv.x, i.y - tv.y) < 30)) };
    const tvItems = scene.items.filter((i) => i.id === tv.id || (i.elevation > 0 && Math.hypot(i.x - tv.x, i.y - tv.y) < 30));
    const res = solveLayout(without, tvItems.map((i) => ({ catalogId: i.catalogId, color: i.color })), { strategy: "functional", keepExisting: true, seed: 5 });
    if (!res.added.length) return { provider: "demo", actions: [], message: "I couldn't find a wall opposite the sofa with enough clearance for the TV." };
    return {
      provider: "demo",
      title: "TV facing the sofa",
      actions: [{ action: "set_layout", items: res.items.filter((i) => !i.fixed) }],
      message: `I moved the media console to the wall opposite your ${getCatalogItem(seat.catalogId)?.name.toLowerCase()} so the screen is centered on the seating. ${describePlacement({ ...without, items: res.items }, res.added[0])}.`,
    };
  }

  // ── move/better place for X
  const moveMatch = t.match(/(?:better place|better spot|move|relocate|reposition)\s+(?:for\s+)?(?:my\s+|the\s+)?([a-z\- ]+?)(?:\s|$|\?|\.)/);
  if (moveMatch && furnished) {
    const wishes = parseWishes(moveMatch[1] + " " + t, scene);
    const targetModels = wishes.map((w) => getCatalogItem(w.catalogId)!.model);
    const targets = scene.items.filter((i) => !i.fixed && targetModels.includes(getCatalogItem(i.catalogId)!.model));
    if (targets.length) {
      const target = targets[0];
      const children = scene.items.filter((i) => i.elevation > 0 && Math.hypot(i.x - target.x, i.y - target.y) < Math.max(target.width, target.depth) / 2);
      const moving = [target, ...children];
      const without = { ...scene, items: scene.items.filter((i) => !moving.includes(i)) };
      const res = solveLayout(without, moving.map((i) => ({ catalogId: i.catalogId, color: i.color, material: i.material })), { strategy: detectStrategy(t) === "design" ? "functional" : detectStrategy(t), keepExisting: true, seed: 23 });
      if (res.added.length) {
        const placed = res.added[0];
        return {
          provider: "demo",
          title: `New spot for the ${getCatalogItem(target.catalogId)?.name}`,
          actions: [{ action: "set_layout", items: res.items.filter((i) => !i.fixed) }],
          message: `Moved: ${describePlacement({ ...without, items: res.items }, placed)}. This spot keeps its ${getCatalogItem(placed.catalogId)?.clearance.front ? formatFtIn(getCatalogItem(placed.catalogId)!.clearance.front!) + " front clearance" : "clearances"} and stays clear of door swings.`,
        };
      }
      return { provider: "demo", actions: [], message: `I couldn't find a better spot for the ${getCatalogItem(target.catalogId)?.name} without crowding other furniture. Try removing or shrinking a nearby piece.` };
    }
  }

  // ── walkway / clearance questions
  if (has(t, "walk around", "enough room", "clearance", "walkway", "cramped", "tight")) {
    const issues = validateScene(scene);
    const bed = itemsByModel(scene, ["bed"])[0];
    const lines: string[] = [];
    if (issues.length === 0) lines.push("Everything currently passes the space check: no collisions, door swings stay clear, and every piece has its recommended walkway.");
    else {
      lines.push(`I found ${issues.length} spacing note(s):`);
      lines.push(...issues.slice(0, 6).map((i) => `• ${i.message}`));
    }
    if (bed) lines.push("", `The bed: ${describePlacement(scene, bed)}. Beds get 24" walkways on at least one side and 24" at the foot.`);
    if (issues.some((i) => i.severity !== "info") && furnished) {
      const res = solveLayout(scene, existingRequests(scene), { strategy: "open", keepExisting: false, seed: 31 });
      lines.push("", "I rearranged the same furniture to restore the walkways. Accept the preview to apply it.");
      return { provider: "demo", title: "Restore walkways", actions: [{ action: "set_layout", items: res.items }], message: lines.join("\n") };
    }
    return { provider: "demo", actions: [], message: lines.join("\n") };
  }

  // ── maximize open space with existing furniture
  if (furnished && has(t, "open space", "more space", "maximize", "open up", "spacious") && !parseWishes(t, scene).length) {
    return layoutResponse(scene, existingRequests(scene).map((r, i) => ({ key: `k${i}`, catalogId: r.catalogId, quantity: 1 })), {
      strategy: "open",
      keepExisting: false,
      intro: "I rearranged your existing furniture to push pieces toward the walls and corners:",
    });
  }

  // ── restyle only
  const restyle = has(t, "aesthetic", "restyle", "style", "feel like", "look like", "colors", "colour", "palette", "vibe") && (has(t, "keep", "existing", "same furniture") || furnished) && !parseWishes(t, scene).length;
  if (restyle && palette) {
    const actions: DesignAction[] = scene.items
      .filter((i) => !i.fixed)
      .map((i) => ({ action: "set_item_finish" as const, item_id: i.id, color: pickColor(getCatalogItem(i.catalogId)!, palette) }))
      .filter((a) => !!a.color) as DesignAction[];
    actions.push({ action: "set_wall_color", color: palette.wallColor }, { action: "set_floor", material: palette.floor });
    return {
      provider: "demo",
      title: `${palette.name} restyle`,
      actions,
      message: `I kept every piece where it is and moved the finishes to a ${palette.name.toLowerCase()} palette: new wall color, ${palette.floor.replace("-", " ")} flooring, and each piece switched to its closest available finish.`,
    };
  }

  // ── remove
  const removeMatch = has(t, "remove", "get rid of", "delete", "take out");
  if (removeMatch) {
    const wishes = parseWishes(t, scene);
    const models = wishes.map((w) => getCatalogItem(w.catalogId)!.model);
    const targets = scene.items.filter((i) => !i.fixed && models.includes(getCatalogItem(i.catalogId)!.model));
    if (targets.length) {
      return {
        provider: "demo",
        title: "Remove pieces",
        actions: targets.map((i) => ({ action: "remove_item" as const, item_id: i.id })),
        message: `Removing ${targets.map((i) => getCatalogItem(i.catalogId)?.name).join(", ")}.`,
      };
    }
  }

  // ── furnish / add
  const wishes = parseWishes(t, scene);
  const wantsDesign = has(t, "design", "furnish", "layout", "fill", "decorate", "make it", "help me", "maximize", "plan");
  if (wishes.length || wantsDesign || (!furnished && (palette || budget))) {
    const adding = furnished && has(t, "add", "also", "include", "put") && !has(t, "design", "furnish", "redo", "start over");
    let list = wishes.length ? (adding ? wishes : complement(wishes, scene)) : furnished && !wantsDesign ? [] : defaultWishes(scene);
    if (!list.length && furnished) list = existingRequests(scene).map((r, i) => ({ key: `k${i}`, catalogId: r.catalogId, quantity: 1 }));
    let dropped: string[] = [];
    if (budget) ({ wishes: list, dropped } = fitBudget(list, budget));
    return layoutResponse(scene, list, {
      palette,
      strategy: detectStrategy(t),
      keepExisting: adding,
      budget,
      dropped,
      intro: adding ? `Added ${list.map((w) => getCatalogItem(w.catalogId)?.name).join(", ")} without moving your other furniture:` : undefined,
    });
  }

  // ── budget only, on existing furniture
  if (budget && furnished) {
    const list = existingRequests(scene).map((r, i) => ({ key: `k${i}`, catalogId: r.catalogId, quantity: 1 }));
    const { wishes: ws, dropped } = fitBudget(list, budget);
    return layoutResponse(scene, ws, { palette, strategy: "design", keepExisting: false, budget, dropped });
  }

  if (palette) {
    return runDemoDesigner({ ...req, message: `${req.message} restyle keep existing` });
  }

  return {
    provider: "demo",
    actions: [],
    message: [
      "I can help with requests like:",
      "• \"Design this studio with a queen bed, sectional, TV and desk\"",
      "• \"Give me three layouts\"",
      "• \"Can I fit a king bed?\"",
      "• \"Find a better place for my desk\"",
      "• \"Make it feel like a modern luxury apartment\"",
      "• \"Design this room with a $3,000 budget\"",
      "",
      `Available styles: ${PALETTES.map((p) => p.name).join(", ")}.`,
    ].join("\n"),
  };
}

