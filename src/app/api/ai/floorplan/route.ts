import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { aiConfig } from "@/lib/ai/server/config";
import { extractFloorplan } from "@/lib/ai/server/floorplan";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const Body = z.object({
  data: z.string().min(100).max(6_000_000),
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  width: z.number().positive(),
  height: z.number().positive(),
});

export async function POST(request: Request) {
  if (!aiConfig().claude) {
    return NextResponse.json(
      { error: "AI floor plan reading is not configured. Set ANTHROPIC_API_KEY on the server, or trace the plan manually.", code: "not_configured" },
      { status: 501 },
    );
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid image payload." }, { status: 400 });
  try {
    const extraction = await extractFloorplan(parsed.data);
    return NextResponse.json({ extraction });
  } catch (err) {
    console.error("[floorplan]", err);
    const msg = err instanceof Anthropic.APIError ? `AI provider error (${err.status ?? "unknown"}).` : err instanceof Error ? err.message : "Extraction failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
