import type { CatalogItem } from "@/lib/catalog/types";

/** Database row for homer_furniture_catalog. */
export function catalogRow(i: CatalogItem) {
  return {
    id: i.id,
    source: "retailer",
    owner_id: null,
    name: i.name,
    category: i.category,
    width_in: i.width,
    depth_in: i.depth,
    height_in: i.height,
    price_usd: i.currency === "USD" ? i.price : null,
    styles: i.styles,
    finishes: i.colors,
    materials: i.materials,
    description: i.description,
    product_url: i.productUrl ?? null,
    image_url: i.imageUrl ?? null,
    model_url: i.modelUrl ?? null,
    retailer: i.retailer ?? null,
    network: i.network ?? null,
    external_id: i.externalId ?? null,
    currency: i.currency ?? "USD",
    in_stock: i.inStock ?? true,
    active: true,
    item: i,
    updated_at: new Date().toISOString(),
  };
}
