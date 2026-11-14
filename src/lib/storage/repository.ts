import type { Project } from "@/lib/scene/types";

export interface ProjectMeta {
  id: string;
  name: string;
  unitType: Project["unitType"];
  updatedAt: number;
  createdAt: number;
  thumbnail?: string;
  itemCount: number;
}

export type SaveResult = { ok: true; revision: number } | { ok: false; conflict: Project };

export interface ProjectRepository {
  readonly kind: "local" | "supabase";
  list(): Promise<ProjectMeta[]>;
  get(id: string): Promise<Project | null>;
  create(p: Project): Promise<void>;
  /** optimistic concurrency: only writes when the stored revision equals `expectedRevision` */
  save(p: Project, expectedRevision: number): Promise<SaveResult>;
  remove(id: string): Promise<void>;
  putAsset(id: string, blob: Blob): Promise<void>;
  getAsset(id: string): Promise<Blob | null>;
}

export function toMeta(p: Project): ProjectMeta {
  return {
    id: p.id,
    name: p.name,
    unitType: p.unitType,
    updatedAt: p.updatedAt,
    createdAt: p.createdAt,
    thumbnail: p.thumbnail,
    itemCount: p.scene.items.filter((i) => !i.fixed).length,
  };
}
