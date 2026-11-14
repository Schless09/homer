import { requireCatalogItem } from "@/lib/catalog/items";
import type { Item, Opening, Room, RoomType, Scene, UnitType, Wall } from "./types";

/**
 * Sample apartments, authored in inches. Room polygons are interior (finished)
 * faces; wall centerlines sit half a wall thickness outside them.
 */

type WallSpec = [id: string, x1: number, y1: number, x2: number, y2: number, thickness: number];

function walls(specs: WallSpec[]): Wall[] {
  return specs.map(([id, x1, y1, x2, y2, t]) => ({
    id,
    a: { x: x1, y: y1 },
    b: { x: x2, y: y2 },
    thickness: t,
    height: 108,
    exterior: t >= 6,
  }));
}

function door(id: string, wallId: string, offset: number, width: number, swing: "left" | "right", hinge: "start" | "end" = "start"): Opening {
  return { id, wallId, kind: "door", offset, width, height: 80, sill: 0, swing, hinge };
}
function windowAt(id: string, wallId: string, offset: number, width: number): Opening {
  return { id, wallId, kind: "window", offset, width, height: 60, sill: 24, swing: "left", hinge: "start" };
}
function gap(id: string, wallId: string, offset: number, width: number): Opening {
  return { id, wallId, kind: "opening", offset, width, height: 84, sill: 0, swing: "left", hinge: "start" };
}

function rect(id: string, name: string, type: RoomType, x0: number, y0: number, x1: number, y1: number): Room {
  return { id, name, type, polygon: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] };
}

let fxCounter = 0;
function fx(catalogId: string, x: number, y: number, rotation: number, over: Partial<Item> = {}): Item {
  const c = requireCatalogItem(catalogId);
  return {
    id: `fx_${++fxCounter}`,
    catalogId,
    x,
    y,
    rotation,
    width: over.width ?? c.width,
    depth: over.depth ?? c.depth,
    height: over.height ?? c.height,
    color: c.colors[0]?.hex,
    material: c.materials[0],
    fixed: true,
    locked: true,
    elevation: 0,
    ...over,
  };
}

const style = { wallColor: "#f3efe8", floor: "oak" as const, lighting: "day" as const };

export function studioPlan(): Scene {
  fxCounter = 0;
  return {
    version: 1,
    walls: walls([
      ["w_n", -3, -3, 363, -3, 6],
      ["w_e", 363, -3, 363, 255, 6],
      ["w_s", -3, 255, 363, 255, 6],
      ["w_w", -3, 255, -3, -3, 6],
      ["w_bath_e", 98, -3, 98, 94, 4],
      ["w_bath_s", -3, 92, 100, 92, 4],
    ]),
    openings: [
      windowAt("o_n1", "w_n", 183, 60),
      windowAt("o_n2", "w_n", 303, 48),
      windowAt("o_e1", "w_e", 129, 60),
      door("o_entry", "w_s", 53, 36, "left"),
      door("o_bath", "w_bath_s", 53, 30, "left"),
    ],
    rooms: [
      rect("r_main", "Main Room", "studio", 100, 0, 360, 252),
      rect("r_kitchen", "Kitchen", "kitchen", 0, 94, 100, 252),
      rect("r_bath", "Bathroom", "bathroom", 0, 0, 96, 90),
    ],
    items: [
      fx("fx-fridge", 15, 111, 270),
      fx("fx-sink", 12.5, 144, 270),
      fx("fx-range", 13, 177, 270),
      fx("fx-counter", 12.5, 207, 270, { width: 30 }),
      fx("fx-closet", 113, 32, 270),
      fx("fx-tub", 30, 15, 0),
      fx("fx-toilet", 82, 50, 90),
      fx("fx-vanity", 10.5, 65, 270),
    ],
    style,
    scaleConfirmed: true,
  };
}

