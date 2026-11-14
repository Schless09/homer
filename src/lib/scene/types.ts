import { z } from "zod";

/**
 * Canonical scene model. Every unit is INCHES, in a top-down plan frame:
 * +x points right (east), +y points down (south). Rotations are degrees,
 * clockwise in plan view (matching the 2D canvas). The 2D editor, the 3D
 * view, the layout solver and the AI designer all read and write this model.
 */

export const PointSchema = z.object({ x: z.number(), y: z.number() });
export type Point = z.infer<typeof PointSchema>;

export const WallSchema = z.object({
  id: z.string(),
  a: PointSchema,
  b: PointSchema,
  thickness: z.number().positive().default(5),
  height: z.number().positive().default(108),
  exterior: z.boolean().default(false),
});
export type Wall = z.infer<typeof WallSchema>;

export const OpeningSchema = z.object({
  id: z.string(),
  wallId: z.string(),
  kind: z.enum(["door", "window", "opening"]),
  /** distance from wall.a to the opening's center, along the wall */
  offset: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  /** windows: height of the sill above the floor */
  sill: z.number().nonnegative().default(0),
  /** doors: which end of the opening the hinge sits on */
  hinge: z.enum(["start", "end"]).default("start"),
  /** doors: which side of the wall the leaf swings into (relative to a->b, left = counterclockwise normal) */
  swing: z.enum(["left", "right"]).default("left"),
});
export type Opening = z.infer<typeof OpeningSchema>;

export const ROOM_TYPES = [
  "living",
  "bedroom",
  "kitchen",
  "dining",
  "bathroom",
  "closet",
  "entry",
  "office",
  "studio",
  "laundry",
  "balcony",
  "other",
] as const;
export const RoomTypeSchema = z.enum(ROOM_TYPES);
export type RoomType = z.infer<typeof RoomTypeSchema>;

export const FLOOR_MATERIALS = [
  "oak",
  "walnut",
  "maple",
  "concrete",
  "tile-white",
  "tile-gray",
  "carpet-oatmeal",
  "herringbone",
] as const;
export const FloorMaterialSchema = z.enum(FLOOR_MATERIALS);
export type FloorMaterial = z.infer<typeof FloorMaterialSchema>;

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: RoomTypeSchema,
  polygon: z.array(PointSchema).min(3),
  floor: FloorMaterialSchema.optional(),
});
export type Room = z.infer<typeof RoomSchema>;

export const ItemSchema = z.object({
  id: z.string(),
  catalogId: z.string(),
  /** center of the footprint */
  x: z.number(),
  y: z.number(),
  rotation: z.number().default(0),
  /** real-world dimensions (inches); default to catalog values, editable for resizable items */
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
  color: z.string().optional(),
  material: z.string().optional(),
  label: z.string().optional(),
  /** architectural fixtures (counters, tubs, closets) are locked and never moved by AI */
  fixed: z.boolean().default(false),
  locked: z.boolean().default(false),
  /** elevation of the item's base above the floor, for items sitting on others (TV on a stand) */
  elevation: z.number().nonnegative().default(0),
});
export type Item = z.infer<typeof ItemSchema>;

export const BackgroundSchema = z.object({
  /** key of the image blob in the asset store */
  assetId: z.string(),
  /** plan position of the image's top-left corner (inches) */
  x: z.number(),
  y: z.number(),
  /** inches per image pixel, set by calibration */
  scale: z.number().positive(),
  widthPx: z.number().positive(),
  heightPx: z.number().positive(),
  opacity: z.number().min(0).max(1).default(0.45),
  visible: z.boolean().default(true),
  calibrated: z.boolean().default(false),
});
export type Background = z.infer<typeof BackgroundSchema>;

export const LightingSchema = z.enum(["day", "golden", "evening"]);
export type Lighting = z.infer<typeof LightingSchema>;

export const SceneSchema = z.object({
  version: z.literal(1),
  walls: z.array(WallSchema),
  openings: z.array(OpeningSchema),
  rooms: z.array(RoomSchema),
  items: z.array(ItemSchema),
  background: BackgroundSchema.optional(),
  style: z.object({
    wallColor: z.string().default("#f3efe8"),
    floor: FloorMaterialSchema.default("oak"),
    lighting: LightingSchema.default("day"),
  }),
  /** true once the user confirmed real-world scale (sample plans ship confirmed) */
  scaleConfirmed: z.boolean().default(false),
});
export type Scene = z.infer<typeof SceneSchema>;

export function emptyScene(): Scene {
  return {
    version: 1,
    walls: [],
    openings: [],
    rooms: [],
    items: [],
    style: { wallColor: "#f3efe8", floor: "oak", lighting: "day" },
    scaleConfirmed: false,
  };
}

export type UnitType = "studio" | "1br" | "2br" | "custom";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  /** set on assistant messages that produced a proposal */
  proposalId?: string;
  provider?: "claude" | "demo";
}

export interface Project {
  id: string;
  name: string;
  unitType: UnitType;
  createdAt: number;
  updatedAt: number;
  /** optimistic concurrency counter; incremented on every save */
  revision: number;
  scene: Scene;
  conversation: ChatMessage[];
  thumbnail?: string;
  preferences?: { style?: string; budget?: number; notes?: string };
}
