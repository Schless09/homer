import { describePlacement } from "./ai/narrate";
import { getCatalogItem } from "./catalog/items";
import { newId } from "./scene/ids";
import { getPalette, type Palette } from "./scene/palette";
import { SAMPLE_PLANS } from "./scene/samples";
import { solveLayout, type PlacementRequest, type Strategy } from "./scene/solver";
import { validateScene } from "./scene/validate";
import { emptyScene, type ChatMessage, type Project, type Scene, type UnitType } from "./scene/types";

export function newProject(name: string, unitType: UnitType, scene: Scene): Project {
  const now = Date.now();
  return { id: newId("prj"), name, unitType, createdAt: now, updatedAt: now, revision: 0, scene, conversation: [] };
}

export function projectFromSample(unitType: Exclude<UnitType, "custom">, name?: string): Project {
  const plan = SAMPLE_PLANS.find((p) => p.id === unitType)!;
  return newProject(name ?? `My ${plan.name}`, unitType, plan.build());
}

export function blankProject(name = "Untitled space"): Project {
  return newProject(name, "custom", emptyScene());
}

export const STUDIO_DEMO_REQUESTS: PlacementRequest[] = [
  { catalogId: "bed-queen" },
  { catalogId: "nightstand-oak", quantity: 2 },
  { catalogId: "sectional-l-96" },
  { catalogId: "coffee-round-36" },
  { catalogId: "tv-stand-60" },
  { catalogId: "tv-55" },
  { catalogId: "desk-48" },
  { catalogId: "office-chair" },
  { catalogId: "dining-round-36" },
  { catalogId: "dining-chair", quantity: 2 },
  { catalogId: "rug-5x8" },
  { catalogId: "floor-lamp-paper" },
  { catalogId: "plant-olive" },
  { catalogId: "table-lamp" },
];

/** Furnish a sample studio, keeping the cleanest of a few solver runs (fewest spacing notes). */
export function furnishedStudio(name: string, palette: Palette): Project {
  const p = projectFromSample("studio", name);
  let best: { items: Scene["items"]; score: number } | null = null;
  for (const strategy of ["design", "functional"] as Strategy[]) {
    for (const seed of [11, 3, 7, 19, 23]) {
      const res = solveLayout(p.scene, STUDIO_DEMO_REQUESTS, { strategy, seed, palette });
      const issues = validateScene({ ...p.scene, items: res.items }).filter((i) => i.severity !== "info").length;
      const score = issues * 10 + res.failed.length * 100;
      if (!best || score < best.score) best = { items: res.items, score };
      if (score === 0) break;
    }
    if (best?.score === 0) break;
  }
  p.scene = { ...p.scene, items: best!.items, style: { ...p.scene.style, wallColor: palette.wallColor, floor: palette.floor } };
  p.preferences = { style: palette.id };
  return p;
}

/** A fully furnished studio so a first-time visitor never lands on an empty editor. */
export function demoProject(): Project {
  const p = furnishedStudio("Demo · Warm minimalist studio", getPalette("warm-minimal")!);
  const now = Date.now();
  const key = ["bed", "sectional", "tv-stand", "desk", "round-table"];
  const lines = p.scene.items
    .filter((i) => key.includes(getCatalogItem(i.catalogId)?.model ?? ""))
    .map((i) => `• ${describePlacement(p.scene, i)}`);
  const welcome: ChatMessage = {
    id: newId("msg"),
    role: "assistant",
    createdAt: now,
    provider: "demo",
    content: [
      "I furnished this 630 sq ft studio at real dimensions, keeping every door swing and walkway clear:",
      ...lines,
      "",
      'Try asking me to "give me three layouts", "can I fit a king bed?", or "make it feel like a modern luxury apartment".',
    ].join("\n"),
  };
  p.conversation = [welcome];
  return p;
}
