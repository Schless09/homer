import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getCatalogItem } from "@/lib/catalog/items";
import { searchCatalog } from "@/lib/catalog/search";
import { CATEGORIES, STYLES } from "@/lib/catalog/types";
import { applyActions, DesignActionSchema, type DesignAction } from "@/lib/scene/actions";
import { PALETTES, getPalette } from "@/lib/scene/palette";
import { fitCheck, generateAlternatives, solveLayout, type LayoutAlternative } from "@/lib/scene/solver";
import { summarizeScene } from "@/lib/scene/summary";
import type { Scene } from "@/lib/scene/types";
import { sceneMetrics, validateScene } from "@/lib/scene/validate";
import type { DesignRequest, DesignResponse } from "../types";
import { aiConfig } from "./config";

const MAX_TURNS = 10;

const SYSTEM = `You are Homer, an expert interior designer and space planner embedded in a 2D/3D floor plan editor.

You work on a canonical scene model measured in INCHES. Coordinates: x grows east (right), y grows south (down). Rotation is degrees clockwise; at rotation 0 a piece's front faces south (+y) and its back faces north (-y). Rotation 90 → front faces west, 180 → front faces north, 270 → front faces east. Item x/y is the CENTER of its footprint; width runs along the item's local x axis, depth along its local y axis.

Ground rules:
- Use only furniture from the catalog (look it up with search_catalog). Never invent products, prices, or dimensions. Prices are sample estimates; say so when you quote totals.
- Never change walls, doors, windows, rooms or fixed fixtures. Items marked "fixed" are part of the floor plan; items marked "locked" were locked by the user. Leave both alone.
- Prefer auto_layout to furnish whole rooms or apartments: its solver uses true dimensions and guarantees no collisions, clear door swings and recommended walkways. Use apply_changes for targeted edits (move, rotate, swap, recolor, add one piece).
- After changes, read the returned issues. If a change you made causes an error or clearance warning, fix it before finishing, or explain the trade-off.
- For "can I fit…" questions, use check_fit and answer from its result. If something doesn't fit, say why in concrete inches and suggest a smaller piece that does.
- When asked for multiple layouts/options, call generate_alternatives once.
- Respect budgets: pick pieces so the sample total stays under budget and state the total.
- Changes you make are shown to the user as a preview they can accept or reject. Only make changes when the user asks for a change; for pure questions, answer without editing.

Final answer style: warm, concise and specific (under ~150 words). Lead with what you did or the answer, then 2–5 short bullets with concrete placements and measurements (feet and inches), then any caveats. No markdown headers.`;

const SearchInput = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  style: z.string().optional(),
  max_price: z.number().optional(),
  max_width: z.number().optional(),
  max_depth: z.number().optional(),
});
const FitInput = z.object({ catalog_id: z.string(), room_id: z.string().optional() });
const RequestItem = z.object({ catalog_id: z.string(), quantity: z.number().int().min(1).max(8).optional() });
const LayoutInput = z.object({
  items: z.array(RequestItem).min(1).max(40),
  strategy: z.enum(["open", "functional", "design"]).default("design"),
  keep_existing: z.boolean().default(false),
  room_id: z.string().optional(),
  palette: z.string().optional(),
});
const ApplyInput = z.object({ actions: z.array(z.unknown()).min(1).max(60) });
const AltInput = z.object({ items: z.array(RequestItem).min(1).max(40), keep_existing: z.boolean().default(false), palette: z.string().optional() });

