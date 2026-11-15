import type { CatalogItem, Finish } from "./types";

/**
 * Built-in SAMPLE catalog. Dimensions are realistic for each furniture type, but
 * these are not real retailer products and prices are illustrative estimates.
 * Real product feeds plug in through `CatalogProvider` (see ./provider.ts).
 */

const FAB = {
  cream: { name: "Cream", hex: "#ece4d6" },
  oatmeal: { name: "Oatmeal", hex: "#d8cbb5" },
  charcoal: { name: "Charcoal", hex: "#3d3d3f" },
  slate: { name: "Slate blue", hex: "#5b6b7a" },
  olive: { name: "Olive", hex: "#6f7350" },
  terracotta: { name: "Terracotta", hex: "#b4654a" },
  cognac: { name: "Cognac leather", hex: "#8a4f2a" },
  ivory: { name: "Ivory bouclé", hex: "#f2ede3" },
  sage: { name: "Sage", hex: "#9aa58b" },
  navy: { name: "Navy velvet", hex: "#26344f" },
  blush: { name: "Blush", hex: "#d9b5a6" },
} satisfies Record<string, Finish>;

const WOOD = {
  oak: { name: "Natural oak", hex: "#c49a6c" },
  whiteOak: { name: "White oak", hex: "#d8c3a0" },
  walnut: { name: "Walnut", hex: "#6b4429" },
  black: { name: "Black", hex: "#232323" },
  white: { name: "White", hex: "#f4f2ee" },
  ash: { name: "Ash", hex: "#e2d5bd" },
  teak: { name: "Teak", hex: "#9c6a3f" },
} satisfies Record<string, Finish>;

const METAL = {
  black: { name: "Matte black", hex: "#1f1f1f" },
  brass: { name: "Brass", hex: "#b8955a" },
  chrome: { name: "Chrome", hex: "#c9cdd1" },
} satisfies Record<string, Finish>;

const GREEN = { name: "Foliage", hex: "#4f7a4a" };

type Draft = Omit<CatalogItem, "source" | "clearance" | "roomTypes" | "layer" | "placement" | "materials"> &
  Partial<Pick<CatalogItem, "clearance" | "roomTypes" | "layer" | "placement" | "materials">>;

const item = (d: Draft): CatalogItem => ({
  placement: "wall",
  layer: "floor",
  clearance: {},
  roomTypes: ["living", "studio"],
  materials: [],
  source: "sample",
  ...d,
});

