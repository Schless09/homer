"use client";

import { useMemo, useState } from "react";
import {
  DoorOpen,
  Eye,
  EyeOff,
  Hammer,
  LayoutGrid,
  Paintbrush,
  PanelTop,
  Ruler,
  Search,
  SlidersHorizontal,
  Square,
  Sofa,
  Spline,
} from "lucide-react";
import { CATEGORIES, STYLES, type CategoryId, type Style } from "@/lib/catalog/types";
import { FIXTURES, getCatalogItem } from "@/lib/catalog/items";
import { searchCatalog } from "@/lib/catalog/search";
import { PALETTES, pickColor } from "@/lib/scene/palette";
import { FLOOR_MATERIALS, type FloorMaterial, type Lighting } from "@/lib/scene/types";
import { formatPrice } from "@/lib/scene/units";
import { useEditor } from "@/store/editor";
import { useViewport } from "@/store/viewport";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CatalogThumb } from "./CatalogThumb";
import { FloorSwatch } from "./FloorSwatch";

export function viewCenterScene() {
  const v = useViewport.getState();
  const st = v.stage;
  if (!st) return undefined;
  return { x: Math.round((st.width() / 2 - v.x) / v.scale), y: Math.round((st.height() / 2 - v.y) / v.scale) };
}

export function LeftPanel() {
  return (
    <Tabs defaultValue="furniture" className="flex h-full flex-col">
      <div className="px-3 pt-3">
        <TabsList className="w-full">
          <TabsTrigger value="furniture">
            <Sofa /> Furniture
          </TabsTrigger>
          <TabsTrigger value="build">
            <Hammer /> Build
          </TabsTrigger>
          <TabsTrigger value="style">
            <Paintbrush /> Style
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="furniture" className="min-h-0">
        <CatalogBrowser />
      </TabsContent>
      <TabsContent value="build" className="min-h-0 overflow-y-auto thin-scroll">
        <BuildPanel />
      </TabsContent>
      <TabsContent value="style" className="min-h-0 overflow-y-auto thin-scroll">
        <StylePanel />
      </TabsContent>
    </Tabs>
  );
}

function CatalogBrowser() {
  const [text, setText] = useState("");
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const [style, setStyle] = useState<Style | "all">("all");
  const [maxPrice, setMaxPrice] = useState(4000);
  const [maxWidth, setMaxWidth] = useState(130);
  const addItem = useEditor((s) => s.addItem);
  const previewing = useEditor((s) => !!s.preview);
  const results = useMemo(
    () => searchCatalog({ text, category, style, maxPrice: maxPrice >= 4000 ? undefined : maxPrice, maxWidth: maxWidth >= 130 ? undefined : maxWidth }),
    [text, category, style, maxPrice, maxWidth],
  );
  const filtersActive = style !== "all" || maxPrice < 4000 || maxWidth < 130;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 px-3 pt-3 pb-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search sofas, oak, 60&quot;…" className="h-8 pl-8 text-[13px]" aria-label="Search catalog" />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="Filters" className={cn(filtersActive && "border-brand text-brand")}>
                <SlidersHorizontal />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-4">
              <div className="space-y-2">
                <Label>Style</Label>
                <div className="flex flex-wrap gap-1">
                  {(["all", ...STYLES] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStyle(s)}
                      className={cn("rounded-full border px-2 py-0.5 text-[11px] capitalize transition-colors", style === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Max price</Label>
                  <span className="text-xs">{maxPrice >= 4000 ? "Any" : formatPrice(maxPrice)}</span>
                </div>
                <Slider value={[maxPrice]} min={100} max={4000} step={50} onValueChange={([v]) => setMaxPrice(v)} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Max width</Label>
                  <span className="text-xs">{maxWidth >= 130 ? "Any" : `${maxWidth}"`}</span>
                </div>
                <Slider value={[maxWidth]} min={12} max={130} step={2} onValueChange={([v]) => setMaxWidth(v)} />
              </div>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => { setStyle("all"); setMaxPrice(4000); setMaxWidth(130); }}>
                Reset filters
              </Button>
            </PopoverContent>
          </Popover>
        </div>
        <div className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-1 thin-scroll">
          {[{ id: "all", label: "All" } as const, ...CATEGORIES.filter((c) => c.id !== "fixtures")].map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id as CategoryId | "all")}
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                category === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between px-3 pb-1.5 text-[11px] text-muted-foreground">
        <span>{results.length} pieces · drag or click to place</span>
        <span>Sample prices</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 thin-scroll" data-testid="catalog-list">
        <div className="grid grid-cols-2 gap-2">
          {results.map((c) => (
            <button
              key={c.id}
              draggable={!previewing}
              disabled={previewing}
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-homer-catalog", c.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => addItem(c.id, viewCenterScene())}
              className="group flex flex-col items-stretch rounded-lg border bg-card p-2 text-left transition-all hover:-translate-y-px hover:border-[#cfc7ba] hover:shadow-sm disabled:opacity-50"
              data-testid={`catalog-${c.id}`}
              title={c.description}
            >
              <div className="flex h-16 items-center justify-center rounded-md bg-[#f6f3ee]">
                <CatalogThumb item={c} />
              </div>
              <div className="mt-1.5 line-clamp-1 text-[12px] font-medium leading-tight">{c.name}</div>
              <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {c.width}" × {c.depth}"
                </span>
                <span className="text-foreground/80">{formatPrice(c.price)}</span>
              </div>
              <div className="mt-1 flex gap-0.5">
                {c.colors.slice(0, 5).map((col) => (
                  <span key={col.hex} className="size-2.5 rounded-full border border-black/10" style={{ background: col.hex }} title={col.name} />
                ))}
              </div>
            </button>
          ))}
        </div>
        {results.length === 0 && (
          <div className="mt-10 text-center text-sm text-muted-foreground">
            Nothing matches those filters.
            <br />
            Try a wider width or price range.
          </div>
        )}
      </div>
    </div>
  );
}

