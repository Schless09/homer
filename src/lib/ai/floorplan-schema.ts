import { z } from "zod";

/**
 * Structured floor plan extraction, in IMAGE PIXEL coordinates. The client
 * converts to inches only after the user confirms (or sets) the scale.
 */
export const FloorplanExtractionSchema = z.object({
  walls: z.array(
    z.object({
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
      thickness_px: z.number(),
      exterior: z.boolean(),
    }),
  ),
  openings: z.array(
    z.object({
      kind: z.enum(["door", "window", "opening"]),
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
    }),
  ),
  rooms: z.array(
    z.object({
      name: z.string(),
      type: z.enum(["living", "bedroom", "kitchen", "dining", "bathroom", "closet", "entry", "office", "studio", "laundry", "balcony", "other"]),
      polygon: z.array(z.object({ x: z.number(), y: z.number() })),
      labeled_dimensions: z.string().nullable(),
    }),
  ),
  fixtures: z.array(
    z.object({
      type: z.enum(["kitchen-counter", "kitchen-island", "refrigerator", "range", "sink-counter", "toilet", "bathtub", "shower", "vanity", "closet", "washer-dryer"]),
      x: z.number(),
      y: z.number(),
      width_px: z.number(),
      depth_px: z.number(),
      rotation: z.number(),
    }),
  ),
  dimension_annotations: z.array(
    z.object({
      text: z.string(),
      inches: z.number(),
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
    }),
  ),
  notes: z.string(),
});
export type FloorplanExtraction = z.infer<typeof FloorplanExtractionSchema>;

export const FIXTURE_TO_CATALOG: Record<FloorplanExtraction["fixtures"][number]["type"], string> = {
  "kitchen-counter": "fx-counter",
  "kitchen-island": "fx-island",
  refrigerator: "fx-fridge",
  range: "fx-range",
  "sink-counter": "fx-sink",
  toilet: "fx-toilet",
  bathtub: "fx-tub",
  shower: "fx-shower",
  vanity: "fx-vanity",
  closet: "fx-closet",
  "washer-dryer": "fx-washer",
};
