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
    storage: process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "supabase" : "local",
  };
  return NextResponse.json(body);
}
