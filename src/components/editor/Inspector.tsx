"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, CircleAlert, Copy, FlipHorizontal, Info, Lock, RotateCcw, RotateCw, ShoppingBag, Trash2, Unlock } from "lucide-react";
import { CATALOG, getCatalogItem } from "@/lib/catalog/items";
import { dist, polygonArea, polygonBounds } from "@/lib/scene/geometry";
import { FLOOR_MATERIALS, ROOM_TYPES, type FloorMaterial, type Item, type RoomType } from "@/lib/scene/types";
import { formatFtIn, formatPrice, formatSqft, parseLength } from "@/lib/scene/units";
import { sceneMetrics, validateScene, type Issue } from "@/lib/scene/validate";
import { fitCheck } from "@/lib/scene/solver";
import { useDisplayScene, useEditor } from "@/store/editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CatalogThumb } from "./CatalogThumb";

function LengthField({ label, value, onCommit, disabled }: { label: string; value: number; onCommit: (v: number) => void; disabled?: boolean }) {
  const [text, setText] = useState(formatFtIn(value));
  useEffect(() => setText(formatFtIn(value)), [value]);
  const commit = () => {
    const v = parseLength(text);
    if (v !== null && Number.isFinite(v)) onCommit(v);
    else setText(formatFtIn(value));
  };
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="h-8 font-mono text-[12px]"
      />
    </div>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  const select = useEditor((s) => s.select);
  const Icon = issue.severity === "error" ? CircleAlert : issue.severity === "warning" ? AlertTriangle : Info;
  return (
    <button
      onClick={() => select([issue.itemId])}
      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-accent"
    >
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", issue.severity === "error" ? "text-destructive" : issue.severity === "warning" ? "text-warning" : "text-muted-foreground")} />
      <span>{issue.message}</span>
    </button>
  );
}

export function Inspector() {
  const scene = useDisplayScene();
  const selection = useEditor((s) => s.selection);
  const issues = useMemo(() => validateScene(scene), [scene]);
  const items = scene.items.filter((i) => selection.includes(i.id));

  if (items.length === 1) return <ItemInspector item={items[0]} issues={issues.filter((i) => i.itemId === items[0].id)} />;
  if (items.length > 1) return <MultiInspector items={items} />;
  const room = scene.rooms.find((r) => selection.includes(r.id));
  if (room) return <RoomInspector id={room.id} />;
  const wall = scene.walls.find((w) => selection.includes(w.id));
  if (wall) return <WallInspector id={wall.id} />;
  const opening = scene.openings.find((o) => selection.includes(o.id));
  if (opening) return <OpeningInspector id={opening.id} />;
  return <ProjectSummary issues={issues} />;
}

