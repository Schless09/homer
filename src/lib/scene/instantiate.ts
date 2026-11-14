import { requireCatalogItem } from "@/lib/catalog/items";
import { newId } from "./ids";
import type { Item } from "./types";

export function instantiate(
  catalogId: string,
  x: number,
  y: number,
  rotation = 0,
  over: Partial<Omit<Item, "catalogId">> = {},
): Item {
  const c = requireCatalogItem(catalogId);
  return {
    id: over.id ?? newId("it"),
    catalogId,
    x,
    y,
    rotation,
    width: over.width ?? c.width,
    depth: over.depth ?? c.depth,
    height: over.height ?? c.height,
    color: over.color ?? c.colors[0]?.hex,
    material: over.material ?? c.materials[0],
    label: over.label,
    fixed: over.fixed ?? !!c.fixture,
    locked: over.locked ?? !!c.fixture,
    elevation: over.elevation ?? 0,
  };
}
