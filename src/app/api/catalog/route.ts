import { NextResponse } from "next/server";
import { loadRetailerCatalog } from "@/lib/catalog/server";

export const dynamic = "force-dynamic";

/** Retailer products for the browser. Raw affiliate URLs are stripped; buy links go through /go/<id>. */
export async function GET() {
  const items = (await loadRetailerCatalog()).map(({ productUrl: _u, ...rest }) => {
    void _u;
    return rest;
  });
  return NextResponse.json({ items }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
