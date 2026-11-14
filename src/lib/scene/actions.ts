import { z } from "zod";
import { getCatalogItem } from "@/lib/catalog/items";
import { instantiate } from "./instantiate";
import { FloorMaterialSchema, ItemSchema, type Item, type Scene } from "./types";

/**
 * Structured scene edits. The AI designer can only emit these; every action is
 * validated with Zod and checked against the scene before it is applied. None of
 * them can alter walls, openings, rooms, or fixed fixtures.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const AddItemAction = z.object({
  action: z.literal("add_item"),
  catalog_id: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number().default(0),
  color: hex.optional(),
  material: z.string().optional(),
  /** optional temporary reference so later actions in the same batch can target this item */
  ref: z.string().optional(),
});

export const MoveItemAction = z.object({
  action: z.literal("move_item"),
  item_id: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number().optional(),
});

export const RotateItemAction = z.object({
  action: z.literal("rotate_item"),
  item_id: z.string(),
  rotation: z.number(),
});

export const RemoveItemAction = z.object({
  action: z.literal("remove_item"),
  item_id: z.string(),
});

export const ReplaceItemAction = z.object({
  action: z.literal("replace_item"),
  item_id: z.string(),
  catalog_id: z.string(),
  color: hex.optional(),
});

export const SetFinishAction = z.object({
  action: z.literal("set_item_finish"),
  item_id: z.string(),
  color: hex.optional(),
  material: z.string().optional(),
});

export const SetWallColorAction = z.object({
  action: z.literal("set_wall_color"),
  color: hex,
});

export const SetFloorAction = z.object({
  action: z.literal("set_floor"),
  material: FloorMaterialSchema,
  room_id: z.string().optional(),
});

export const SetLayoutAction = z.object({
  action: z.literal("set_layout"),
  /** full replacement of all non-fixed items */
  items: z.array(ItemSchema),
});

export const DesignActionSchema = z.discriminatedUnion("action", [
  AddItemAction,
  MoveItemAction,
  RotateItemAction,
  RemoveItemAction,
  ReplaceItemAction,
  SetFinishAction,
  SetWallColorAction,
  SetFloorAction,
  SetLayoutAction,
]);
export type DesignAction = z.infer<typeof DesignActionSchema>;

export interface ApplyResult {
  scene: Scene;
  applied: string[];
  rejected: { action: DesignAction; reason: string }[];
}

export function describeAction(a: DesignAction, scene: Scene): string {
  const nm = (id: string) => {
    const it = scene.items.find((i) => i.id === id);
    return it ? (it.label ?? getCatalogItem(it.catalogId)?.name ?? id) : id;
  };
  switch (a.action) {
    case "add_item":
      return `Add ${getCatalogItem(a.catalog_id)?.name ?? a.catalog_id}`;
    case "move_item":
      return `Move ${nm(a.item_id)}`;
    case "rotate_item":
      return `Rotate ${nm(a.item_id)} to ${Math.round(a.rotation)}°`;
    case "remove_item":
      return `Remove ${nm(a.item_id)}`;
    case "replace_item":
      return `Swap ${nm(a.item_id)} for ${getCatalogItem(a.catalog_id)?.name ?? a.catalog_id}`;
    case "set_item_finish":
      return `Change finish of ${nm(a.item_id)}`;
    case "set_wall_color":
      return `Paint walls ${a.color}`;
    case "set_floor":
      return `Change flooring to ${a.material}`;
    case "set_layout":
      return `Apply layout with ${a.items.filter((i) => !i.fixed).length} pieces`;
  }
}

const norm = (r: number) => ((r % 360) + 360) % 360;