const requestItemSchema = {
  type: "object",
  properties: { catalog_id: { type: "string" }, quantity: { type: "integer", minimum: 1, maximum: 8 } },
  required: ["catalog_id"],
} as const;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_catalog",
    description: "Search the furniture catalog. Returns ids, real dimensions (inches), sample prices, styles and finish options.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free text, e.g. 'oak nightstand'" },
        category: { type: "string", enum: CATEGORIES.map((c) => c.id).filter((c) => c !== "fixtures") },
        style: { type: "string", enum: [...STYLES] },
        max_price: { type: "number" },
        max_width: { type: "number", description: "inches" },
        max_depth: { type: "number", description: "inches" },
      },
    },
  },
  {
    name: "check_fit",
    description: "Check whether a catalog piece can be added to the current design without collisions, blocked doors, or insufficient clearance. Returns a valid placement or the reason it fails and a smaller alternative.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { catalog_id: { type: "string" }, room_id: { type: "string" } }, required: ["catalog_id"] },
  },
  {
    name: "auto_layout",
    description:
      "Furnish the space with the given catalog pieces using the spatial solver (real dimensions, clearances, door swings, wall placement). keep_existing=false replaces all current non-fixed furniture; true adds around it. Optionally applies a design palette that picks matching finishes and sets wall color and flooring.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        items: { type: "array", items: requestItemSchema },
        strategy: { type: "string", enum: ["open", "functional", "design"], description: "open = maximize open floor; functional = daily-use convenience; design = symmetry and focal points" },
        keep_existing: { type: "boolean" },
        room_id: { type: "string", description: "Restrict to one room" },
        palette: { type: "string", enum: PALETTES.map((p) => p.id) },
      },
      required: ["items"],
    },
  },
  {
    name: "apply_changes",
    description:
      "Apply targeted edits. Each action is one of: add_item{catalog_id,x,y,rotation,color?,material?,ref?}, move_item{item_id,x,y,rotation?}, rotate_item{item_id,rotation}, remove_item{item_id}, replace_item{item_id,catalog_id,color?}, set_item_finish{item_id,color?,material?}, set_wall_color{color}, set_floor{material,room_id?}. Colors are #rrggbb. Returns what applied, what was rejected, and the resulting issues.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["add_item", "move_item", "rotate_item", "remove_item", "replace_item", "set_item_finish", "set_wall_color", "set_floor"] },
              catalog_id: { type: "string" },
              item_id: { type: "string" },
              ref: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
              rotation: { type: "number" },
              color: { type: "string" },
              material: { type: "string" },
              room_id: { type: "string" },
            },
            required: ["action"],
          },
        },
      },
      required: ["actions"],
    },
  },
  {
    name: "generate_alternatives",
    description: "Generate three alternative layouts (maximum open space, maximum functionality, design-focused) for the same set of pieces. The user compares them side by side.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { items: { type: "array", items: requestItemSchema }, keep_existing: { type: "boolean" }, palette: { type: "string", enum: PALETTES.map((p) => p.id) } },
      required: ["items"],
    },
  },
  {
    name: "get_scene",
    description: "Return the current (working) design: rooms, openings, every item with id/position/rotation/size, and current spacing issues.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: {} },
  },
];

interface Working {
  original: Scene;
  actions: DesignAction[];
  scene: Scene;
  alternatives?: LayoutAlternative[];
}

function stripScene(scene: Scene): Scene {
  // the reference image never goes to the model
  return { ...scene, background: undefined };
}

function issuesFor(scene: Scene) {
  return validateScene(scene).map((i) => ({ item_id: i.itemId, severity: i.severity, message: i.message }));
}

