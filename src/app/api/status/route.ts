import { NextResponse } from "next/server";
import { aiConfig } from "@/lib/ai/server/config";
import type { AIStatus } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = aiConfig();
  const body: AIStatus = {
    claude: cfg.claude,
    model: cfg.claude ? cfg.designerModel : null,
    imageProvider: cfg.imageProvider,
    floorplanProvider: cfg.floorplanProvider,
    floorplanModel: cfg.floorplanProvider === "gemini" ? cfg.geminiFloorplanModel : cfg.floorplanProvider === "claude" ? cfg.visionModel : null,
    storage: process.env.HOMER_SUPABASE_URL && process.env.HOMER_SUPABASE_KEY ? "supabase" : "local",
  };
  return NextResponse.json(body);
}
