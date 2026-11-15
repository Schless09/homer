/**
 * Import an affiliate product feed into the catalog.
 *
 *   npm run feed:import -- --file feed.csv --retailer "Article" --network impact
 *   npm run feed:import -- --url "https://..." --retailer "Article" --network impact --supabase
 *
 * Default output merges into src/data/retailer-catalog.json (bundled with the
 * app). With --supabase it upserts into homer_furniture_catalog using
 * HOMER_NEXT_PUBLIC_SUPABASE_URL + HOMER_SUPABASE_SECRET_KEY.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseFeed } from "../src/lib/feeds/csv";
import { normalizeFeed } from "../src/lib/feeds/normalize";
import { catalogRow } from "../src/lib/feeds/rows";
import { AFFILIATE_NETWORKS, type AffiliateNetwork, type CatalogItem } from "../src/lib/catalog/types";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const file = arg("file");
  const url = arg("url");
  const retailer = arg("retailer");
  const network = (arg("network") ?? "direct") as AffiliateNetwork;
  const format = arg("format") as "csv" | "tsv" | "json" | undefined;
  if ((!file && !url) || !retailer) throw new Error('Usage: --file <path> | --url <feed url>  --retailer "<name>"  --network <impact|cj|rakuten|awin|shareasale|amazon|direct>');
  if (!AFFILIATE_NETWORKS.includes(network)) throw new Error(`Unknown network "${network}"`);

  const body = file ? readFileSync(file, "utf8") : await (await fetch(url!)).text();
  const { items, rejected } = normalizeFeed(parseFeed(body, format), { retailer, network, currency: arg("currency") });
  console.log(`Imported ${items.length} products, rejected ${rejected.length}.`);
  const reasons = new Map<string, number>();
  for (const r of rejected) reasons.set(r.reason.replace(/\d+(\.\d+)?"/g, "N\""), (reasons.get(r.reason.replace(/\d+(\.\d+)?"/g, "N\"")) ?? 0) + 1);
  for (const [r, n] of reasons) console.log(`  ${n} × ${r}`);

  if (flag("supabase")) {
    const sbUrl = process.env.HOMER_NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.HOMER_SUPABASE_SECRET_KEY;
    if (!sbUrl || !key) throw new Error("Set HOMER_NEXT_PUBLIC_SUPABASE_URL and HOMER_SUPABASE_SECRET_KEY to write to Supabase.");
    const sb = createClient(sbUrl, key, { auth: { persistSession: false } });
    for (let i = 0; i < items.length; i += 500) {
      const { error } = await sb.from("homer_furniture_catalog").upsert(items.slice(i, i + 500).map(catalogRow), { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    console.log(`Upserted ${items.length} rows into homer_furniture_catalog.`);
    return;
  }

  const out = arg("out") ?? "src/data/retailer-catalog.json";
  let existing: CatalogItem[] = [];
  try {
    existing = JSON.parse(readFileSync(out, "utf8"));
  } catch {
    existing = [];
  }
  const merged = [...existing.filter((i) => i.retailer !== retailer), ...items];
  writeFileSync(out, JSON.stringify(merged, null, 1) + "\n");
  console.log(`Wrote ${merged.length} retailer products to ${out}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
