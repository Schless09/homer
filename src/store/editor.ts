"use client";

import { create } from "zustand";
import { getCatalogItem } from "@/lib/catalog/items";
import { newId } from "@/lib/scene/ids";
import { instantiate } from "@/lib/scene/instantiate";
import { polygonArea, polygonCentroid } from "@/lib/scene/geometry";
import type { DesignAction } from "@/lib/scene/actions";
import type { LayoutAlternative } from "@/lib/scene/solver";
import type { ChatMessage, Item, Project, Scene } from "@/lib/scene/types";

export type ViewMode = "2d" | "3d" | "top" | "walk";
export type Tool = "select" | "pan" | "wall" | "room" | "door" | "window" | "measure";
export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

export interface Proposal {
  id: string;
  title: string;
  summary: string;
  actions: DesignAction[];
  /** list of human-readable changes */
  changes: string[];
  rejected: { reason: string }[];
  scene: Scene;
  alternatives?: LayoutAlternative[];
  activeAlternative?: string;
  provider: "claude" | "demo";
}

const HISTORY_LIMIT = 120;

interface EditorState {
  loaded: boolean;
  projectId: string | null;
  name: string;
  unitType: Project["unitType"];
  createdAt: number;
  revision: number;
  preferences: Project["preferences"];
  conversation: ChatMessage[];
  thumbnail?: string;

  scene: Scene;
  past: Scene[];
  future: Scene[];
  /** bumps when persisted content changes */
  version: number;

  selection: string[];
  hoverId: string | null;
  view: ViewMode;
  tool: Tool;
  showGrid: boolean;
  snapToGrid: boolean;
  showDims: boolean;
  showBackground: boolean;
  showClearances: boolean;
  wallsVisible: "full" | "cutaway" | "hidden";
  backgroundUrl: string | null;

  preview: Proposal | null;
  saveStatus: SaveStatus;
  rightTab: "ai" | "inspect";

  load(p: Project): void;
  toProject(): Project;
  setName(n: string): void;
  setRevision(r: number): void;
  setSaveStatus(s: SaveStatus): void;
  setBackgroundUrl(u: string | null): void;
  setThumbnail(t: string): void;

  /** push the current scene to history (call before a transient edit like a drag) */
  checkpoint(): void;
  /** edit without creating a history entry (use between checkpoint() and the end of a drag) */
  patch(fn: (s: Scene) => Scene): void;
  /** edit with a history entry */
  apply(fn: (s: Scene) => Scene): void;
  undo(): void;
  redo(): void;

  select(ids: string[], additive?: boolean): void;
  setHover(id: string | null): void;
  addItem(catalogId: string, at?: { x: number; y: number }, over?: Partial<Item>): string | null;
  updateItem(id: string, patch: Partial<Item>, history?: boolean): void;
  removeSelected(): void;
  duplicateSelected(): void;
  rotateSelected(delta: number): void;
  nudgeSelected(dx: number, dy: number): void;
  toggleLockSelected(): void;

  setView(v: ViewMode): void;
  setTool(t: Tool): void;
  toggle(key: "showGrid" | "snapToGrid" | "showDims" | "showBackground" | "showClearances"): void;
  setWallsVisible(v: EditorState["wallsVisible"]): void;
  setRightTab(t: EditorState["rightTab"]): void;

  setPreview(p: Proposal | null): void;
  setPreviewAlternative(id: string): void;
  acceptPreview(): void;

  addMessage(m: Omit<ChatMessage, "id" | "createdAt">): ChatMessage;
  clearConversation(): void;
  setPreferences(p: Project["preferences"]): void;
}

const emptySceneValue: Scene = {
  version: 1,
  walls: [],
  openings: [],
  rooms: [],
  items: [],
  style: { wallColor: "#f3efe8", floor: "oak", lighting: "day" },
  scaleConfirmed: false,
};

function viewCenter(scene: Scene) {
  if (scene.rooms.length) {
    const biggest = scene.rooms.reduce((a, b) => (polygonArea(a.polygon) >= polygonArea(b.polygon) ? a : b));
    return polygonCentroid(biggest.polygon);
  }
  return { x: 120, y: 120 };
}