function runTool(name: string, input: unknown, w: Working): { content: string; isError?: boolean } {
  switch (name) {
    case "search_catalog": {
      const p = SearchInput.safeParse(input);
      if (!p.success) return { content: JSON.stringify({ INVALID_INPUT: p.error.issues }), isError: true };
      const results = searchCatalog({
        text: p.data.query,
        category: (p.data.category as never) ?? "all",
        style: (p.data.style as never) ?? "all",
        maxPrice: p.data.max_price,
        maxWidth: p.data.max_width,
        maxDepth: p.data.max_depth,
      }).slice(0, 25);
      return {
        content: JSON.stringify(
          results.map((c) => ({ id: c.id, name: c.name, category: c.category, width: c.width, depth: c.depth, height: c.height, sample_price: c.price, styles: c.styles, finishes: c.colors.map((x) => `${x.name} ${x.hex}`), materials: c.materials })),
        ),
      };
    }
    case "check_fit": {
      const p = FitInput.safeParse(input);
      if (!p.success) return { content: JSON.stringify({ INVALID_INPUT: p.error.issues }), isError: true };
      const c = getCatalogItem(p.data.catalog_id);
      if (!c) return { content: `Unknown catalog id ${p.data.catalog_id}`, isError: true };
      const r = fitCheck(w.scene, c.id, p.data.room_id);
      return {
        content: JSON.stringify(
          r.fits && r.item
            ? { fits: true, suggested_placement: { x: Math.round(r.item.x), y: Math.round(r.item.y), rotation: r.item.rotation }, dimensions: `${c.width}x${c.depth}x${c.height}` }
            : { fits: false, reason: r.failure?.reason, smaller_alternative: r.failure?.suggestion },
        ),
      };
    }
    case "auto_layout": {
      const p = LayoutInput.safeParse(input);
      if (!p.success) return { content: JSON.stringify({ INVALID_INPUT: p.error.issues }), isError: true };
      const unknown = p.data.items.filter((i) => !getCatalogItem(i.catalog_id));
      if (unknown.length) return { content: `Unknown catalog ids: ${unknown.map((u) => u.catalog_id).join(", ")}. Use search_catalog.`, isError: true };
      const palette = getPalette(p.data.palette);
      const res = solveLayout(
        w.scene,
        p.data.items.map((i) => ({ catalogId: i.catalog_id, quantity: i.quantity, roomId: p.data.room_id })),
        { strategy: p.data.strategy, keepExisting: p.data.keep_existing, palette, seed: 17, roomId: p.data.room_id },
      );
      const acts: DesignAction[] = [{ action: "set_layout", items: res.items }];
      if (palette) acts.push({ action: "set_wall_color", color: palette.wallColor }, { action: "set_floor", material: palette.floor });
      w.actions.push(...acts);
      w.scene = applyActions(w.scene, acts).scene;
      const m = sceneMetrics(w.scene);
      return {
        content: JSON.stringify({
          placed: res.added.map((i) => ({ id: i.id, name: getCatalogItem(i.catalogId)?.name, x: Math.round(i.x), y: Math.round(i.y), rotation: i.rotation, width: i.width, depth: i.depth })),
          could_not_place: res.failed,
          metrics: { open_floor_pct: Math.round(m.openPct * 100), sample_total_usd: m.totalPrice, pieces: m.itemCount },
          issues: issuesFor(w.scene),
        }),
      };
    }
    case "apply_changes": {
      const p = ApplyInput.safeParse(input);
      if (!p.success) return { content: JSON.stringify({ INVALID_INPUT: p.error.issues }), isError: true };
      const valid: DesignAction[] = [];
      const invalid: { index: number; error: string }[] = [];
      p.data.actions.forEach((a, index) => {
        const r = DesignActionSchema.safeParse(a);
        if (r.success && r.data.action !== "set_layout") valid.push(r.data);
        else invalid.push({ index, error: r.success ? "set_layout is not allowed here; use auto_layout" : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
      });
      const res = applyActions(w.scene, valid);
      const okActions = valid.filter((a) => !res.rejected.some((r) => r.action === a));
      w.actions.push(...okActions);
      w.scene = res.scene;
      return {
        content: JSON.stringify({
          applied: res.applied,
          rejected: [...res.rejected.map((r) => r.reason), ...invalid.map((i) => `action ${i.index}: ${i.error}`)],
          new_item_ids: w.scene.items.filter((i) => !w.original.items.some((o) => o.id === i.id)).map((i) => ({ id: i.id, catalog_id: i.catalogId })),
          issues: issuesFor(w.scene),
        }),
      };
    }
    case "generate_alternatives": {
      const p = AltInput.safeParse(input);
      if (!p.success) return { content: JSON.stringify({ INVALID_INPUT: p.error.issues }), isError: true };
      const palette = getPalette(p.data.palette);
      const alts = generateAlternatives(w.scene, p.data.items.filter((i) => getCatalogItem(i.catalog_id)).map((i) => ({ catalogId: i.catalog_id, quantity: i.quantity })), { palette, keepExisting: p.data.keep_existing });
      w.alternatives = alts;
      const first: DesignAction[] = [{ action: "set_layout", items: alts[0].items }];
      if (palette) first.push({ action: "set_wall_color", color: palette.wallColor }, { action: "set_floor", material: palette.floor });
      w.actions.push(...first);
      w.scene = applyActions(w.scene, first).scene;
      return {
        content: JSON.stringify(
          alts.map((a) => ({ name: a.name, open_floor_pct: Math.round(a.metrics.openPct * 100), sample_total_usd: a.metrics.totalPrice, spacing_notes: a.metrics.warnings + a.metrics.errors, not_placed: a.failed })),
        ),
      };
    }
    case "get_scene":
      return { content: JSON.stringify(summarizeScene(w.scene)) };
    default:
      return { content: `Unknown tool ${name}`, isError: true };
  }
}

export async function runClaudeDesigner(req: DesignRequest): Promise<DesignResponse> {
  const cfg = aiConfig();
  const client = new Anthropic();
  const scene = stripScene(req.scene);
  const w: Working = { original: scene, actions: [], scene };

  const history: Anthropic.MessageParam[] = [];
  for (const h of req.history.slice(-12)) {
    const last = history[history.length - 1];
    if (last && last.role === h.role) continue;
    if (!history.length && h.role === "assistant") continue;
    history.push({ role: h.role, content: h.content });
  }
  if (history.length && history[history.length - 1].role === "user") history.pop();

  const prefs = req.preferences ? `\nSaved preferences: ${JSON.stringify(req.preferences)}` : "";
  const messages: Anthropic.MessageParam[] = [
    ...history,
    {
      role: "user",
      content: `Current design (inches):\n${JSON.stringify(summarizeScene(scene))}\n\nAvailable palettes: ${PALETTES.map((p) => `${p.id} (${p.name})`).join(", ")}${prefs}\n\nRequest: ${req.message}`,
    },
  ];

  let finalText = "";
  let jsonRetries = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // Haiku by default: the solver/validator do the spatial math, the model picks pieces and calls tools.
    const stream = client.messages.stream({
      model: cfg.designerModel,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: cfg.designerEffort },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    });
    let message: Anthropic.Message;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
      continue;
    }

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text) finalText = text;

    if (message.stop_reason === "refusal") {
      finalText = finalText || "I can't help with that request.";
      break;
    }
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (message.stop_reason !== "tool_use" || !toolUses.length) break;

    messages.push({ role: "assistant", content: message.content });
    const results: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => {
      const r = runTool(tu.name, tu.input, w);
      return { type: "tool_result", tool_use_id: tu.id, content: r.content, is_error: r.isError };
    });
    messages.push({ role: "user", content: results });
  }

  const changed = w.actions.length > 0;
  return {
    provider: "claude",
    message: finalText || (changed ? "Here's the proposed change." : "Done."),
    title: changed ? "AI design proposal" : undefined,
    actions: w.actions,
    alternatives: w.alternatives,
  };
}