export function oneBedroomPlan(): Scene {
  fxCounter = 0;
  return {
    version: 1,
    walls: walls([
      ["w_n", -3, -3, 411, -3, 6],
      ["w_e", 411, -3, 411, 339, 6],
      ["w_s", 411, 339, -3, 339, 6],
      ["w_w", -3, 339, -3, -3, 6],
      ["w_mid", 242, -3, 242, 339, 4],
      ["w_bed_s", 242, 182, 411, 182, 4],
      ["w_bath_e", 342, 182, 342, 282, 4],
      ["w_bath_s", 242, 282, 344, 282, 4],
    ]),
    openings: [
      windowAt("o_liv_n", "w_n", 123, 72),
      windowAt("o_bed_n", "w_n", 329, 60),
      windowAt("o_bed_e", "w_e", 93, 48),
      windowAt("o_liv_w", "w_w", 229, 60),
      door("o_entry", "w_s", 35, 36, "right"),
      gap("o_hall", "w_mid", 313, 52),
      door("o_bed", "w_bed_s", 134, 32, "left"),
      door("o_bath", "w_bath_e", 48, 30, "right"),
    ],
    rooms: [
      rect("r_living", "Living", "living", 0, 0, 240, 200),
      rect("r_kitchen", "Kitchen", "kitchen", 0, 200, 240, 336),
      rect("r_bed", "Bedroom", "bedroom", 244, 0, 408, 180),
      rect("r_bath", "Bathroom", "bathroom", 244, 184, 340, 280),
      {
        id: "r_hall",
        name: "Entry",
        type: "entry",
        polygon: [
          { x: 344, y: 184 },
          { x: 408, y: 184 },
          { x: 408, y: 336 },
          { x: 244, y: 336 },
          { x: 244, y: 284 },
          { x: 344, y: 284 },
        ],
      },
    ],
    items: [
      fx("fx-fridge", 47, 321, 180),
      fx("fx-range", 77, 323, 180),
      fx("fx-counter", 140, 323.5, 180),
      fx("fx-sink", 206, 323.5, 180),
      fx("fx-island", 130, 255, 0, { width: 72, depth: 36 }),
      fx("fx-tub", 274, 199, 0),
      fx("fx-toilet", 258, 250, 270),
      fx("fx-vanity", 300, 269.5, 180),
      fx("fx-closet", 290, 167, 180, { width: 72 }),
      fx("fx-washer", 359, 215, 270),
    ],
    style,
    scaleConfirmed: true,
  };
}

export function twoBedroomPlan(): Scene {
  fxCounter = 0;
  return {
    version: 1,
    walls: walls([
      ["w_n", -3, -3, 507, -3, 6],
      ["w_e", 507, -3, 507, 363, 6],
      ["w_s", 507, 363, -3, 363, 6],
      ["w_w", -3, 363, -3, -3, 6],
      ["w_mid", 266, -3, 266, 363, 4],
      ["w_pri_s", 266, 182, 507, 182, 4],
      ["w_bed2_w", 362, 182, 362, 363, 4],
      ["w_bath_s", 266, 282, 362, 282, 4],
    ]),
    openings: [
      windowAt("o_liv_n", "w_n", 135, 72),
      windowAt("o_pri_n", "w_n", 389, 72),
      windowAt("o_pri_e", "w_e", 93, 48),
      windowAt("o_bed2_e", "w_e", 275, 48),
      windowAt("o_liv_w", "w_w", 263, 60),
      door("o_entry", "w_s", 193, 36, "right"),
      gap("o_hall", "w_mid", 325, 64),
      door("o_pri", "w_mid", 143, 32, "left"),
      door("o_bed2", "w_bed2_w", 140, 32, "left"),
      door("o_bath", "w_bath_s", 48, 30, "left"),
    ],
    rooms: [
      rect("r_living", "Living", "living", 0, 0, 264, 216),
      rect("r_kitchen", "Kitchen & Dining", "kitchen", 0, 216, 264, 360),
      rect("r_pri", "Primary Bedroom", "bedroom", 268, 0, 504, 180),
      rect("r_bath", "Bathroom", "bathroom", 268, 184, 360, 280),
      rect("r_hall", "Entry", "entry", 268, 284, 360, 360),
      rect("r_bed2", "Bedroom 2", "bedroom", 364, 184, 504, 360),
    ],
    items: [
      fx("fx-fridge", 15, 236, 270),
      fx("fx-range", 13, 266, 270),
      fx("fx-counter", 12.5, 317, 270, { width: 72 }),
      fx("fx-sink", 61, 347.5, 180),
      fx("fx-island", 120, 290, 0, { width: 60, depth: 30 }),
      fx("fx-tub", 298, 199, 0),
      fx("fx-toilet", 346, 230, 90),
      fx("fx-vanity", 278.5, 255, 270),
      fx("fx-closet", 440, 167, 180, { width: 72 }),
      fx("fx-closet", 377, 220, 270, { width: 48 }),
    ],
    style,
    scaleConfirmed: true,
  };
}

export const SAMPLE_PLANS: { id: Exclude<UnitType, "custom">; name: string; sqft: string; description: string; build: () => Scene }[] = [
  { id: "studio", name: "Studio", sqft: "≈ 630 sq ft", description: "Open living & sleeping area, galley kitchen, full bath.", build: studioPlan },
  { id: "1br", name: "One Bedroom", sqft: "≈ 950 sq ft", description: "Open kitchen with island, separate bedroom, entry with laundry.", build: oneBedroomPlan },
  { id: "2br", name: "Two Bedroom", sqft: "≈ 1,250 sq ft", description: "Primary suite, second bedroom, open kitchen & dining.", build: twoBedroomPlan },
];
