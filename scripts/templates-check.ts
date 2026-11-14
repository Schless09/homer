import { furnishedStudio } from "../src/lib/projects";
import { PALETTES } from "../src/lib/scene/palette";
import { validateScene } from "../src/lib/scene/validate";
for (const p of PALETTES) { const pr = furnishedStudio(p.name, p); console.log(p.id, validateScene(pr.scene).filter(i=>i.severity!=="info").length, pr.scene.items.filter(i=>!i.fixed).length); }
