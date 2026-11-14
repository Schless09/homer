import { NextResponse } from "next/server";
import { z } from "zod";
import { buildRenderPrompt, renderProvider } from "@/lib/ai/server/render";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const Start = z.object({
  image: z.string().startsWith("data:image/").max(8_000_000),
  prompt: z.string().max(1000).default(""),
  style: z.object({ wallColor: z.string(), floor: z.string() }),
  pieces: z.array(z.string()).max(60).default([]),
});

export async function POST(request: Request) {
  const provider = renderProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "Photorealistic rendering is not configured. Set REPLICATE_API_TOKEN to enable it.", code: "not_configured" },
      { status: 501 },
    );
  }
  const parsed = Start.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid render request." }, { status: 400 });
  try {
    const job = await provider.start({ image: parsed.data.image, prompt: buildRenderPrompt(parsed.data.prompt, parsed.data.style, parsed.data.pieces) });
    return NextResponse.json({ job });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Render failed to start." }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const provider = renderProvider();
  if (!provider) return NextResponse.json({ error: "not_configured" }, { status: 501 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    return NextResponse.json({ job: await provider.get(id) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Lookup failed." }, { status: 502 });
  }
}
