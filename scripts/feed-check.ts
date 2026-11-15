import { readFileSync } from "node:fs";
import { parseFeed } from "../src/lib/feeds/csv";
import { normalizeFeed } from "../src/lib/feeds/normalize";

const file = process.argv[2] ?? "feeds/fixtures/example-impact.csv";
const res = normalizeFeed(parseFeed(readFileSync(file, "utf8")), { retailer: "Example Home Co.", network: "impact" });
for (const i of res.items) {
  console.log(
    `OK  ${i.name.padEnd(36)} ${i.category.padEnd(14)} ${i.model.padEnd(18)} ${i.width}x${i.depth}x${i.height}${i.heightEstimated ? " (h est.)" : ""}  $${i.price} ${i.colors[0]?.hex} [${i.dimsSource}]${i.inStock ? "" : " OUT OF STOCK"}`,
  );
}
for (const i of res.items) console.log("   ", i.externalId, "inStock=" + i.inStock, i.productUrl);
for (const r of res.rejected) console.log(`NO  ${r.title.padEnd(36)} ${r.reason}`);
