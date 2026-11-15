import { NextResponse } from "next/server";
import { z } from "zod";
import { buildRenderPrompt, loadReferenceImages, renderProvider } from "@/lib/ai/server/render";
import { loadRetailerCatalog } from "@/lib/catalog/server";
import { describeAppearance } from "@/lib/catalog/appearance";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const Start = z.object({
  image: z.string().startsWith("data:image/").max(8_000_000),
  prompt: z.string().max(1000).default(""),
  style: z.object({ wallColor: z.string(), floor: z.string() }),
  pieces: z.array(z.string()).max(60).default([]),
  /** catalog ids of real products in the scene, most prominent first */
  productIds: z.array(z.string().max(120)).max(12).default([]),
});

export async function POST(request: Request) {
  const provider = renderProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "Photorealistic rendering is not configured. Set HOMER_GEMINI_API_KEY (or REPLICATE_API_TOKEN) to enable it.", code: "not_configured" },
      { status: 501 },
    );
  }
  const parsed = Start.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid render request." }, { status: 400 });
  try {
    let references: Awaited<ReturnType<typeof loadReferenceImages>> = [];
    const extra: string[] = [];
    if (parsed.data.productIds.length) {
      const catalog = await loadRetailerCatalog();
      const products = parsed.data.productIds.map((id) => catalog.find((c) => c.id === id)).filter((c) => !!c);
      for (const p of products) if (p.appearance) extra.push(`${p.name}: ${describeAppearance(p.appearance)}`);
      if (provider.usesReferences) {
        references = await loadReferenceImages(
          products.filter((p) => p.imageUrl).slice(0, 6).map((p) => ({ label: `${p.name}${p.retailer ? ` from ${p.retailer}` : ""}`, url: p.imageUrl! })),
        );
      }
    }
    const prompt = buildRenderPrompt(parsed.data.prompt, parsed.data.style, [...parsed.data.pieces, ...extra], references.length);
    const job = await provider.start({ image: parsed.data.image, prompt, references });
    return NextResponse.json({ job, referencesUsed: references.map((r) => r.label) });
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
