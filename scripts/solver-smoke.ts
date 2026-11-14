import { studioPlan, oneBedroomPlan, twoBedroomPlan } from "../src/lib/scene/samples";
import { generateAlternatives } from "../src/lib/scene/solver";
import { validateScene } from "../src/lib/scene/validate";
import { getCatalogItem } from "../src/lib/catalog/items";

const reqs = [
  { catalogId: "bed-queen" }, { catalogId: "nightstand-oak", quantity: 2 }, { catalogId: "sectional-l-96" },
  { catalogId: "coffee-rect-48" }, { catalogId: "tv-stand-60" }, { catalogId: "tv-55" }, { catalogId: "desk-48" },
  { catalogId: "office-chair" }, { catalogId: "dining-round-36" }, { catalogId: "dining-chair", quantity: 2 },
  { catalogId: "rug-5x8" }, { catalogId: "floor-lamp-arc" }, { catalogId: "plant-fiddle" },
];
for (const [name, plan] of [["studio", studioPlan()], ["1br", oneBedroomPlan()], ["2br", twoBedroomPlan()]] as const) {
  console.log("fixtures issues", name, validateScene(plan).map(i => i.message));
  const t = Date.now();
  const alts = generateAlternatives(plan, reqs);
  for (const a of alts) {
    const issues = validateScene({ ...plan, items: a.items });
    console.log(name, a.strategy, `${Date.now()-t}ms`, "added", a.items.filter(i=>!i.fixed).length, "failed", a.failed.map(f=>f.name+": "+f.reason+(f.suggestion?" -> "+f.suggestion.name:"")), "issues", issues.map(i=>i.message));
  }
  if (name === "studio") for (const i of alts[2].items.filter(i=>!i.fixed)) console.log("  ", getCatalogItem(i.catalogId)!.name, Math.round(i.x), Math.round(i.y), Math.round(i.rotation));
}
