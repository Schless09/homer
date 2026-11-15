/**
 * Offline check of the Gemini render provider: request shape (snapshot +
 * product photos) and response parsing, using a mocked fetch.
 * Run: NODE_OPTIONS=--conditions=react-server npx tsx --tsconfig tsconfig.json scripts/render-check.ts
 */
import { buildRenderPrompt, gemini, loadReferenceImages } from "../src/lib/ai/server/render";

let captured: { url: string; body: { contents: { parts: Record<string, unknown>[] }[] } } | null = null;
const png = Buffer.from("89504e470d0a1a0a", "hex");

const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://cdn.example/")) {
    if (url.endsWith("bad.gif")) return new Response("x", { headers: { "content-type": "image/gif" } });
    return new Response(png, { headers: { "content-type": "image/jpeg" } });
  }
  captured = { url, body: JSON.parse(String(init?.body)) };
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }, { inlineData: { mimeType: "image/png", data: "QUJD" } }] } }] }), {
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

async function main() {
  const refs = await loadReferenceImages(
    [
      { label: "Halden 84\" Sofa from Example Home Co.", url: "https://cdn.example/sofa.jpg" },
      { label: "GIF should be skipped", url: "https://cdn.example/bad.gif" },
      { label: "http should be skipped", url: "http://cdn.example/x.jpg" },
    ],
    mockFetch,
  );
  console.log("references loaded:", refs.map((r) => `${r.label} (${r.mimeType})`));

  const provider = gemini("test-key", "gemini-2.5-flash-image", mockFetch);
  const prompt = buildRenderPrompt("", { wallColor: "#f3efe8", floor: "oak" }, ["charcoal Halden 84\" Sofa from Example Home Co."], refs.length);
  const job = await provider.start({ image: "data:image/jpeg;base64,U05BUA==", prompt, references: refs });
  const parts = captured!.body.contents[0].parts;
  console.log("endpoint:", captured!.url);
  console.log("parts:", parts.map((p) => ("text" in p ? `text(${String(p.text).slice(0, 48)}…)` : `image(${(p.inline_data as { mime_type: string }).mime_type})`)).join(" | "));
  console.log("job:", job.status, job.output);
  if (job.status !== "succeeded" || job.output !== "data:image/png;base64,QUJD" || refs.length !== 1 || parts.filter((p) => "inline_data" in p).length !== 2) {
    throw new Error("render check FAILED");
  }
  console.log("render check passed");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
