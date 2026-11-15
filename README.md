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

## Selling real products (affiliate feeds)

Retailer products flow in from affiliate network feeds and show up everywhere the sample catalog does: catalog (with a Shop filter), 2D/3D at their listed size and color, the AI designer (which prefers real, in-stock products that fit), photoreal render prompts, and the shopping list.

1. **Join networks** and get approved by retailers (Impact, CJ, Rakuten, Awin, ShareASale, Amazon Associates). Each gives you a product feed URL (CSV/TSV/JSON) whose links already carry your affiliate ID.
2. **Import.** Either:
   - one-off: `npm run feed:import -- --file feed.csv --retailer "Article" --network impact` (writes `src/data/retailer-catalog.json`, bundled with the app), or add `--supabase` to write to the database; or
   - daily: set `HOMER_FEEDS`, `HOMER_SUPABASE_SECRET_KEY` and `CRON_SECRET` on Vercel. `vercel.json` schedules `/api/feeds/sync`, which upserts products and deactivates ones that left the feed.
3. **Get paid.** Every Buy button goes through `/go/<product>`, which logs the click in `homer_affiliate_clicks` and adds a unique click ID to the network's sub-ID parameter (`subId1`, `sid`, `u1`, `clickref`, `afftrack`, Amazon `ascsubtag`). Commission reports in each network dashboard show that ID, so every sale can be traced to a click and project. The redirect only ever goes to the stored product URL.

What the importer does: classifies each product into a furniture type, extracts real width × depth (× height) from feed fields, titles or descriptions (inches, cm, feet), and **rejects** anything without stated dimensions, implausible sizes, or non-furniture (pillows, bedding). `npm run feed:check -- feed.csv` previews the result. Height is marked as approximate when a feed lists only the footprint. If a feed includes a GLB model URL, the 3D view loads it, fitted to the listed dimensions.

Disclosure: buy links carry `rel="sponsored"`, and a commission notice appears next to them and at `/disclosure` (US FTC requirement).

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
- Importing commission reports automatically (the `homer_affiliate_conversions` table is ready; today you read them in each network's dashboard).
- "Upload a photo / paste a product URL" to add a piece that isn't in a feed.
- Live share links and multi-user collaboration (project files work today).
- GLB furniture models (every piece has a procedural model; `modelUrl` is reserved for this).
- CAD (DWG/DXF) import.
