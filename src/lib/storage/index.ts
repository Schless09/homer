"use client";

import { LocalProjectRepository } from "./local";
import type { ProjectRepository, SaveResult } from "./repository";
import { SupabaseProjectRepository } from "./supabase";

export const STORAGE_FALLBACK_EVENT = "homer:storage-fallback";

/**
 * Uses Supabase when configured. If the backend can't be reached or isn't set
 * up (missing tables, anonymous sign-ins disabled), it falls back to browser
 * storage for the session and announces it, instead of failing silently.
 */
class ResilientRepository implements ProjectRepository {
  private active: ProjectRepository;
  private local = new LocalProjectRepository();
  fallbackReason: string | null = null;

  constructor(primary: ProjectRepository) {
    this.active = primary;
  }

  get kind() {
    return this.active.kind;
  }

  private async run<T>(fn: (r: ProjectRepository) => Promise<T>): Promise<T> {
    try {
      return await fn(this.active);
    } catch (err) {
      if (this.active.kind !== "supabase") throw err;
      this.fallbackReason = err instanceof Error ? err.message : String(err);
      console.warn("[storage] Supabase unavailable, using browser storage:", this.fallbackReason);
      this.active = this.local;
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(STORAGE_FALLBACK_EVENT, { detail: this.fallbackReason }));
      return fn(this.active);
    }
  }

  list() {
    return this.run((r) => r.list());
  }
  get(id: string) {
    return this.run((r) => r.get(id));
  }
  create(p: Parameters<ProjectRepository["create"]>[0]) {
    return this.run((r) => r.create(p));
  }
  save(p: Parameters<ProjectRepository["save"]>[0], rev: number): Promise<SaveResult> {
    return this.run((r) => r.save(p, rev));
  }
  remove(id: string) {
    return this.run((r) => r.remove(id));
  }
  putAsset(id: string, blob: Blob) {
    return this.run((r) => r.putAsset(id, blob));
  }
  getAsset(id: string) {
    return this.run((r) => r.getAsset(id));
  }
}

let repo: ResilientRepository | null = null;

export function getRepository(): ResilientRepository {
  if (repo) return repo;
  const url = process.env.HOMER_SUPABASE_URL;
  const key = process.env.HOMER_SUPABASE_KEY;
  repo = new ResilientRepository(url && key ? new SupabaseProjectRepository(url, key) : new LocalProjectRepository());
  return repo;
}

export type { ProjectRepository, ProjectMeta, SaveResult } from "./repository";