export const CATALOG: CatalogItem[] = [
  // ───── Sofas ─────
  item({ id: "sofa-apartment-72", name: "Apartment Sofa 72\"", category: "sofas", model: "sofa", width: 72, depth: 34, height: 32, price: 899, styles: ["modern", "minimalist", "scandinavian"], colors: [FAB.oatmeal, FAB.charcoal, FAB.sage, FAB.slate], materials: ["Linen blend", "Performance weave"], description: "Compact three-seat sofa sized for studios and small living rooms.", clearance: { front: 16 } }),
  item({ id: "sofa-classic-84", name: "Track Arm Sofa 84\"", category: "sofas", model: "sofa", width: 84, depth: 36, height: 33, price: 1299, styles: ["modern", "mid-century", "minimalist"], colors: [FAB.cream, FAB.charcoal, FAB.olive, FAB.navy], materials: ["Linen blend", "Velvet", "Performance weave"], description: "Standard three-seat sofa with track arms and deep cushions.", clearance: { front: 16 } }),
  item({ id: "sofa-lounge-90", name: "Deep Lounge Sofa 90\"", category: "sofas", model: "sofa", width: 90, depth: 40, height: 30, price: 1890, styles: ["luxury", "modern", "coastal"], colors: [FAB.ivory, FAB.oatmeal, FAB.charcoal], materials: ["Bouclé", "Linen"], description: "Low, extra-deep lounge sofa with loose back cushions.", clearance: { front: 16 } }),
  item({ id: "sofa-leather-80", name: "Leather Sofa 80\"", category: "sofas", model: "sofa", width: 80, depth: 35, height: 31, price: 2290, styles: ["mid-century", "industrial", "traditional"], colors: [FAB.cognac, FAB.charcoal], materials: ["Top-grain leather"], description: "Mid-century leather sofa on tapered wood legs.", clearance: { front: 16 } }),
  item({ id: "loveseat-60", name: "Loveseat 60\"", category: "sofas", model: "loveseat", width: 60, depth: 33, height: 32, price: 749, styles: ["modern", "scandinavian", "boho"], colors: [FAB.oatmeal, FAB.terracotta, FAB.sage, FAB.blush], materials: ["Linen blend"], description: "Two-seat loveseat for tight living areas.", clearance: { front: 16 } }),

  // ───── Sectionals ─────
  item({ id: "sectional-l-96", name: "L Sectional 96\"", category: "sectionals", model: "sectional", width: 96, depth: 66, height: 32, price: 1690, styles: ["modern", "minimalist"], colors: [FAB.oatmeal, FAB.charcoal, FAB.slate], materials: ["Performance weave", "Linen blend"], description: "Apartment-scale sectional with a reversible chaise.", clearance: { front: 16 } }),
  item({ id: "sectional-l-112", name: "Modular Sectional 112\"", category: "sectionals", model: "sectional", width: 112, depth: 74, height: 31, price: 2490, styles: ["modern", "luxury", "coastal"], colors: [FAB.ivory, FAB.cream, FAB.charcoal], materials: ["Bouclé", "Performance weave"], description: "Generous modular sectional with deep seats.", clearance: { front: 16 } }),
  item({ id: "sectional-l-124", name: "Grand Sectional 124\"", category: "sectionals", model: "sectional", width: 124, depth: 86, height: 31, price: 3290, styles: ["luxury", "modern"], colors: [FAB.cream, FAB.oatmeal, FAB.navy], materials: ["Velvet", "Linen"], description: "Large L sectional for open-plan living rooms.", clearance: { front: 16 } }),

  // ───── Lounge chairs ─────
  item({ id: "armchair-lounge", name: "Lounge Armchair", category: "chairs", model: "armchair", width: 32, depth: 34, height: 31, price: 649, styles: ["modern", "mid-century", "scandinavian"], colors: [FAB.oatmeal, FAB.cognac, FAB.olive, FAB.ivory], materials: ["Bouclé", "Leather", "Linen"], description: "Low-slung accent chair.", placement: "free", clearance: { front: 12 } }),
  item({ id: "armchair-swivel", name: "Swivel Chair", category: "chairs", model: "armchair", width: 30, depth: 30, height: 29, price: 549, styles: ["modern", "luxury", "boho"], colors: [FAB.ivory, FAB.terracotta, FAB.sage], materials: ["Bouclé", "Velvet"], description: "Rounded swivel chair.", placement: "free", clearance: { front: 12 } }),
  item({ id: "ottoman-round", name: "Round Ottoman", category: "chairs", model: "ottoman", width: 24, depth: 24, height: 17, price: 229, styles: ["boho", "modern", "luxury"], colors: [FAB.ivory, FAB.cognac, FAB.sage], materials: ["Bouclé", "Leather"], description: "Pouf-style ottoman.", placement: "free" }),

  // ───── Beds ─────
  item({ id: "bed-twin", name: "Twin Platform Bed", category: "beds", model: "bed", width: 41, depth: 77, height: 36, price: 349, styles: ["minimalist", "scandinavian"], colors: [WOOD.oak, WOOD.white, WOOD.walnut], materials: ["Solid wood"], description: "Twin platform bed (mattress 38\" × 75\").", roomTypes: ["bedroom", "studio", "office"], clearance: { front: 18, sides: 0 } }),
  item({ id: "bed-full", name: "Full Platform Bed", category: "beds", model: "bed", width: 56, depth: 78, height: 38, price: 499, styles: ["minimalist", "scandinavian", "japandi"], colors: [WOOD.oak, WOOD.walnut, WOOD.black], materials: ["Solid wood"], description: "Full platform bed (mattress 54\" × 75\").", roomTypes: ["bedroom", "studio"], clearance: { front: 18, sides: 18 } }),
  item({ id: "bed-queen", name: "Queen Platform Bed", category: "beds", model: "bed", width: 64, depth: 86, height: 40, price: 799, styles: ["modern", "minimalist", "japandi", "scandinavian"], colors: [WOOD.oak, WOOD.walnut, WOOD.whiteOak, WOOD.black], materials: ["Solid wood", "Upholstered headboard"], description: "Queen platform bed (mattress 60\" × 80\").", roomTypes: ["bedroom", "studio"], clearance: { front: 24, sides: 24 } }),
  item({ id: "bed-queen-upholstered", name: "Queen Upholstered Bed", category: "beds", model: "bed", width: 66, depth: 88, height: 50, price: 1190, styles: ["luxury", "modern", "traditional"], colors: [FAB.ivory, FAB.oatmeal, FAB.charcoal, FAB.navy], materials: ["Linen", "Velvet", "Bouclé"], description: "Queen bed with a tall channel-tufted headboard.", roomTypes: ["bedroom", "studio"], clearance: { front: 24, sides: 24 } }),
  item({ id: "bed-king", name: "King Platform Bed", category: "beds", model: "bed", width: 80, depth: 86, height: 40, price: 1190, styles: ["modern", "minimalist", "japandi"], colors: [WOOD.oak, WOOD.walnut, WOOD.black], materials: ["Solid wood"], description: "King platform bed (mattress 76\" × 80\").", roomTypes: ["bedroom"], clearance: { front: 24, sides: 24 } }),
  item({ id: "daybed", name: "Daybed", category: "beds", model: "bed", width: 80, depth: 41, height: 32, price: 690, styles: ["scandinavian", "boho", "minimalist"], colors: [WOOD.ash, WOOD.black, WOOD.walnut], materials: ["Solid wood"], description: "Twin daybed that doubles as a sofa.", roomTypes: ["studio", "office", "living"], clearance: { front: 18 } }),

  // ───── Nightstands ─────
  item({ id: "nightstand-oak", name: "Two-Drawer Nightstand", category: "nightstands", model: "nightstand", width: 20, depth: 16, height: 24, price: 199, styles: ["modern", "scandinavian", "japandi", "minimalist"], colors: [WOOD.oak, WOOD.walnut, WOOD.white, WOOD.black], materials: ["Solid wood"], description: "Compact two-drawer nightstand.", roomTypes: ["bedroom", "studio"] }),
  item({ id: "nightstand-wide", name: "Wide Nightstand", category: "nightstands", model: "nightstand", width: 26, depth: 18, height: 24, price: 279, styles: ["mid-century", "luxury", "traditional"], colors: [WOOD.walnut, WOOD.teak, WOOD.white], materials: ["Walnut veneer"], description: "Wide nightstand with a drawer and open shelf.", roomTypes: ["bedroom", "studio"] }),

  // ───── Dressers ─────
  item({ id: "dresser-6", name: "Six-Drawer Dresser", category: "dressers", model: "dresser", width: 60, depth: 19, height: 32, price: 899, styles: ["modern", "mid-century", "minimalist"], colors: [WOOD.walnut, WOOD.oak, WOOD.white], materials: ["Solid wood"], description: "Low six-drawer dresser.", roomTypes: ["bedroom", "studio"], clearance: { front: 30 } }),
  item({ id: "dresser-tall", name: "Tall Dresser", category: "dressers", model: "dresser", width: 34, depth: 18, height: 48, price: 649, styles: ["scandinavian", "minimalist", "traditional"], colors: [WOOD.oak, WOOD.white, WOOD.black], materials: ["Solid wood"], description: "Five-drawer tall chest with a small footprint.", roomTypes: ["bedroom", "studio"], clearance: { front: 30 } }),

  // ───── Desks ─────
  item({ id: "desk-48", name: "Writing Desk 48\"", category: "desks", model: "desk", width: 48, depth: 24, height: 30, price: 349, styles: ["modern", "scandinavian", "minimalist"], colors: [WOOD.oak, WOOD.white, WOOD.walnut], materials: ["Solid wood", "Steel"], description: "Compact writing desk.", roomTypes: ["office", "studio", "bedroom", "living"], clearance: { front: 30 } }),
  item({ id: "desk-60", name: "Work Desk 60\"", category: "desks", model: "desk", width: 60, depth: 28, height: 30, price: 549, styles: ["modern", "industrial", "mid-century"], colors: [WOOD.walnut, WOOD.oak, WOOD.black], materials: ["Solid wood", "Steel"], description: "Full-size desk with room for two monitors.", roomTypes: ["office", "studio", "bedroom", "living"], clearance: { front: 30 } }),
  item({ id: "desk-standing", name: "Standing Desk 55\"", category: "desks", model: "desk", width: 55, depth: 28, height: 29, price: 649, styles: ["modern", "minimalist", "industrial"], colors: [WOOD.oak, WOOD.white, WOOD.black], materials: ["Bamboo", "Steel"], description: "Height-adjustable desk (29\"–48\").", roomTypes: ["office", "studio", "bedroom", "living"], clearance: { front: 30 } }),
  item({ id: "office-chair", name: "Task Chair", category: "desks", model: "office-chair", width: 26, depth: 26, height: 40, price: 399, styles: ["modern", "minimalist", "industrial"], colors: [FAB.charcoal, FAB.oatmeal], materials: ["Mesh", "Knit"], description: "Ergonomic task chair.", placement: "free", roomTypes: ["office", "studio", "bedroom", "living"] }),

  // ───── Dining ─────
  item({ id: "dining-round-36", name: "Round Dining Table 36\"", category: "dining-tables", model: "round-table", width: 36, depth: 36, height: 30, price: 449, styles: ["scandinavian", "mid-century", "minimalist"], colors: [WOOD.oak, WOOD.white, WOOD.walnut], materials: ["Solid wood"], description: "Pedestal table that seats 2–3.", placement: "free", roomTypes: ["dining", "kitchen", "studio", "living"], clearance: { all: 30 } }),
  item({ id: "dining-round-48", name: "Round Dining Table 48\"", category: "dining-tables", model: "round-table", width: 48, depth: 48, height: 30, price: 790, styles: ["japandi", "modern", "traditional"], colors: [WOOD.oak, WOOD.walnut, WOOD.black], materials: ["Solid wood"], description: "Pedestal table that seats 4.", placement: "free", roomTypes: ["dining", "kitchen", "living"], clearance: { all: 30 } }),
  item({ id: "dining-rect-48", name: "Dining Table 48\"", category: "dining-tables", model: "dining-table", width: 48, depth: 30, height: 30, price: 549, styles: ["modern", "scandinavian", "minimalist"], colors: [WOOD.oak, WOOD.walnut, WOOD.white], materials: ["Solid wood"], description: "Rectangular table that seats 4.", placement: "free", roomTypes: ["dining", "kitchen", "studio", "living"], clearance: { all: 30 } }),
  item({ id: "dining-rect-72", name: "Dining Table 72\"", category: "dining-tables", model: "dining-table", width: 72, depth: 38, height: 30, price: 1190, styles: ["modern", "luxury", "industrial", "traditional"], colors: [WOOD.walnut, WOOD.oak, WOOD.black], materials: ["Solid wood", "Marble"], description: "Rectangular table that seats 6.", placement: "free", roomTypes: ["dining", "living"], clearance: { all: 32 } }),
  item({ id: "dining-chair", name: "Dining Chair", category: "dining-chairs", model: "chair", width: 19, depth: 21, height: 31, price: 149, styles: ["scandinavian", "modern", "mid-century", "minimalist"], colors: [WOOD.oak, WOOD.black, WOOD.walnut, WOOD.white], materials: ["Solid wood", "Woven seat"], description: "Armless dining chair.", placement: "free", roomTypes: ["dining", "kitchen", "studio", "living"] }),
  item({ id: "dining-chair-upholstered", name: "Upholstered Dining Chair", category: "dining-chairs", model: "chair", width: 20, depth: 23, height: 32, price: 229, styles: ["luxury", "modern", "traditional"], colors: [FAB.ivory, FAB.cognac, FAB.charcoal], materials: ["Bouclé", "Leather"], description: "Curved-back upholstered dining chair.", placement: "free", roomTypes: ["dining", "kitchen", "studio", "living"] }),
  item({ id: "counter-stool", name: "Counter Stool", category: "dining-chairs", model: "stool", width: 17, depth: 17, height: 26, price: 129, styles: ["modern", "industrial", "scandinavian"], colors: [WOOD.oak, WOOD.black, WOOD.walnut], materials: ["Solid wood", "Steel"], description: "26\" counter-height stool.", placement: "free", roomTypes: ["kitchen", "studio", "dining"] }),
  item({ id: "bench-dining", name: "Dining Bench", category: "dining-chairs", model: "bench", width: 48, depth: 15, height: 18, price: 299, styles: ["scandinavian", "japandi", "boho"], colors: [WOOD.oak, WOOD.walnut], materials: ["Solid wood"], description: "Backless bench that seats two.", placement: "free", roomTypes: ["dining", "entry", "bedroom", "studio"] }),

  // ───── Coffee & side tables ─────
  item({ id: "coffee-rect-48", name: "Coffee Table 48\"", category: "coffee-tables", model: "coffee-table", width: 48, depth: 24, height: 16, price: 349, styles: ["modern", "scandinavian", "minimalist", "mid-century"], colors: [WOOD.oak, WOOD.walnut, WOOD.black, WOOD.white], materials: ["Solid wood"], description: "Low rectangular coffee table.", placement: "free" }),
  item({ id: "coffee-round-36", name: "Round Coffee Table 36\"", category: "coffee-tables", model: "round-coffee-table", width: 36, depth: 36, height: 15, price: 399, styles: ["japandi", "boho", "modern", "luxury"], colors: [WOOD.oak, WOOD.walnut, { name: "Travertine", hex: "#d9cbb3" }], materials: ["Solid wood", "Travertine"], description: "Round drum coffee table.", placement: "free" }),
  item({ id: "coffee-marble-52", name: "Marble Coffee Table 52\"", category: "coffee-tables", model: "coffee-table", width: 52, depth: 28, height: 14, price: 990, styles: ["luxury", "modern"], colors: [{ name: "White marble", hex: "#ece9e4" }, { name: "Nero marble", hex: "#2b2a29" }], materials: ["Marble"], description: "Slab marble coffee table.", placement: "free" }),
  item({ id: "side-table-round", name: "Round Side Table", category: "side-tables", model: "side-table", width: 18, depth: 18, height: 22, price: 149, styles: ["modern", "scandinavian", "mid-century", "boho"], colors: [WOOD.oak, WOOD.walnut, METAL.black, METAL.brass], materials: ["Solid wood", "Metal"], description: "Small round side table.", placement: "free" }),
  item({ id: "console-table", name: "Console Table 48\"", category: "side-tables", model: "console", width: 48, depth: 14, height: 30, price: 399, styles: ["modern", "traditional", "luxury"], colors: [WOOD.walnut, WOOD.oak, METAL.brass], materials: ["Solid wood"], description: "Slim console for entries or behind a sofa.", roomTypes: ["entry", "living", "studio"] }),

  // ───── TV ─────
  item({ id: "tv-stand-60", name: "Media Console 60\"", category: "tv-stands", model: "tv-stand", width: 60, depth: 17, height: 22, price: 449, styles: ["modern", "mid-century", "scandinavian", "minimalist"], colors: [WOOD.walnut, WOOD.oak, WOOD.white, WOOD.black], materials: ["Solid wood"], description: "Low media console with sliding doors.", roomTypes: ["living", "studio", "bedroom"], clearance: { front: 24 } }),
  item({ id: "tv-stand-72", name: "Media Console 72\"", category: "tv-stands", model: "tv-stand", width: 72, depth: 18, height: 22, price: 690, styles: ["modern", "luxury", "japandi"], colors: [WOOD.walnut, WOOD.oak, WOOD.black], materials: ["Solid wood"], description: "Long media console for 65\"+ TVs.", roomTypes: ["living", "studio"], clearance: { front: 24 } }),
  item({ id: "tv-55", name: "55\" TV", category: "tvs", model: "tv", width: 49, depth: 3, height: 28, price: 499, styles: ["modern", "minimalist", "industrial", "scandinavian", "mid-century", "japandi", "luxury", "boho", "traditional", "coastal"], colors: [{ name: "Black", hex: "#111111" }], materials: [], description: "55\" flat-screen TV (viewing distance 7–11 ft).", placement: "onTop", layer: "surface", roomTypes: ["living", "studio", "bedroom"] }),
  item({ id: "tv-65", name: "65\" TV", category: "tvs", model: "tv", width: 57, depth: 3, height: 33, price: 799, styles: ["modern", "minimalist", "industrial", "scandinavian", "mid-century", "japandi", "luxury", "boho", "traditional", "coastal"], colors: [{ name: "Black", hex: "#111111" }], materials: [], description: "65\" flat-screen TV (viewing distance 8–13 ft).", placement: "onTop", layer: "surface", roomTypes: ["living", "studio"] }),

  // ───── Rugs ─────
  item({ id: "rug-5x8", name: "Area Rug 5' × 8'", category: "rugs", model: "rug", width: 96, depth: 60, height: 0.5, price: 249, styles: ["modern", "minimalist", "scandinavian", "boho"], colors: [FAB.cream, FAB.oatmeal, FAB.charcoal, FAB.terracotta], materials: ["Wool", "Jute"], description: "5' × 8' flatweave rug.", placement: "free", layer: "rug", resizable: true }),
  item({ id: "rug-8x10", name: "Area Rug 8' × 10'", category: "rugs", model: "rug", width: 120, depth: 96, height: 0.5, price: 549, styles: ["modern", "luxury", "traditional", "japandi"], colors: [FAB.ivory, FAB.oatmeal, FAB.slate, FAB.terracotta], materials: ["Wool", "Jute"], description: "8' × 10' rug for larger seating groups and queen beds.", placement: "free", layer: "rug", resizable: true }),
  item({ id: "rug-round-6", name: "Round Rug 6'", category: "rugs", model: "round-rug", width: 72, depth: 72, height: 0.5, price: 229, styles: ["boho", "modern", "japandi"], colors: [FAB.cream, FAB.sage, FAB.terracotta], materials: ["Wool", "Jute"], description: "6' round rug, great under a round dining table.", placement: "free", layer: "rug", resizable: true }),

  // ───── Lamps ─────
  item({ id: "floor-lamp-arc", name: "Arc Floor Lamp", category: "lamps", model: "floor-lamp", width: 16, depth: 16, height: 72, price: 249, styles: ["mid-century", "modern", "luxury"], colors: [METAL.brass, METAL.black, METAL.chrome], materials: ["Metal", "Linen shade"], description: "Floor lamp with a linen drum shade.", placement: "corner" }),
  item({ id: "floor-lamp-paper", name: "Paper Floor Lamp", category: "lamps", model: "floor-lamp", width: 14, depth: 14, height: 58, price: 179, styles: ["japandi", "scandinavian", "minimalist", "boho"], colors: [{ name: "Rice paper", hex: "#f5efe2" }], materials: ["Paper", "Oak"], description: "Rice-paper lantern floor lamp.", placement: "corner" }),
  item({ id: "table-lamp", name: "Table Lamp", category: "lamps", model: "table-lamp", width: 12, depth: 12, height: 20, price: 99, styles: ["modern", "scandinavian", "mid-century", "minimalist", "traditional"], colors: [{ name: "Ceramic white", hex: "#f2efe9" }, METAL.brass, { name: "Sand", hex: "#cdb79a" }], materials: ["Ceramic", "Linen shade"], description: "Ceramic table lamp.", placement: "onTop", layer: "surface" }),

  // ───── Plants ─────
  item({ id: "plant-fiddle", name: "Fiddle Leaf Fig", category: "plants", model: "plant", width: 22, depth: 22, height: 66, price: 129, styles: ["modern", "boho", "scandinavian", "coastal", "mid-century"], colors: [GREEN], materials: ["Ceramic pot"], description: "Tall floor plant (artificial or live).", placement: "corner" }),
  item({ id: "plant-olive", name: "Olive Tree", category: "plants", model: "plant", width: 20, depth: 20, height: 60, price: 149, styles: ["japandi", "minimalist", "luxury", "coastal"], colors: [{ name: "Silver-green", hex: "#7d8a6a" }], materials: ["Terracotta pot"], description: "Potted olive tree.", placement: "corner" }),
  item({ id: "plant-small", name: "Potted Plant", category: "plants", model: "plant", width: 14, depth: 14, height: 30, price: 49, styles: ["modern", "boho", "scandinavian", "japandi", "minimalist"], colors: [GREEN], materials: ["Ceramic pot"], description: "Small floor plant.", placement: "corner" }),

  // ───── Storage ─────
  item({ id: "bookshelf-tall", name: "Bookshelf 32\"", category: "storage", model: "bookshelf", width: 32, depth: 13, height: 72, price: 299, styles: ["modern", "scandinavian", "industrial", "minimalist"], colors: [WOOD.oak, WOOD.white, WOOD.walnut, WOOD.black], materials: ["Solid wood", "Steel"], description: "Five-shelf bookcase.", roomTypes: ["living", "studio", "office", "bedroom"], clearance: { front: 24 } }),
  item({ id: "bookshelf-wide", name: "Wide Bookshelf 60\"", category: "storage", model: "bookshelf", width: 60, depth: 15, height: 78, price: 590, styles: ["modern", "mid-century", "traditional"], colors: [WOOD.walnut, WOOD.oak, WOOD.white], materials: ["Solid wood"], description: "Wide bookcase with adjustable shelves.", roomTypes: ["living", "office"], clearance: { front: 24 } }),
  item({ id: "wardrobe", name: "Wardrobe 40\"", category: "storage", model: "wardrobe", width: 40, depth: 23, height: 79, price: 690, styles: ["minimalist", "scandinavian", "modern"], colors: [WOOD.white, WOOD.oak, WOOD.black], materials: ["Engineered wood"], description: "Freestanding two-door wardrobe.", roomTypes: ["bedroom", "studio"], clearance: { front: 30 } }),
  item({ id: "cabinet-low", name: "Sideboard 66\"", category: "storage", model: "dresser", width: 66, depth: 18, height: 30, price: 990, styles: ["mid-century", "modern", "luxury"], colors: [WOOD.walnut, WOOD.oak, WOOD.black], materials: ["Solid wood"], description: "Sideboard for dining or living rooms.", roomTypes: ["dining", "living", "studio"], clearance: { front: 30 } }),
  item({ id: "entry-bench", name: "Entry Bench", category: "storage", model: "bench", width: 36, depth: 15, height: 18, price: 249, styles: ["scandinavian", "japandi", "minimalist"], colors: [WOOD.oak, WOOD.walnut], materials: ["Solid wood"], description: "Shoe bench for the entry.", roomTypes: ["entry", "studio", "living"] }),

  // ───── Decor ─────
  item({ id: "mirror-floor", name: "Floor Mirror", category: "decor", model: "mirror", width: 30, depth: 2, height: 70, price: 249, styles: ["modern", "luxury", "boho", "minimalist"], colors: [METAL.brass, METAL.black, WOOD.oak], materials: ["Glass", "Metal frame"], description: "Leaning full-length mirror.", roomTypes: ["bedroom", "studio", "entry"] }),

  // ───── Fixtures (architectural; placed by floor plans) ─────
  item({ id: "fx-counter", name: "Kitchen Counter", category: "fixtures", model: "counter", width: 96, depth: 25, height: 36, price: 0, styles: [], colors: [{ name: "White quartz", hex: "#eeece8" }], materials: ["Quartz"], description: "Base cabinets with countertop.", roomTypes: ["kitchen"], fixture: true, resizable: true, clearance: { front: 36 } }),
  item({ id: "fx-island", name: "Kitchen Island", category: "fixtures", model: "island", width: 72, depth: 36, height: 36, price: 0, styles: [], colors: [{ name: "White quartz", hex: "#eeece8" }], materials: ["Quartz"], description: "Kitchen island.", roomTypes: ["kitchen"], fixture: true, resizable: true, placement: "free", clearance: { all: 36 } }),
  item({ id: "fx-fridge", name: "Refrigerator", category: "fixtures", model: "fridge", width: 30, depth: 30, height: 70, price: 0, styles: [], colors: [{ name: "Stainless", hex: "#c7c9cb" }], materials: [], description: "Refrigerator.", roomTypes: ["kitchen"], fixture: true, clearance: { front: 36 } }),
  item({ id: "fx-range", name: "Range", category: "fixtures", model: "range", width: 30, depth: 26, height: 36, price: 0, styles: [], colors: [{ name: "Stainless", hex: "#c7c9cb" }], materials: [], description: "Cooking range.", roomTypes: ["kitchen"], fixture: true, clearance: { front: 36 } }),
  item({ id: "fx-sink", name: "Sink Counter", category: "fixtures", model: "sink-counter", width: 36, depth: 25, height: 36, price: 0, styles: [], colors: [{ name: "White quartz", hex: "#eeece8" }], materials: [], description: "Counter with sink.", roomTypes: ["kitchen"], fixture: true, clearance: { front: 36 } }),
  item({ id: "fx-toilet", name: "Toilet", category: "fixtures", model: "toilet", width: 19, depth: 28, height: 30, price: 0, styles: [], colors: [{ name: "White", hex: "#f7f7f5" }], materials: [], description: "Toilet.", roomTypes: ["bathroom"], fixture: true, clearance: { front: 21 } }),
  item({ id: "fx-tub", name: "Bathtub", category: "fixtures", model: "tub", width: 60, depth: 30, height: 20, price: 0, styles: [], colors: [{ name: "White", hex: "#f7f7f5" }], materials: [], description: "Alcove bathtub.", roomTypes: ["bathroom"], fixture: true }),
  item({ id: "fx-shower", name: "Shower", category: "fixtures", model: "shower", width: 36, depth: 36, height: 80, price: 0, styles: [], colors: [{ name: "Glass", hex: "#dfe9ec" }], materials: [], description: "Shower stall.", roomTypes: ["bathroom"], fixture: true }),
  item({ id: "fx-vanity", name: "Vanity", category: "fixtures", model: "vanity", width: 30, depth: 21, height: 34, price: 0, styles: [], colors: [{ name: "White", hex: "#f2f0ec" }], materials: [], description: "Bathroom vanity with sink.", roomTypes: ["bathroom"], fixture: true, clearance: { front: 21 } }),
  item({ id: "fx-closet", name: "Closet", category: "fixtures", model: "closet", width: 60, depth: 26, height: 96, price: 0, styles: [], colors: [{ name: "White", hex: "#efede8" }], materials: [], description: "Built-in reach-in closet.", roomTypes: ["bedroom", "studio", "entry"], fixture: true, resizable: true, clearance: { front: 30 } }),
  item({ id: "fx-washer", name: "Washer/Dryer Stack", category: "fixtures", model: "washer", width: 27, depth: 30, height: 76, price: 0, styles: [], colors: [{ name: "White", hex: "#f2f2f0" }], materials: [], description: "Stacked washer and dryer.", roomTypes: ["laundry", "kitchen", "entry"], fixture: true, clearance: { front: 30 } }),
];

const BY_ID = new Map(CATALOG.map((c) => [c.id, c]));
let version = 0;
const listeners = new Set<() => void>();

export function getCatalogItem(id: string): CatalogItem | undefined {
  return BY_ID.get(id);
}

/**
 * Add or refresh retailer products at runtime (browser and server). CATALOG is
 * mutated in place so every consumer (search, solver, AI, editor) sees them.
 */
export function registerCatalogItems(items: CatalogItem[]) {
  let changed = false;
  for (const item of items) {
    const prev = BY_ID.get(item.id);
    if (prev?.source === "sample") continue; // never let a feed shadow a built-in id
    if (prev) CATALOG.splice(CATALOG.indexOf(prev), 1, item);
    else CATALOG.push(item);
    BY_ID.set(item.id, item);
    changed = true;
  }
  if (changed) {
    version++;
    listeners.forEach((l) => l());
  }
}

export function catalogVersion() {
  return version;
}

export function subscribeCatalog(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function requireCatalogItem(id: string): CatalogItem {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`Unknown catalog item: ${id}`);
  return c;
}

export const FIXTURES = CATALOG.filter((c) => c.fixture);
