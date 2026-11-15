"use client";

import { useSyncExternalStore } from "react";
import { catalogVersion, registerCatalogItems, subscribeCatalog } from "@/lib/catalog/items";
import type { CatalogItem } from "@/lib/catalog/types";

let loading: Promise<number> | null = null;

/** Fetch retailer products once per page load and add them to the shared catalog. Resolves with the count. */
export function loadRetailerCatalog(): Promise<number> {
  loading ??= fetch("/api/catalog")
    .then((r) => (r.ok ? (r.json() as Promise<{ items: CatalogItem[] }>) : { items: [] }))
    .then(({ items }) => {
      registerCatalogItems(items);
      return items.length;
    })
    .catch(() => 0);
  return loading;
}

/** Re-render when retailer products arrive. */
export function useCatalogVersion(): number {
  return useSyncExternalStore(subscribeCatalog, catalogVersion, () => 0);
}

export function buyHref(itemId: string, projectId?: string | null, from = "editor") {
  const qs = new URLSearchParams({ from });
  if (projectId) qs.set("p", projectId);
  return `/go/${encodeURIComponent(itemId)}?${qs}`;
}
