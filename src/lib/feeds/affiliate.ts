import type { CatalogItem } from "@/lib/catalog/types";
import { AFFILIATE_HOSTS } from "./normalize";

/**
 * Build the outbound link for a retailer product with a per-click ID in the
 * network's sub-ID parameter. Network reports then show which click (and so
 * which design/project) earned each commission.
 */
const SUBID_PARAM: Record<string, string> = {
  impact: "subId1",
  cj: "sid",
  rakuten: "u1",
  awin: "clickref",
  shareasale: "afftrack",
};

export interface OutboundLink {
  url: string;
  /** false when the link carries no affiliate tracking (no commission will be paid) */
  tracked: boolean;
}

export function buildOutboundUrl(item: CatalogItem, clickId: string, env: { amazonTag?: string } = {}): OutboundLink | null {
  const base = item.productUrl;
  if (!base) return null;
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;

  const network = item.network ?? "direct";
  if (network === "amazon") {
    if (env.amazonTag) u.searchParams.set("tag", env.amazonTag);
    u.searchParams.set("ascsubtag", clickId);
    return { url: u.toString(), tracked: !!env.amazonTag || u.searchParams.has("tag") };
  }
  const param = SUBID_PARAM[network];
  if (param) {
    u.searchParams.set(param, clickId);
    return { url: u.toString(), tracked: AFFILIATE_HOSTS.test(u.toString()) };
  }
  // direct partnerships: tag the visit so the retailer can attribute it
  u.searchParams.set("utm_source", "homer");
  u.searchParams.set("utm_medium", "affiliate");
  u.searchParams.set("utm_content", clickId);
  return { url: u.toString(), tracked: false };
}
