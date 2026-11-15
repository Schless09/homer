import { getCatalogItem } from "@/lib/catalog/items";
import type { AffiliateNetwork, CatalogItem } from "@/lib/catalog/types";
import { appearanceFromText } from "@/lib/catalog/appearance";
import { classifyProduct, DIM_RANGES, guessStyles } from "./classify";
import { colorNameToHex } from "./colors";
import { extractDimensions } from "./dimensions";

/**
 * Turn raw affiliate feed rows into catalog items. Rows are rejected (never
 * patched up with guesses) when they can't be classified as furniture or when
 * width and depth aren't stated in the feed.
 */

export interface FeedSource {
  retailer: string;
  network: AffiliateNetwork;
  /** default currency when the feed doesn't say */
  currency?: string;
}

export interface Rejected {
  externalId: string;
  title: string;
  reason: string;
}

export interface NormalizeResult {
  items: CatalogItem[];
  rejected: Rejected[];
}

const ALIASES = {
  id: ["id", "sku", "product_id", "productid", "item_id", "catalog_item_id", "catalogitemid", "unique merchant sku", "merchant_product_id", "asin", "offer_id"],
  title: ["title", "name", "product_name", "productname", "item_name"],
  description: ["description", "long_description", "product_description", "short_description", "desc"],
  url: ["link", "product_url", "producturl", "landing_page_url", "product_page_url", "detailpageurl", "url"],
  tracking: ["tracking_url", "trackingurl", "buy_url", "buyurl", "click_url", "clickurl", "affiliate_url", "deeplink", "aw_deep_link", "linkurl"],
  image: ["image_link", "image_url", "imageurl", "image", "main_image_url", "large_image", "merchant_image_url", "imagelink"],
  model: ["model_url", "3d_model_url", "glb_url", "ar_model_url", "model_3d"],
  price: ["sale_price", "current_price", "currentprice", "search_price", "price", "retail_price", "original_price", "originalprice"],
  currency: ["currency", "price_currency", "currencycode"],
  category: ["product_type", "category", "google_product_category", "merchant_category", "category_name", "product_category"],
  color: ["color", "colour", "color_name", "finish"],
  material: ["material", "materials", "fabric"],
  brand: ["brand", "manufacturer", "brand_name"],
  availability: ["availability", "stock_availability", "in_stock", "stock_status", "instock"],
};

/** Click-tracking hosts of the major affiliate networks. */
export const AFFILIATE_HOSTS = /\/\/([a-z0-9-]+\.)*(sjv\.io|pxf\.io|ojrq\.net|evyy\.net|anrdoezrs\.net|jdoqocy\.com|tkqlhce\.com|dpbolvw\.net|kqzyfj\.com|linksynergy\.com|awin1\.com|shareasale\.com|amzn\.to)\//i;

function get(row: Record<string, unknown>, names: string[]): string {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((x) => x.toLowerCase().replace(/[\s-]+/g, "_") === n.replace(/[\s-]+/g, "_"));
    if (k && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return String(row[k]).trim();
  }
  return "";
}