function ItemInspector({ item, issues }: { item: Item; issues: Issue[] }) {
  const c = getCatalogItem(item.catalogId);
  const updateItem = useEditor((s) => s.updateItem);
  const apply = useEditor((s) => s.apply);
  const rotateSelected = useEditor((s) => s.rotateSelected);
  const duplicateSelected = useEditor((s) => s.duplicateSelected);
  const removeSelected = useEditor((s) => s.removeSelected);
  const toggleLock = useEditor((s) => s.toggleLockSelected);
  const previewing = useEditor((s) => !!s.preview);
  const scene = useEditor((s) => s.scene);
  const alternatives = useMemo(() => {
    if (!c || c.fixture) return [];
    return CATALOG.filter((x) => x.category === c.category && x.id !== c.id).slice(0, 6);
  }, [c]);
  const fits = useMemo(() => {
    const without = { ...scene, items: scene.items.filter((i) => i.id !== item.id) };
    return new Map(alternatives.map((a) => [a.id, a.width <= item.width + 0.5 && a.depth <= item.depth + 0.5 ? true : fitCheck(without, a.id).fits]));
  }, [alternatives, scene, item.id, item.width, item.depth]);
  if (!c) return null;
  const disabled = previewing;
  const lockedEdit = item.locked || disabled;

  return (
    <div className="space-y-4 p-4 animate-fade-up" data-testid="inspector-item">
      <div className="flex gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-[#f6f3ee]">
          <CatalogThumb item={c} color={item.color} size={56} />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] leading-tight font-semibold">{item.label ?? c.name}</div>
          <div className="mt-0.5 text-[12px] text-muted-foreground capitalize">
            {c.category.replace("-", " ")} · {c.width}" × {c.depth}" × {c.height}"
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {c.fixture ? <Badge variant="secondary">Floor plan fixture</Badge> : <Badge variant="outline">{formatPrice(c.price)} sample price</Badge>}
            {item.locked && !c.fixture && <Badge variant="secondary"><Lock /> Locked</Badge>}
          </div>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="rounded-lg border border-[#ecd9b8] bg-[#fbf5ea] p-1">
          {issues.map((i) => (
            <IssueRow key={i.id} issue={i} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <LengthField label="Position X" value={item.x} disabled={lockedEdit} onCommit={(v) => updateItem(item.id, { x: v })} />
        <LengthField label="Position Y" value={item.y} disabled={lockedEdit} onCommit={(v) => updateItem(item.id, { y: v })} />
      </div>

      <div className="space-y-1">
        <Label>Rotation</Label>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            value={Math.round(item.rotation)}
            disabled={lockedEdit}
            onChange={(e) => updateItem(item.id, { rotation: ((Number(e.target.value) % 360) + 360) % 360 })}
            className="h-8 w-20 font-mono text-[12px]"
            aria-label="Rotation degrees"
          />
          <span className="text-xs text-muted-foreground">°</span>
          <div className="ml-auto flex gap-1">
            <Tip label="Rotate −90°" shortcut="⇧R">
              <Button size="icon-xs" variant="outline" disabled={lockedEdit} onClick={() => rotateSelected(-90)} aria-label="Rotate left">
                <RotateCcw />
              </Button>
            </Tip>
            <Tip label="Rotate +90°" shortcut="R">
              <Button size="icon-xs" variant="outline" disabled={lockedEdit} onClick={() => rotateSelected(90)} aria-label="Rotate right">
                <RotateCw />
              </Button>
            </Tip>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <LengthField label="Width" value={item.width} disabled={!c.resizable || lockedEdit} onCommit={(v) => updateItem(item.id, { width: Math.max(4, v) })} />
        <LengthField label="Depth" value={item.depth} disabled={!c.resizable || lockedEdit} onCommit={(v) => updateItem(item.id, { depth: Math.max(4, v) })} />
        <LengthField label="Height" value={item.height} disabled={!c.resizable || lockedEdit} onCommit={(v) => updateItem(item.id, { height: Math.max(0.5, v) })} />
      </div>
      {!c.resizable && <p className="-mt-2 text-[11px] text-muted-foreground">Real product dimensions. Swap the piece to change size.</p>}

      {c.colors.length > 0 && (
        <div className="space-y-1.5">
          <Label>Finish</Label>
          <div className="flex flex-wrap gap-1.5">
            {c.colors.map((col) => (
              <Tip key={col.hex} label={col.name}>
                <button
                  disabled={disabled}
                  aria-label={col.name}
                  onClick={() => updateItem(item.id, { color: col.hex })}
                  className={cn("size-7 rounded-full border border-black/10 shadow-xs", item.color === col.hex && "ring-2 ring-brand ring-offset-2")}
                  style={{ background: col.hex }}
                />
              </Tip>
            ))}
          </div>
        </div>
      )}
      {c.materials.length > 1 && (
        <div className="space-y-1.5">
          <Label>Material</Label>
          <div className="flex flex-wrap gap-1">
            {c.materials.map((m) => (
              <button
                key={m}
                disabled={disabled}
                onClick={() => updateItem(item.id, { material: m })}
                className={cn("rounded-full border px-2.5 py-1 text-[12px]", item.material === m ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" disabled={disabled || c.fixture} onClick={duplicateSelected}>
          <Copy /> Duplicate
        </Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={toggleLock}>
          {item.locked ? <Unlock /> : <Lock />} {item.locked ? "Unlock" : "Lock"}
        </Button>
        <Button size="sm" variant="outline" disabled={disabled || item.locked} onClick={removeSelected} className="ml-auto text-destructive">
          <Trash2 />
        </Button>
      </div>

      {alternatives.length > 0 && (
        <>
          <Separator />
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <ArrowLeftRight className="size-3" /> Swap for a similar piece
            </Label>
            <div className="space-y-1">
              {alternatives.map((a) => (
                <button
                  key={a.id}
                  disabled={disabled || item.locked}
                  onClick={() =>
                    apply((s) => ({
                      ...s,
                      items: s.items.map((i) => {
                        if (i.id !== item.id) return i;
                        const dd = (a.depth - i.depth) / 2;
                        const r = (i.rotation * Math.PI) / 180;
                        return { ...i, catalogId: a.id, width: a.width, depth: a.depth, height: a.height, color: a.colors[0]?.hex, material: a.materials[0], x: i.x - Math.sin(r) * dd, y: i.y + Math.cos(r) * dd };
                      }),
                    }))
                  }
                  className="flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-accent"
                >
                  <CatalogThumb item={a} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium">{a.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {a.width}" × {a.depth}" · {formatPrice(a.price)}
                    </span>
                  </span>
                  {fits.get(a.id) ? <Badge variant="success">Fits</Badge> : <Badge variant="warning">Tight</Badge>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {!c.fixture && (
        <div className="rounded-lg bg-muted/60 p-3 text-[11px] text-muted-foreground">
          <ShoppingBag className="mb-1 size-3.5" />
          Sample catalog item. Retailer product links appear here once a product feed is connected.
        </div>
      )}
    </div>
  );
}

function MultiInspector({ items }: { items: Item[] }) {
  const rotateSelected = useEditor((s) => s.rotateSelected);
  const duplicateSelected = useEditor((s) => s.duplicateSelected);
  const removeSelected = useEditor((s) => s.removeSelected);
  const toggleLock = useEditor((s) => s.toggleLockSelected);
  const total = items.reduce((s, i) => s + (getCatalogItem(i.catalogId)?.price ?? 0), 0);
  return (
    <div className="space-y-4 p-4">
      <div>
        <div className="text-[15px] font-semibold">{items.length} pieces selected</div>
        <div className="text-[12px] text-muted-foreground">{formatPrice(total)} combined sample price</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => rotateSelected(90)}>
          <RotateCw /> Rotate
        </Button>
        <Button size="sm" variant="outline" onClick={duplicateSelected}>
          <Copy /> Duplicate
        </Button>
        <Button size="sm" variant="outline" onClick={toggleLock}>
          <Lock /> Lock
        </Button>
        <Button size="sm" variant="outline" className="text-destructive" onClick={removeSelected}>
          <Trash2 /> Delete
        </Button>
      </div>
      <div className="space-y-1">
        {items.map((i) => (
          <div key={i.id} className="text-[12px] text-muted-foreground">
            {getCatalogItem(i.catalogId)?.name}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoomInspector({ id }: { id: string }) {
  const room = useEditor((s) => s.scene.rooms.find((r) => r.id === id));
  const apply = useEditor((s) => s.apply);
  const removeSelected = useEditor((s) => s.removeSelected);
  if (!room) return null;
  const b = polygonBounds(room.polygon);
  const set = (patch: Partial<typeof room>) => apply((s) => ({ ...s, rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  return (
    <div className="space-y-4 p-4">
      <div>
        <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Room</div>
        <Input value={room.name} onChange={(e) => set({ name: e.target.value })} className="mt-1 h-9 text-[15px] font-semibold" />
        <div className="mt-1 text-[12px] text-muted-foreground">
          {formatSqft(polygonArea(room.polygon))} · {formatFtIn(b.maxX - b.minX)} × {formatFtIn(b.maxY - b.minY)}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Room type</Label>
        <div className="flex flex-wrap gap-1">
          {ROOM_TYPES.map((t) => (
            <button key={t} onClick={() => set({ type: t as RoomType })} className={cn("rounded-full border px-2.5 py-1 text-[12px] capitalize", room.type === t ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Flooring</Label>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => set({ floor: undefined })} className={cn("rounded-full border px-2.5 py-1 text-[12px]", !room.floor ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
            Same as home
          </button>
          {FLOOR_MATERIALS.map((m) => (
            <button key={m} onClick={() => set({ floor: m as FloorMaterial })} className={cn("rounded-full border px-2.5 py-1 text-[12px] capitalize", room.floor === m ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
              {m.replace("-", " ")}
            </button>
          ))}
        </div>
      </div>
      <Button size="sm" variant="outline" className="text-destructive" onClick={removeSelected}>
        <Trash2 /> Delete room outline
      </Button>
    </div>
  );
}

function WallInspector({ id }: { id: string }) {
  const wall = useEditor((s) => s.scene.walls.find((w) => w.id === id));
  const apply = useEditor((s) => s.apply);
  const removeSelected = useEditor((s) => s.removeSelected);
  if (!wall) return null;
  const set = (patch: Partial<typeof wall>) => apply((s) => ({ ...s, walls: s.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));
  return (
    <div className="space-y-4 p-4">
      <div>
        <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Wall</div>
        <div className="text-[15px] font-semibold">{formatFtIn(dist(wall.a, wall.b))} long</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <LengthField label="Thickness" value={wall.thickness} onCommit={(v) => set({ thickness: Math.max(1, v) })} />
        <LengthField label="Height" value={wall.height} onCommit={(v) => set({ height: Math.max(24, v) })} />
      </div>
      <Button size="sm" variant="outline" className="text-destructive" onClick={removeSelected}>
        <Trash2 /> Delete wall
      </Button>
    </div>
  );
}

function OpeningInspector({ id }: { id: string }) {
  const o = useEditor((s) => s.scene.openings.find((x) => x.id === id));
  const apply = useEditor((s) => s.apply);
  const removeSelected = useEditor((s) => s.removeSelected);
  if (!o) return null;
  const set = (patch: Partial<typeof o>) => apply((s) => ({ ...s, openings: s.openings.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  return (
    <div className="space-y-4 p-4">
      <div className="text-[15px] font-semibold capitalize">{o.kind}</div>
      <div className="grid grid-cols-2 gap-2">
        <LengthField label="Width" value={o.width} onCommit={(v) => set({ width: Math.max(12, v) })} />
        <LengthField label="Height" value={o.height} onCommit={(v) => set({ height: Math.max(12, v) })} />
        {o.kind === "window" && <LengthField label="Sill height" value={o.sill} onCommit={(v) => set({ sill: Math.max(0, v) })} />}
      </div>
      {o.kind === "door" && (
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => set({ swing: o.swing === "left" ? "right" : "left" })}>
            <FlipHorizontal /> Flip swing side
          </Button>
          <Button size="sm" variant="outline" onClick={() => set({ hinge: o.hinge === "start" ? "end" : "start" })}>
            <ArrowLeftRight /> Flip hinge
          </Button>
        </div>
      )}
      <Button size="sm" variant="outline" className="text-destructive" onClick={removeSelected}>
        <Trash2 /> Delete {o.kind}
      </Button>
    </div>
  );
}

function ProjectSummary({ issues }: { issues: Issue[] }) {
  const scene = useDisplayScene();
  const m = sceneMetrics(scene, issues);
  const furniture = scene.items.filter((i) => !i.fixed);
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; count: number; price: number }>();
    for (const i of furniture) {
      const c = getCatalogItem(i.catalogId);
      if (!c) continue;
      const g = map.get(c.id) ?? { name: c.name, count: 0, price: c.price };
      g.count++;
      map.set(c.id, g);
    }
    return [...map.values()];
  }, [furniture]);
  return (
    <div className="space-y-4 p-4" data-testid="project-summary">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Floor area" value={formatSqft(m.totalArea)} />
        <Stat label="Open floor" value={`${Math.round(m.openPct * 100)}%`} />
        <Stat label="Pieces" value={String(m.itemCount)} />
        <Stat label="Est. total" value={formatPrice(m.totalPrice)} />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Space check</h3>
          {issues.length === 0 ? <Badge variant="success">All clear</Badge> : <Badge variant={m.errors ? "destructive" : "warning"}>{issues.length} notes</Badge>}
        </div>
        {issues.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No collisions, blocked doors or tight walkways.</p>
        ) : (
          <div className="-mx-2">{issues.slice(0, 12).map((i) => <IssueRow key={i.id} issue={i} />)}</div>
        )}
      </div>
      {grouped.length > 0 && (
        <div>
          <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Shopping list</h3>
          <div className="divide-y rounded-lg border bg-card">
            {grouped.map((g) => (
              <div key={g.name} className="flex items-center justify-between px-3 py-1.5 text-[12px]">
                <span>
                  {g.count > 1 && <span className="text-muted-foreground">{g.count}× </span>}
                  {g.name}
                </span>
                <span className="font-mono text-[11px]">{formatPrice(g.price * g.count)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-muted/50 px-3 py-1.5 text-[12px] font-semibold">
              <span>Total (sample prices)</span>
              <span className="font-mono">{formatPrice(m.totalPrice)}</span>
            </div>
          </div>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Select a piece, wall, door or room to edit it.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-[15px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}