function BuildPanel() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const addItem = useEditor((s) => s.addItem);
  const bg = useEditor((s) => s.scene.background);
  const apply = useEditor((s) => s.apply);
  const showBackground = useEditor((s) => s.showBackground);
  const toggle = useEditor((s) => s.toggle);
  const tools = [
    { id: "room", label: "Draw room", hint: "Drag a rectangle; walls are created for you", icon: Square },
    { id: "wall", label: "Draw wall", hint: "Click to start, click to place each corner; Esc to finish", icon: Spline },
    { id: "door", label: "Add door", hint: "Click on a wall", icon: DoorOpen },
    { id: "window", label: "Add window", hint: "Click on a wall", icon: PanelTop },
    { id: "measure", label: "Measure", hint: "Click two points", icon: Ruler },
  ] as const;
  return (
    <div className="space-y-5 p-3">
      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Floor plan tools</h3>
        <div className="grid gap-1.5">
          {tools.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(tool === t.id ? "select" : t.id)}
              className={cn("flex items-start gap-2.5 rounded-lg border bg-card p-2.5 text-left transition-colors hover:bg-accent", tool === t.id && "border-brand bg-brand-soft")}
            >
              <t.icon className={cn("mt-0.5 size-4", tool === t.id ? "text-brand" : "text-muted-foreground")} />
              <span>
                <span className="block text-[13px] font-medium">{t.label}</span>
                <span className="block text-[11px] text-muted-foreground">{t.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {bg && (
        <section className="space-y-2">
          <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Reference layer</h3>
          <div className="space-y-3 rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px]">Original floor plan</span>
              <Button variant="ghost" size="icon-xs" onClick={() => toggle("showBackground")} aria-label="Toggle reference layer">
                {showBackground ? <Eye /> : <EyeOff />}
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>Opacity</Label>
              <Slider
                value={[bg.opacity]}
                min={0.05}
                max={1}
                step={0.05}
                onValueChange={([v]) => apply((s) => (s.background ? { ...s, background: { ...s.background, opacity: v } } : s))}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Scale: {bg.calibrated ? `${(bg.scale * 100).toFixed(1)}" per 100 px (calibrated)` : "not calibrated"}
            </p>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Room fixtures</h3>
        <p className="text-[11px] text-muted-foreground">Fixtures are part of the floor plan. They are locked, and the AI never moves them.</p>
        <div className="grid grid-cols-2 gap-1.5">
          {FIXTURES.map((f) => (
            <button
              key={f.id}
              onClick={() => addItem(f.id, viewCenterScene())}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("application/x-homer-catalog", f.id)}
              className="flex items-center gap-2 rounded-lg border bg-card p-1.5 text-left text-[12px] hover:bg-accent"
            >
              <CatalogThumb item={f} size={32} />
              <span className="line-clamp-2 leading-tight">{f.name}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

const WALL_COLORS = [
  { name: "Warm white", hex: "#f3efe8" },
  { name: "Gallery white", hex: "#f7f6f2" },
  { name: "Greige", hex: "#e2dbd0" },
  { name: "Sage", hex: "#d7dccd" },
  { name: "Clay", hex: "#e3cbbb" },
  { name: "Mist blue", hex: "#d8e0e4" },
  { name: "Charcoal", hex: "#5a5853" },
  { name: "Deep green", hex: "#3f4a3f" },
];

function StylePanel() {
  const style = useEditor((s) => s.scene.style);
  const apply = useEditor((s) => s.apply);
  const setPreferences = useEditor((s) => s.setPreferences);
  const prefs = useEditor((s) => s.preferences);
  const lightings: { id: Lighting; label: string }[] = [
    { id: "day", label: "Daylight" },
    { id: "golden", label: "Golden hour" },
    { id: "evening", label: "Evening" },
  ];
  return (
    <div className="space-y-5 p-3">
      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Design palettes</h3>
        <div className="grid gap-1.5">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                apply((s) => ({
                  ...s,
                  style: { ...s.style, wallColor: p.wallColor, floor: p.floor },
                  rooms: s.rooms.map((r) => ({ ...r, floor: undefined })),
                  items: s.items.map((i) => {
                    const c = getCatalogItem(i.catalogId);
                    return c && !c.fixture ? { ...i, color: pickColor(c, p) } : i;
                  }),
                }));
                setPreferences({ ...prefs, style: p.id });
              }}
              className={cn("flex items-center gap-3 rounded-lg border bg-card p-2 text-left hover:bg-accent", prefs?.style === p.id && "border-brand")}
            >
              <div className="flex -space-x-1.5">
                {[p.wallColor, p.wood, p.fabric, p.accent].map((c, i) => (
                  <span key={i} className="size-5 rounded-full border-2 border-card" style={{ background: c }} />
                ))}
              </div>
              <span className="text-[13px] font-medium">{p.name}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Wall color</h3>
        <div className="flex flex-wrap gap-2">
          {WALL_COLORS.map((c) => (
            <Tip key={c.hex} label={c.name}>
              <button
                aria-label={c.name}
                onClick={() => apply((s) => ({ ...s, style: { ...s.style, wallColor: c.hex } }))}
                className={cn("size-8 rounded-full border shadow-xs transition-transform hover:scale-105", style.wallColor === c.hex && "ring-2 ring-brand ring-offset-2")}
                style={{ background: c.hex }}
              />
            </Tip>
          ))}
          <label className="relative size-8 cursor-pointer overflow-hidden rounded-full border" title="Custom">
            <input type="color" value={style.wallColor} onChange={(e) => apply((s) => ({ ...s, style: { ...s.style, wallColor: e.target.value } }))} className="absolute inset-0 size-full cursor-pointer opacity-0" />
            <LayoutGrid className="m-auto mt-2 size-4 text-muted-foreground" />
          </label>
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Flooring</h3>
        <div className="grid grid-cols-4 gap-2">
          {FLOOR_MATERIALS.map((m) => (
            <button
              key={m}
              onClick={() => apply((s) => ({ ...s, style: { ...s.style, floor: m as FloorMaterial }, rooms: s.rooms.map((r) => ({ ...r, floor: undefined })) }))}
              className={cn("flex flex-col items-center gap-1 rounded-lg p-1 text-[10px] capitalize hover:bg-accent", style.floor === m && "bg-brand-soft text-brand")}
            >
              <FloorSwatch material={m as FloorMaterial} />
              {m.replace("-", " ")}
            </button>
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Lighting (3D)</h3>
        <div className="flex gap-1.5">
          {lightings.map((l) => (
            <Button key={l.id} size="sm" variant={style.lighting === l.id ? "default" : "outline"} onClick={() => apply((s) => ({ ...s, style: { ...s.style, lighting: l.id } }))}>
              {l.label}
            </Button>
          ))}
        </div>
      </section>
      <Badge variant="secondary" className="w-full justify-center py-1 font-normal">Tip: ask the AI designer to restyle the whole space</Badge>
    </div>
  );
}
