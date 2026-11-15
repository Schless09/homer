import "server-only";
import { z } from "zod";
import { AFFILIATE_NETWORKS } from "@/lib/catalog/types";
import { adminSupabase } from "@/lib/supabase/server";
import { parseFeed } from "./csv";
import { normalizeFeed, type Rejected } from "./normalize";
import { catalogRow } from "./rows";
import { enrichAppearance } from "./appearance-ai";
import type { CatalogItem } from "@/lib/catalog/types";

export const FeedConfigSchema = z.array(
  z.object({
    retailer: z.string().min(1),
    network: z.enum(AFFILIATE_NETWORKS),
    url: z.string().url(),
    format: z.enum(["csv", "tsv", "json"]).optional(),
    currency: z.string().optional(),
  }),
);
export type FeedConfig = z.infer<typeof FeedConfigSchema>[number];

/** Feeds come from the HOMER_FEEDS env var (JSON), since feed URLs usually embed credentials. */
export function feedsFromEnv(): FeedConfig[] {
  const raw = process.env.HOMER_FEEDS;
  if (!raw) return [];
  return FeedConfigSchema.parse(JSON.parse(raw));
}

export interface SyncReport {
  retailer: string;
  fetched: number;
  imported: number;
  deactivated: number;
  rejected: number;
  sampleRejections: Rejected[];
  photosAnalyzed?: number;
  error?: string;
}

/** Fetch, normalize and upsert one feed; products that vanished from the feed are deactivated. */
export async function syncFeed(feed: FeedConfig): Promise<SyncReport> {
  const report: SyncReport = { retailer: feed.retailer, fetched: 0, imported: 0, deactivated: 0, rejected: 0, sampleRejections: [] };
  const sb = adminSupabase();
  if (!sb) return { ...report, error: "HOMER_SUPABASE_SECRET_KEY is not set" };
  try {
    const res = await fetch(feed.url, { signal: AbortSignal.timeout(90_000) });
    if (!res.ok) throw new Error(`feed responded ${res.status}`);
    const rows = parseFeed(await res.text(), feed.format);
    report.fetched = rows.length;
    const normalized = normalizeFeed(rows, { retailer: feed.retailer, network: feed.network, currency: feed.currency });
    let items = normalized.items;
    const rejected = normalized.rejected;
    report.rejected = rejected.length;
    report.sampleRejections = rejected.slice(0, 10);
    // read new/changed product photos once; unchanged ones reuse their stored look
    const { data: prevRows } = await sb.from("homer_furniture_catalog").select("id,item").eq("retailer", feed.retailer);
    const existing = new Map((prevRows ?? []).filter((r) => r.item).map((r) => [r.id as string, r.item as CatalogItem]));
    const enriched = await enrichAppearance(items, { existing });
    items = enriched.items;
    report.photosAnalyzed = enriched.analyzed;
    for (let i = 0; i < items.length; i += 500) {
      const { error } = await sb.from("homer_furniture_catalog").upsert(items.slice(i, i + 500).map(catalogRow), { onConflict: "id" });
      if (error) throw new Error(`upsert failed: ${error.message}`);
    }
    report.imported = items.length;
    const keep = new Set(items.map((i) => i.id));
    const { data: activeRows } = await sb.from("homer_furniture_catalog").select("id").eq("retailer", feed.retailer).eq("active", true);
    const stale = (activeRows ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
    for (let i = 0; i < stale.length; i += 500) {
      await sb.from("homer_furniture_catalog").update({ active: false }).in("id", stale.slice(i, i + 500));
    }
    report.deactivated = stale.length;
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
  }
  return report;
}