export const useEditor = create<EditorState>((set, get) => ({
  loaded: false,
  projectId: null,
  name: "",
  unitType: "custom",
  createdAt: 0,
  revision: 0,
  preferences: undefined,
  conversation: [],
  scene: emptySceneValue,
  past: [],
  future: [],
  version: 0,
  selection: [],
  hoverId: null,
  view: "2d",
  tool: "select",
  showGrid: true,
  snapToGrid: true,
  showDims: true,
  showBackground: true,
  showClearances: true,
  wallsVisible: "cutaway",
  backgroundUrl: null,
  preview: null,
  saveStatus: "idle",
  rightTab: "ai",

  load(p) {
    set({
      loaded: true,
      projectId: p.id,
      name: p.name,
      unitType: p.unitType,
      createdAt: p.createdAt,
      revision: p.revision,
      preferences: p.preferences,
      conversation: p.conversation,
      thumbnail: p.thumbnail,
      scene: p.scene,
      past: [],
      future: [],
      version: 0,
      selection: [],
      preview: null,
      saveStatus: "saved",
    });
  },
  toProject() {
    const s = get();
    return {
      id: s.projectId!,
      name: s.name,
      unitType: s.unitType,
      createdAt: s.createdAt,
      updatedAt: Date.now(),
      revision: s.revision,
      scene: s.scene,
      conversation: s.conversation,
      preferences: s.preferences,
      thumbnail: s.thumbnail,
    };
  },
  setName: (name) => set((s) => ({ name, version: s.version + 1 })),
  setRevision: (revision) => set({ revision }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setBackgroundUrl: (backgroundUrl) => set({ backgroundUrl }),
  setThumbnail: (thumbnail) => set({ thumbnail }),

  checkpoint() {
    set((s) => ({ past: [...s.past, s.scene].slice(-HISTORY_LIMIT), future: [] }));
  },
  patch(fn) {
    set((s) => ({ scene: fn(s.scene), version: s.version + 1 }));
  },
  apply(fn) {
    set((s) => {
      const next = fn(s.scene);
      if (next === s.scene) return {};
      return { past: [...s.past, s.scene].slice(-HISTORY_LIMIT), future: [], scene: next, version: s.version + 1 };
    });
  },
  undo() {
    set((s) => {
      if (!s.past.length) return {};
      const prev = s.past[s.past.length - 1];
      return { past: s.past.slice(0, -1), future: [s.scene, ...s.future], scene: prev, version: s.version + 1, selection: s.selection.filter((id) => prev.items.some((i) => i.id === id)) };
    });
  },
  redo() {
    set((s) => {
      if (!s.future.length) return {};
      const next = s.future[0];
      return { future: s.future.slice(1), past: [...s.past, s.scene], scene: next, version: s.version + 1 };
    });
  },

  select(ids, additive) {
    set((s) => {
      if (!additive) return { selection: ids, rightTab: ids.length ? "inspect" : s.rightTab };
      const sel = new Set(s.selection);
      for (const id of ids) {
        if (sel.has(id)) sel.delete(id);
        else sel.add(id);
      }
      return { selection: [...sel], rightTab: "inspect" };
    });
  },
  setHover: (hoverId) => set({ hoverId }),
  addItem(catalogId, at, over) {
    const c = getCatalogItem(catalogId);
    if (!c) return null;
    const pos = at ?? viewCenter(get().scene);
    const item = instantiate(catalogId, pos.x, pos.y, 0, over);
    get().apply((s) => ({ ...s, items: [...s.items, item] }));
    set({ selection: [item.id], rightTab: "inspect" });
    return item.id;
  },
  updateItem(id, patch, history = true) {
    const fn = (s: Scene) => ({ ...s, items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
    if (history) get().apply(fn);
    else get().patch(fn);
  },
  removeSelected() {
    const sel = new Set(get().selection);
    if (!sel.size) return;
    get().apply((s) => {
      const removedWalls = new Set(s.walls.filter((w) => sel.has(w.id)).map((w) => w.id));
      return {
        ...s,
        // fixtures are only removable once the user unlocks them
        items: s.items.filter((i) => !sel.has(i.id) || i.locked),
        walls: s.walls.filter((w) => !removedWalls.has(w.id)),
        openings: s.openings.filter((o) => !sel.has(o.id) && !removedWalls.has(o.wallId)),
        rooms: s.rooms.filter((r) => !sel.has(r.id)),
      };
    });
    set({ selection: [] });
  },
  duplicateSelected() {
    const s = get();
    const sel = s.scene.items.filter((i) => s.selection.includes(i.id) && !i.fixed);
    if (!sel.length) return;
    const copies = sel.map((i) => ({ ...i, id: newId("it"), x: i.x + 18, y: i.y + 18, locked: false }));
    s.apply((sc) => ({ ...sc, items: [...sc.items, ...copies] }));
    set({ selection: copies.map((c) => c.id) });
  },
  rotateSelected(delta) {
    const sel = new Set(get().selection);
    get().apply((s) => ({
      ...s,
      items: s.items.map((i) => (sel.has(i.id) && !i.locked ? { ...i, rotation: (((i.rotation + delta) % 360) + 360) % 360 } : i)),
    }));
  },
  nudgeSelected(dx, dy) {
    const sel = new Set(get().selection);
    get().apply((s) => ({ ...s, items: s.items.map((i) => (sel.has(i.id) && !i.locked ? { ...i, x: i.x + dx, y: i.y + dy } : i)) }));
  },
  toggleLockSelected() {
    const sel = new Set(get().selection);
    get().apply((s) => ({ ...s, items: s.items.map((i) => (sel.has(i.id) && !i.fixed ? { ...i, locked: !i.locked } : i)) }));
  },

  setView: (view) => set({ view }),
  setTool: (tool) => set({ tool }),
  toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<EditorState>),
  setWallsVisible: (wallsVisible) => set({ wallsVisible }),
  setRightTab: (rightTab) => set({ rightTab }),

  setPreview: (preview) => set({ preview, selection: [] }),
  setPreviewAlternative(id) {
    const p = get().preview;
    if (!p?.alternatives) return;
    const alt = p.alternatives.find((a) => a.id === id);
    if (!alt) return;
    set({ preview: { ...p, activeAlternative: id, scene: { ...p.scene, items: alt.items } } });
  },
  acceptPreview() {
    const p = get().preview;
    if (!p) return;
    get().apply(() => p.scene);
    set({ preview: null });
  },

  addMessage(m) {
    const msg: ChatMessage = { ...m, id: newId("msg"), createdAt: Date.now() };
    set((s) => ({ conversation: [...s.conversation, msg], version: s.version + 1 }));
    return msg;
  },
  clearConversation: () => set((s) => ({ conversation: [], version: s.version + 1 })),
  setPreferences: (preferences) => set((s) => ({ preferences, version: s.version + 1 })),
}));

/** The scene currently displayed: the AI preview while one is pending, otherwise the live scene. */
export function useDisplayScene(): Scene {
  return useEditor((s) => s.preview?.scene ?? s.scene);
}
