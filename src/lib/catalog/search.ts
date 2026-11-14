import { CATALOG } from "./items";
import type { CatalogItem, CategoryId, Style } from "./types";

export interface CatalogQuery {
  text?: string;
  category?: CategoryId | "all";
  style?: Style | "all";
  maxPrice?: number;
  maxWidth?: number;
  maxDepth?: number;
  includeFixtures?: boolean;
}

/**
 * Catalog provider seam. The built-in provider searches the sample catalog;
 * retailer feeds can implement the same interface later.
 */
export interface CatalogProvider {
  id: string;
  search(q: CatalogQuery): CatalogItem[];
}

export const sampleCatalogProvider: CatalogProvider = {
  id: "sample",
  search(q) {
    const text = q.text?.trim().toLowerCase();
    return CATALOG.filter((c) => {
      if (!q.includeFixtures && c.fixture) return false;
      if (q.category && q.category !== "all" && c.category !== q.category) return false;
      if (q.style && q.style !== "all" && !c.styles.includes(q.style)) return false;
      if (q.maxPrice !== undefined && c.price > q.maxPrice) return false;
      if (q.maxWidth !== undefined && c.width > q.maxWidth) return false;
      if (q.maxDepth !== undefined && c.depth > q.maxDepth) return false;
      if (text) {
        const hay = `${c.name} ${c.category} ${c.description} ${c.styles.join(" ")} ${c.materials.join(" ")}`.toLowerCase();
        return text.split(/\s+/).every((t) => hay.includes(t));
      }
      return true;
    });
  },
};

export function searchCatalog(q: CatalogQuery): CatalogItem[] {
  return sampleCatalogProvider.search(q);
}
