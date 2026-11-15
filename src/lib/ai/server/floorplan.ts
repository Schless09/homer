import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { FloorplanExtractionSchema, type FloorplanExtraction } from "../floorplan-schema";
import { aiConfig } from "./config";

const PROMPT = (w: number, h: number) => `This is an apartment floor plan image, ${w} × ${h} pixels. Extract its architecture as precise geometry in IMAGE PIXEL coordinates (origin top-left, x right, y down).

- walls: centerline segments of every wall. Merge collinear pieces; split walls at corners. Give approximate thickness in pixels; mark perimeter walls exterior=true.
- openings: doors, windows and open passages, as the two endpoints of the gap along the wall they sit in.
- rooms: one polygon per room following the interior faces of its walls; name it as labeled (or by function) and classify the type. If the plan prints room dimensions (e.g. "12'6\\" x 11'"), copy that text to labeled_dimensions.
- fixtures: built-ins drawn on the plan (kitchen counters, island, fridge, range, sink, toilet, tub, shower, vanity, closets, washer/dryer) with center, size in pixels and rotation in degrees (0 = front faces down the image).
- dimension_annotations: every printed measurement you can read, with its value in inches and the pixel endpoints of what it measures. Only include ones you can actually read; never guess.
- stated_total_sqft: the unit's total area if printed anywhere in the image (e.g. "609 sq. ft."), else null.
- plan_name: the unit or floor plan name if printed (e.g. "East 02", "Plan A1"), else null.
- notes: anything uncertain.
The image may be a screenshot with other content (phone UI, listing text, prices). Only extract the floor plan drawing itself.

Be geometrically careful: walls should meet at corners, and rooms should not overlap.`;

export async function extractFloorplan(image: { data: string; mediaType: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number }): Promise<FloorplanExtraction> {
  const cfg = aiConfig();
  const client = new Anthropic();
  const res = await client.messages.parse({
    model: cfg.visionModel,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: cfg.visionEffort, format: zodOutputFormat(FloorplanExtractionSchema) },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
          { type: "text", text: PROMPT(image.width, image.height) },
        ],
      },
    ],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined to read this image.");
  if (!res.parsed_output) throw new Error("Could not parse a floor plan from the model output.");
  return res.parsed_output;
}
