import "server-only";
import bundled from "@/data/retailer-catalog.json";
import { publicSupabase } from "@/lib/supabase/server";
import { registerCatalogItems } from "./items";
import type { CatalogItem } from "./types";

/**
 * Retailer products come from two places, merged:
 *  1. src/data/retailer-catalog.json (written by `npm run feed:import -- --out json`)
 *  2. the homer_furniture_catalog table (written by the scheduled feed sync)
 * Results are cached briefly and registered into the shared catalog so the
 * solver and AI designer can use them.
 */

const TTL_MS = 5 * 60 * 1000;
let cache: { at: number; items: CatalogItem[] } | null = null;
let inflight: Promise<CatalogItem[]> | null = null;

async function fromDatabase(): Promise<CatalogItem[]> {
  const sb = publicSupabase();
  if (!sb) return [];
  const out: CatalogItem[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await sb
      .from("homer_furniture_catalog")
      .select("item")
      .eq("source", "retailer")
      .eq("active", true)
      .range(from, from + 999);
    if (error) {
      console.warn("[catalog] database read failed:", error.message);
      break;
    }
    for (const r of data ?? []) if (r.item) out.push(r.item as CatalogItem);
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadRetailerCatalog(): Promise<CatalogItem[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.items;
  inflight ??= (async () => {
    const byId = new Map<string, CatalogItem>();
    for (const i of bundled as CatalogItem[]) byId.set(i.id, i);
    for (const i of await fromDatabase()) byId.set(i.id, i);
    const items = [...byId.values()];
    registerCatalogItems(items);
    cache = { at: Date.now(), items };
    return items;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function findRetailerItem(id: string): Promise<CatalogItem | undefined> {
  return (await loadRetailerCatalog()).find((i) => i.id === id);
}
