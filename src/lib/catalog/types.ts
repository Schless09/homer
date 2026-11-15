import type { RoomType } from "@/lib/scene/types";

export const CATEGORIES = [
  { id: "sofas", label: "Sofas" },
  { id: "sectionals", label: "Sectionals" },
  { id: "chairs", label: "Lounge chairs" },
  { id: "beds", label: "Beds" },
  { id: "nightstands", label: "Nightstands" },
  { id: "dressers", label: "Dressers" },
  { id: "desks", label: "Desks" },
  { id: "dining-tables", label: "Dining tables" },
  { id: "dining-chairs", label: "Dining chairs" },
  { id: "coffee-tables", label: "Coffee tables" },
  { id: "side-tables", label: "Side tables" },
  { id: "tv-stands", label: "TV stands" },
  { id: "tvs", label: "TVs" },
  { id: "rugs", label: "Rugs" },
  { id: "lamps", label: "Lamps" },
  { id: "plants", label: "Plants" },
  { id: "storage", label: "Storage" },
  { id: "decor", label: "Decor" },
  { id: "fixtures", label: "Room fixtures" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const STYLES = [
  "modern",
  "minimalist",
  "scandinavian",
  "mid-century",
  "industrial",
  "japandi",
  "luxury",
  "boho",
  "traditional",
  "coastal",
] as const;
export type Style = (typeof STYLES)[number];

export type ModelKind =
  | "bed"
  | "bunk"
  | "sofa"
  | "sectional"
  | "loveseat"
  | "armchair"
  | "coffee-table"
  | "round-coffee-table"
  | "side-table"
  | "dining-table"
  | "round-table"
  | "chair"
  | "stool"
  | "bench"
  | "desk"
  | "office-chair"
  | "dresser"
  | "nightstand"
  | "wardrobe"
  | "bookshelf"
  | "tv-stand"
  | "tv"
  | "rug"
  | "round-rug"
  | "floor-lamp"
  | "table-lamp"
  | "plant"
  | "ottoman"
  | "console"
  | "mirror"
  | "counter"
  | "island"
  | "fridge"
  | "range"
  | "sink-counter"
  | "toilet"
  | "tub"
  | "shower"
  | "vanity"
  | "closet"
  | "washer";

/** How the layout solver places an item. */
export type Placement =
  | "wall" // back against a wall, facing into the room
  | "free" // anywhere with clearance
  | "corner" // tucked into a corner
  | "onTop"; // sits on another item (TV on stand, lamp on nightstand)

/** Collision layer: rugs sit under furniture; surface items sit on top of other pieces. */
export type Layer = "floor" | "rug" | "surface" | "wall-mounted";

export interface Finish {
  name: string;
  hex: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: CategoryId;
  model: ModelKind;
  width: number;
  depth: number;
  height: number;
  /** sample price in USD; NOT a real retailer price */
  price: number;
  styles: Style[];
  colors: Finish[];
  materials: string[];
  description: string;
  placement: Placement;
  layer: Layer;
  /** recommended clear space (inches) in front of / beside the piece */
  clearance: { front?: number; sides?: number; all?: number };
  roomTypes: RoomType[];
  resizable?: boolean;
  fixture?: boolean;
  /** retailer product page (never shown raw; buy links go through /go/<id> for tracking) */
  productUrl?: string;
  /** GLB/GLTF model if the retailer provides one; procedural geometry is the fallback */
  modelUrl?: string;
  source: "sample" | "retailer" | "user";
  /** ── retailer products only ── */
  retailer?: string;
  network?: AffiliateNetwork;
  externalId?: string;
  imageUrl?: string;
  currency?: string;
  inStock?: boolean;
  /** true when the feed listed width/depth but not height (height then only affects 3D visuals) */
  heightEstimated?: boolean;
  /** where the dimensions came from, e.g. "feed fields", "title", "description" */
  dimsSource?: string;
}

export const AFFILIATE_NETWORKS = ["impact", "cj", "rakuten", "awin", "shareasale", "amazon", "direct"] as const;
export type AffiliateNetwork = (typeof AFFILIATE_NETWORKS)[number];