/** Apply validated actions immutably. Invalid actions are rejected with a reason, never applied silently. */
export function applyActions(scene: Scene, actions: DesignAction[]): ApplyResult {
  let items: Item[] = scene.items.map((i) => ({ ...i }));
  let style = { ...scene.style };
  let rooms = scene.rooms;
  const refs = new Map<string, string>();
  const applied: string[] = [];
  const rejected: ApplyResult["rejected"] = [];
  const resolve = (id: string) => refs.get(id) ?? id;

  for (const a of actions) {
    const reject = (reason: string) => rejected.push({ action: a, reason });
    switch (a.action) {
      case "add_item": {
        const c = getCatalogItem(a.catalog_id);
        if (!c) {
          reject(`Unknown catalog item "${a.catalog_id}".`);
          break;
        }
        if (c.fixture) {
          reject("Architectural fixtures can't be added by the AI.");
          break;
        }
        const it = instantiate(c.id, a.x, a.y, norm(a.rotation), { color: a.color, material: a.material });
        if (a.ref) refs.set(a.ref, it.id);
        items.push(it);
        applied.push(describeAction(a, scene));
        break;
      }
      case "move_item":
      case "rotate_item":
      case "remove_item":
      case "replace_item":
      case "set_item_finish": {
        const id = resolve(a.item_id);
        const idx = items.findIndex((i) => i.id === id);
        if (idx < 0) {
          reject(`No item with id "${a.item_id}".`);
          break;
        }
        const it = items[idx];
        if (it.fixed && a.action !== "set_item_finish") {
          reject(`${getCatalogItem(it.catalogId)?.name ?? "Fixture"} is part of the floor plan and can't be changed.`);
          break;
        }
        if (it.locked && a.action !== "set_item_finish") {
          reject(`${getCatalogItem(it.catalogId)?.name ?? "Item"} is locked by the user.`);
          break;
        }
        if (a.action === "move_item") {
          items[idx] = { ...it, x: a.x, y: a.y, rotation: a.rotation !== undefined ? norm(a.rotation) : it.rotation };
          // keep things that sit on top of it attached
          items = carryChildren(items, it, items[idx]);
        } else if (a.action === "rotate_item") {
          items[idx] = { ...it, rotation: norm(a.rotation) };
          items = carryChildren(items, it, items[idx]);
        } else if (a.action === "remove_item") {
          items = items.filter((i) => i.id !== id && !(i.elevation > 0 && Math.hypot(i.x - it.x, i.y - it.y) < Math.max(it.width, it.depth) / 2));
        } else if (a.action === "replace_item") {
          const c = getCatalogItem(a.catalog_id);
          if (!c || c.fixture) {
            reject(`Unknown catalog item "${a.catalog_id}".`);
            break;
          }
          // keep the back edge in place so wall-anchored pieces stay against the wall
          const dd = (c.depth - it.depth) / 2;
          const r = (it.rotation * Math.PI) / 180;
          const shift = { x: -Math.sin(r) * dd, y: Math.cos(r) * dd };
          items[idx] = instantiate(c.id, it.x + shift.x, it.y + shift.y, it.rotation, { id: it.id, color: a.color ?? c.colors[0]?.hex });
        } else {
          items[idx] = { ...it, color: a.color ?? it.color, material: a.material ?? it.material };
        }
        applied.push(describeAction(a, scene));
        break;
      }
      case "set_wall_color":
        style = { ...style, wallColor: a.color };
        applied.push(describeAction(a, scene));
        break;
      case "set_floor":
        if (a.room_id) rooms = rooms.map((r) => (r.id === a.room_id ? { ...r, floor: a.material } : r));
        else {
          style = { ...style, floor: a.material };
          rooms = rooms.map((r) => ({ ...r, floor: undefined }));
        }
        applied.push(describeAction(a, scene));
        break;
      case "set_layout": {
        const fixed = items.filter((i) => i.fixed);
        const locked = items.filter((i) => !i.fixed && i.locked);
        const incoming = a.items.filter((i) => !i.fixed && getCatalogItem(i.catalogId) && !locked.some((l) => l.id === i.id));
        items = [...fixed, ...locked, ...incoming];
        applied.push(describeAction(a, scene));
        break;
      }
    }
  }
  return { scene: { ...scene, items, style, rooms }, applied, rejected };
}

function carryChildren(items: Item[], before: Item, after: Item): Item[] {
  const children = items.filter(
    (i) => i.id !== before.id && i.elevation > 0 && Math.hypot(i.x - before.x, i.y - before.y) < Math.max(before.width, before.depth) / 2,
  );
  if (!children.length) return items;
  const dr = after.rotation - before.rotation;
  const rad = (dr * Math.PI) / 180;
  return items.map((i) => {
    if (!children.includes(i)) return i;
    const rx = i.x - before.x;
    const ry = i.y - before.y;
    return {
      ...i,
      x: after.x + rx * Math.cos(rad) - ry * Math.sin(rad),
      y: after.y + rx * Math.sin(rad) + ry * Math.cos(rad),
      rotation: norm(i.rotation + dr),
    };
  });
}
