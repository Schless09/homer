import { getCatalogItem } from "@/lib/catalog/items";
import { rotate } from "@/lib/scene/geometry";
import type { Item, Scene } from "@/lib/scene/types";
import { roomAt } from "@/lib/scene/validate";
import { formatFtIn } from "@/lib/scene/units";
import { clearanceRays } from "@/lib/scene/snapping";

function compass(v: { x: number; y: number }): string {
  const a = Math.atan2(v.y, v.x) * (180 / Math.PI);
  if (a >= -45 && a < 45) return "east";
  if (a >= 45 && a < 135) return "south";
  if (a >= -135 && a < -45) return "north";
  return "west";
}

/** Plain-language description of where a piece sits ("against the north wall of the Bedroom"). */
export function describePlacement(scene: Scene, item: Item): string {
  const c = getCatalogItem(item.catalogId);
  const name = c?.name ?? "piece";
  const back = rotate({ x: 0, y: -1 }, item.rotation);
  const rays = clearanceRays(scene, item);
  const backRay = rays.find((r) => r.side === "back");
  const room = roomAt(scene.rooms, item.x, item.y);
  const where = room ? (/^room\s*\d+$/i.test(room.name) ? ` in ${room.name}` : ` in the ${room.name.toLowerCase()}`) : "";
  if (backRay && backRay.length < 3) return `${name} against the ${compass(back)} wall${where}`;
  const front = rotate({ x: 0, y: 1 }, item.rotation);
  return `${name} floating${where}, facing ${compass(front)}`;
}

export function walkwaySummary(scene: Scene, item: Item): string | null {
  const rays = clearanceRays(scene, item);
  const sides = rays.filter((r) => r.side === "left" || r.side === "right").map((r) => r.length);
  const front = rays.find((r) => r.side === "front")?.length;
  const parts: string[] = [];
  if (sides.length) parts.push(`${sides.map((s) => formatFtIn(s)).join(" / ")} to the side walls`);
  if (front !== undefined) parts.push(`${formatFtIn(front)} clear in front`);
  return parts.length ? parts.join(", ") : null;
}
