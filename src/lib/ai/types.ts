import { z } from "zod";
import { DesignActionSchema, type DesignAction } from "@/lib/scene/actions";
import { SceneSchema } from "@/lib/scene/types";
import type { LayoutAlternative } from "@/lib/scene/solver";

export const DesignRequestSchema = z.object({
  scene: SceneSchema,
  message: z.string().min(1).max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .max(40)
    .default([]),
  preferences: z
    .object({ style: z.string().optional(), budget: z.number().optional(), notes: z.string().optional() })
    .optional(),
});
export type DesignRequest = z.infer<typeof DesignRequestSchema>;

export interface DesignResponse {
  provider: "claude" | "demo";
  message: string;
  title?: string;
  actions: DesignAction[];
  alternatives?: LayoutAlternative[];
  /** shown to the user when the response came from a fallback or has caveats */
  notice?: string;
}

export const DesignResponseActionsSchema = z.array(DesignActionSchema);

export interface AIStatus {
  claude: boolean;
  model: string | null;
  imageProvider: string | null;
  storage: "local" | "supabase";
}
