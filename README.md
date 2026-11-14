# Homer

AI interior design and space planning. Upload a floor plan, tell the AI how you want to live, and see the space furnished in 2D and 3D before buying anything.

## What works today

- **Dashboard**: sample studio / 1-bedroom / 2-bedroom apartments, blank rooms, design templates, project import/export. First visit opens a furnished demo studio.
- **Floor plan import**: PNG, JPG or PDF (page 1, rendered with pdf.js). You set the scale by clicking a known dimension. With an API key, Claude reads walls, doors, windows, rooms and fixtures, and suggests a scale from printed dimensions; you confirm it. Dimensions are never assumed. The original plan stays as a reference layer you can trace over (Draw room, Draw wall, Add door/window).
- **2D editor (Konva)**: click or drag furniture in, move, rotate (15° snaps), resize where it makes sense (rugs, fixtures), duplicate, delete, lock, multi-select (shift-click, shift-drag), undo/redo, zoom/pan, grid, wall snapping, alignment guides, live distance-to-wall measurements, measure tool.
- **Spatial validation**: collisions, walls, out-of-room, door swings, walkway clearances (bed sides, sofa front, desk chair, dining chairs, kitchen work zones) and windows blocked by tall pieces. Shown on the canvas and in the Space check panel.
- **3D (React Three Fiber)**: orbit, top-down, and first-person walk mode; full/cutaway/no walls; daylight, golden hour, evening (lamps light up); procedural textured floors; procedural models for every catalog piece. Same store as 2D, so edits in either view appear immediately in the other. Drag furniture directly in 3D.
- **AI interior designer**: natural-language requests become validated, structured scene actions shown as a preview you accept or discard. Three-layout comparison (open space / functionality / design), fit checks ("Can I fit a king bed?"), budgets, restyling, moving a piece, walkway checks.
- **Visualize**: an accurate 3D snapshot always; photorealistic AI renders when an image provider is configured (async job + polling).
- **Persistence**: autosave with debouncing and optimistic concurrency (revision check, conflict prompt). Browser IndexedDB by default, Supabase when configured (falls back to the browser automatically if Supabase is unreachable).

## Architecture

```
Floor plan upload ──▶ AI extraction (pixels) ──▶ user-confirmed scale
                                                    │
                                                    ▼
                    ┌──────── Canonical scene (inches) ────────┐
                    │ walls · openings · rooms · items · style │
                    └──────────────────────────────────────────┘
                      ▲          ▲            ▲            ▲
                 2D editor    3D view   Layout solver   AI designer
                                         + validator    (tool use)
```

- `src/lib/scene/`: the scene model (Zod), geometry, validation, snapping, the layout solver (wall/corner/relative placement, clearance-aware, three strategies), and the action executor. Pure TypeScript, shared by browser and server.
- `src/lib/catalog/`: 68 sample pieces with real dimensions, finishes and clearances. Prices are illustrative estimates, not retailer listings. `CatalogProvider` is the seam for real product feeds.
- `src/lib/ai/`: request/response types, the rule-based demo designer, and `server/` (Claude tool loop, floor plan vision, render provider). API keys stay server-side.
- `src/store/`: Zustand editor store (scene, history, selection, preview) and viewport.
- `src/components/editor/`: the three-panel editor, `plan/` (Konva) and `three/` (R3F).
- `supabase/migrations/`: schema with Row Level Security on every table and a private storage bucket. Every object is prefixed `homer_` (bucket `homer-floorplans`), so it can share a Supabase project with other apps.

### AI design loop

The designer never edits geometry directly. Claude calls tools (`search_catalog`, `check_fit`, `auto_layout`, `apply_changes`, `generate_alternatives`, `get_scene`). Tool inputs are validated with Zod; every change runs through the same validator the editor uses and the issues are returned to the model so it can fix them. Walls, doors, windows, rooms and fixed fixtures can't be modified, and user-locked pieces are respected. The server re-validates the final actions before responding, and the browser shows them as a preview.

### Model choice and cost

All user-facing AI defaults to **Claude Haiku 5.5**. The deterministic solver and validator do the spatial reasoning, so a small model mostly has to understand intent, pick catalog pieces and call tools. Each task can be escalated independently with env vars (see `.env.example`), e.g. `ANTHROPIC_VISION_MODEL=claude-sonnet-5-5` for hard-to-read scans.

## Running locally

```bash
npm install
cp .env.example .env.local   # optional: add ANTHROPIC_API_KEY
npm run dev
```

No keys are required: without `ANTHROPIC_API_KEY` the AI panel runs in clearly labeled demo mode, and floor plan import uses manual calibration and tracing.

## Deploying to Vercel

1. Import the repo in Vercel (framework: Next.js, no extra config).
2. Add `ANTHROPIC_API_KEY` (and optionally `REPLICATE_API_TOKEN`) as environment variables.
3. For cloud persistence: apply `supabase/migrations/*.sql` to your Supabase project, enable **Anonymous sign-ins** under Auth settings, then set `HOMER_NEXT_PUBLIC_SUPABASE_URL` and `HOMER_NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Homer ignores the generic `NEXT_PUBLIC_SUPABASE_*` names so it never connects to another app's project.

AI routes set `maxDuration` (120 s) for longer tool loops; on the Hobby plan Vercel caps functions lower.

## Keyboard shortcuts

`1` 2D · `2` 3D · `3` top · `4` walk · `V` select · `H` pan · `M` measure · `W` wall · `R` / `Shift+R` rotate 90° · `Q` / `E` rotate 15° · arrows nudge 1" (`Shift` 12") · `⌘D` duplicate · `Delete` remove · `⌘Z` / `⇧⌘Z` undo/redo · `G` grid · `F` fit · `Enter` / `Esc` accept/discard an AI preview.

## Not built yet

- Gemini (or other) providers: the AI layer is Claude-only today; `src/lib/ai/server/` is the place to add another adapter.
- Real retailer catalog and purchase links; "upload a photo / paste a product URL" to add furniture.
- Live share links and multi-user collaboration (project files work today).
- GLB furniture models (every piece has a procedural model; `modelUrl` is reserved for this).
- CAD (DWG/DXF) import.
