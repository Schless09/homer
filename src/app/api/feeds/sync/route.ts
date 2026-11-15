import { NextResponse } from "next/server";
import { feedsFromEnv, syncFeed } from "@/lib/feeds/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily product feed sync (Vercel Cron, see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; the route refuses anything else.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let feeds;
  try {
    feeds = feedsFromEnv();
  } catch (e) {
    return NextResponse.json({ error: `HOMER_FEEDS is invalid: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
  if (!feeds.length) return NextResponse.json({ error: "No feeds configured (HOMER_FEEDS)." }, { status: 400 });
  const reports = [];
  for (const f of feeds) reports.push(await syncFeed(f));
  return NextResponse.json({ reports }, { status: reports.some((r) => r.error) ? 207 : 200 });
}
