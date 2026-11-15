import { NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { findRetailerItem } from "@/lib/catalog/server";
import { buildOutboundUrl } from "@/lib/feeds/affiliate";
import { publicSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const clickId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 14);

/**
 * Outbound "Buy" link. Logs the click, stamps a click ID into the network's
 * sub-ID parameter, then redirects to the retailer. Only ever redirects to the
 * product URL stored for the catalog item (never to a user-supplied URL).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await findRetailerItem(id);
  const home = new URL("/", request.url);
  if (!item) return NextResponse.redirect(home, 302);

  const cid = clickId();
  const out = buildOutboundUrl(item, cid, { amazonTag: process.env.HOMER_AMAZON_ASSOCIATE_TAG });
  if (!out) return NextResponse.redirect(home, 302);

  const qs = new URL(request.url).searchParams;
  const sb = publicSupabase();
  if (sb) {
    const log = sb.from("homer_affiliate_clicks").insert({
      id: cid,
      catalog_id: item.id,
      retailer: item.retailer ?? null,
      network: item.network ?? null,
      external_id: item.externalId ?? null,
      price: item.price,
      currency: item.currency ?? "USD",
      project_id: qs.get("p")?.slice(0, 64) ?? null,
      placement: qs.get("from")?.slice(0, 32) ?? null,
      tracked: out.tracked,
    });
    // never let logging delay or break the shopper's redirect
    await Promise.race([log.then(({ error }) => error && console.warn("[go] click log failed:", error.message)), new Promise((r) => setTimeout(r, 1200))]);
  }
  if (!out.tracked) console.warn(`[go] ${item.id} has no affiliate tracking; no commission will be paid`);

  return NextResponse.redirect(out.url, { status: 302, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
