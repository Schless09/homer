/**
 * Offline evaluation of extraction → scene conversion on saved floor plan reads.
 *   npx tsx --tsconfig tsconfig.json scripts/extraction-eval.ts <inchesPerPx> <extraction.json>...
 */
import { readFileSync } from "node:fs";
import { sceneFromExtraction, suggestScale } from "../src/lib/import/fromExtraction";
import { emptyScene } from "../src/lib/scene/types";
import { validateScene } from "../src/lib/scene/validate";
import { runDemoDesigner } from "../src/lib/ai/demo";
import { applyActions } from "../src/lib/scene/actions";
import { getCatalogItem } from "../src/lib/catalog/items";
import type { FloorplanExtraction } from "../src/lib/ai/floorplan-schema";

const [scaleArg, ...files] = process.argv.slice(2);
for (const file of files) {
  const ex = JSON.parse(readFileSync(file, "utf8")) as FloorplanExtraction;
  const sug = suggestScale(ex, 1);
  const scale = scaleArg === "auto" ? (sug?.inchesPerPx ?? 0.745) : Number(scaleArg);
  const scene = sceneFromExtraction(ex, 1, scale, emptyScene());
  const fixtureIssues = validateScene(scene);
  const res = runDemoDesigner({ scene, message: "Furnish this apartment", history: [] });
  const furnished = applyActions(scene, res.actions).scene;
  const issues = validateScene(furnished).filter((i) => i.severity !== "info");
  console.log(
    `${file.split("/").pop()}: openings ${scene.openings.length}/${ex.openings.length}, walls ${scene.walls.length}, fixtures ${scene.items.length} with ${fixtureIssues.length} notes; furnished ${furnished.items.filter((i) => !i.fixed).length} pieces, ${issues.length} notes`,
  );
  for (const i of [...fixtureIssues, ...issues].slice(0, 6)) console.log(`    ${i.severity}: ${i.message} [${getCatalogItem(furnished.items.find((x) => x.id === i.itemId)?.catalogId ?? "")?.id ?? ""}]`);
}
