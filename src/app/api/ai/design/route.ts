import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { DesignRequestSchema, type DesignResponse } from "@/lib/ai/types";
import { runDemoDesigner } from "@/lib/ai/demo";
import { runClaudeDesigner } from "@/lib/ai/server/claude";
import { aiConfig } from "@/lib/ai/server/config";
import { applyActions } from "@/lib/scene/actions";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = DesignRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request.", details: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }
  const req = parsed.data;
  let res: DesignResponse;
  if (aiConfig().claude) {
    try {
      res = await runClaudeDesigner(req);
    } catch (err) {
      const reason =
        err instanceof Anthropic.AuthenticationError
          ? "the Anthropic API key was rejected"
          : err instanceof Anthropic.RateLimitError
            ? "the Anthropic API is rate limiting requests"
            : err instanceof Anthropic.APIError
              ? `the Anthropic API returned ${err.status ?? "an error"}`
              : "the AI request failed";
      console.error("[design] Claude error", err);
      res = { ...runDemoDesigner(req), notice: `Claude was unavailable (${reason}), so the built-in rule-based designer answered instead.` };
    }
  } else {
    res = runDemoDesigner(req);
  }
  // Server-side guarantee: every returned action must apply to this scene.
  const check = applyActions(req.scene, res.actions);
  if (check.rejected.length) {
    res = { ...res, actions: res.actions.filter((a) => !check.rejected.some((r) => r.action === a)) };
  }
  return NextResponse.json(res);
}