export function parsePrice(raw: string): { amount: number; currency?: string } | null {
  if (!raw) return null;
  const cur = raw.match(/\b(USD|CAD|EUR|GBP|AUD)\b/i)?.[1]?.toUpperCase() ?? (raw.includes("$") ? "USD" : raw.includes("£") ? "GBP" : raw.includes("€") ? "EUR" : undefined);
  const num = raw.replace(/[^0-9.,]/g, "");
  const normalized = /,\d{2}$/.test(num) && !/\.\d{2}$/.test(num) ? num.replace(/\./g, "").replace(",", ".") : num.replace(/,/g, "");
  const amount = parseFloat(normalized);
  return Number.isFinite(amount) && amount > 0 ? { amount, currency: cur } : null;
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function retailerItemId(retailer: string, externalId: string) {
  return `rt_${slugify(retailer)}_${slugify(externalId)}`;
}

function cleanText(s: string) {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export function normalizeRow(row: Record<string, unknown>, src: FeedSource): CatalogItem | Rejected {
  const externalId = get(row, ALIASES.id);
  const title = cleanText(get(row, ALIASES.title));
  const description = cleanText(get(row, ALIASES.description));
  if (!externalId || !title) return { externalId: externalId || "?", title: title || "?", reason: "missing id or title" };

  const cls = classifyProduct(title, get(row, ALIASES.category));
  if (!cls) return { externalId, title, reason: "not a furniture type we can place" };
  const template = getCatalogItem(cls.templateId);
  if (!template) return { externalId, title, reason: `no template for ${cls.model}` };

  const dims = extractDimensions(row, title, description, { rug: cls.rug });
  if (!dims) return { externalId, title, reason: "width and depth not stated in the feed" };
  let { width, depth } = dims;
  // wall pieces are wider than deep; correct a swapped W/D but never invent numbers
  if (!cls.rug && depth > width && !["bed", "chair", "office-chair", "armchair", "stool", "plant", "floor-lamp", "table-lamp", "ottoman", "side-table", "round-table", "round-coffee-table"].includes(cls.model)) {
    [width, depth] = [depth, width];
  }
  const range = DIM_RANGES[cls.category];
  if (width < range.w[0] || width > range.w[1] || depth < range.d[0] || depth > range.d[1]) {
    return { externalId, title, reason: `dimensions ${Math.round(width)}" × ${Math.round(depth)}" are implausible for ${cls.category}` };
  }

  const url = get(row, ALIASES.url);
  let tracking = get(row, ALIASES.tracking);
  if (!tracking) {
    // Impact and others put the tracking link in a generic "Url" column; recognize it by host
    tracking = Object.values(row).map(String).find((v) => /^https?:\/\//.test(v) && AFFILIATE_HOSTS.test(v)) ?? "";
  }
  if (!url && !tracking) return { externalId, title, reason: "no product link" };
  const price = parsePrice(get(row, ALIASES.price));
  if (!price) return { externalId, title, reason: "no price" };
  const availability = get(row, ALIASES.availability).toLowerCase();
  const color = get(row, ALIASES.color);
  const hex = colorNameToHex(color) ?? colorNameToHex(title);
  const material = get(row, ALIASES.material);
  const brand = get(row, ALIASES.brand);

  const primary = hex ?? template.colors[0]?.hex ?? "#cccccc";
  return {
    ...template,
    appearance: appearanceFromText(`${title}. ${color} ${material}. ${description}`, cls.model, primary),
    appearanceSource: "text",
    id: retailerItemId(src.retailer, externalId),
    name: title.length > 70 ? title.slice(0, 67).trimEnd() + "…" : title,
    category: cls.category,
    model: cls.model,
    width: Math.round(width * 10) / 10,
    depth: Math.round(depth * 10) / 10,
    height: Math.round((dims.height ?? template.height) * 10) / 10,
    heightEstimated: dims.height === undefined,
    dimsSource: dims.source,
    price: Math.round(price.amount * 100) / 100,
    currency: price.currency ?? src.currency ?? "USD",
    styles: guessStyles(`${title} ${description}`),
    colors: hex ? [{ name: color || "As shown", hex }] : template.colors.slice(0, 1),
    materials: material ? [material] : [],
    description: (brand ? `${brand}. ` : "") + (description || title).slice(0, 400),
    resizable: false,
    fixture: false,
    source: "retailer",
    retailer: src.retailer,
    network: src.network,
    externalId,
    productUrl: tracking || url,
    imageUrl: get(row, ALIASES.image) || undefined,
    modelUrl: get(row, ALIASES.model) || undefined,
    inStock: !/out\s*of\s*stock|false|^0$|discontinued/.test(availability),
  };
}

export function normalizeFeed(rows: Record<string, unknown>[], src: FeedSource): NormalizeResult {
  const items: CatalogItem[] = [];
  const rejected: Rejected[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const r = normalizeRow(row, src);
    if ("reason" in r) rejected.push(r);
    else if (!seen.has(r.id)) {
      seen.add(r.id);
      items.push(r);
    }
  }
  return { items, rejected };
}
