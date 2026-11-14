import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SceneSchema, type Project } from "@/lib/scene/types";
import type { ProjectMeta, ProjectRepository, SaveResult } from "./repository";

/**
 * Supabase-backed repository. Requires NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, the schema in supabase/migrations, and
 * anonymous sign-ins enabled (or a signed-in user). Row Level Security limits
 * every row to its owner.
 */

interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  unit_type: Project["unitType"];
  scene: unknown;
  conversation: Project["conversation"];
  preferences: Project["preferences"] | null;
  revision: number;
  thumbnail: string | null;
  item_count: number;
  created_at: string;
  updated_at: string;
}

const BUCKET = "floorplans";

function rowToProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    unitType: r.unit_type,
    scene: SceneSchema.parse(r.scene),
    conversation: r.conversation ?? [],
    preferences: r.preferences ?? undefined,
    revision: r.revision,
    thumbnail: r.thumbnail ?? undefined,
    createdAt: Date.parse(r.created_at),
    updatedAt: Date.parse(r.updated_at),
  };
}

export class SupabaseProjectRepository implements ProjectRepository {
  readonly kind = "supabase" as const;
  private client: SupabaseClient;
  private userIdPromise: Promise<string> | null = null;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey);
  }

  /** lazily signs in; a failed sign-in is retried on the next call */
  private get userId(): Promise<string> {
    this.userIdPromise ??= this.ensureUser().catch((e) => {
      this.userIdPromise = null;
      throw e;
    });
    return this.userIdPromise;
  }

  private async ensureUser(): Promise<string> {
    const { data } = await this.client.auth.getUser();
    if (data.user) return data.user.id;
    const { data: anon, error } = await this.client.auth.signInAnonymously();
    if (error || !anon.user) throw new Error(`Supabase sign-in failed: ${error?.message ?? "no user"}`);
    return anon.user.id;
  }

  private toRow(p: Project, owner: string, revision: number) {
    return {
      id: p.id,
      owner_id: owner,
      name: p.name,
      unit_type: p.unitType,
      scene: p.scene,
      conversation: p.conversation,
      preferences: p.preferences ?? null,
      revision,
      thumbnail: p.thumbnail ?? null,
      item_count: p.scene.items.filter((i) => !i.fixed).length,
      updated_at: new Date().toISOString(),
    };
  }

  async list(): Promise<ProjectMeta[]> {
    await this.userId;
    const { data, error } = await this.client
      .from("projects")
      .select("id,name,unit_type,thumbnail,item_count,created_at,updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      unitType: r.unit_type,
      thumbnail: r.thumbnail ?? undefined,
      itemCount: r.item_count ?? 0,
      createdAt: Date.parse(r.created_at),
      updatedAt: Date.parse(r.updated_at),
    }));
  }

  async get(id: string) {
    await this.userId;
    const { data, error } = await this.client.from("projects").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? rowToProject(data as ProjectRow) : null;
  }

  async create(p: Project) {
    const owner = await this.userId;
    const { error } = await this.client.from("projects").insert({ ...this.toRow(p, owner, p.revision), created_at: new Date(p.createdAt).toISOString() });
    if (error) throw error;
  }

  async save(p: Project, expectedRevision: number): Promise<SaveResult> {
    const owner = await this.userId;
    const { data, error } = await this.client
      .from("projects")
      .update(this.toRow(p, owner, expectedRevision + 1))
      .eq("id", p.id)
      .eq("revision", expectedRevision)
      .select("id");
    if (error) throw error;
    if (data && data.length > 0) return { ok: true, revision: expectedRevision + 1 };
    const current = await this.get(p.id);
    if (!current) {
      await this.create({ ...p, revision: expectedRevision + 1 });
      return { ok: true, revision: expectedRevision + 1 };
    }
    return { ok: false, conflict: current };
  }

  async remove(id: string) {
    const { error } = await this.client.from("projects").delete().eq("id", id);
    if (error) throw error;
  }

  async putAsset(id: string, blob: Blob) {
    const owner = await this.userId;
    const { error } = await this.client.storage.from(BUCKET).upload(`${owner}/${id}`, blob, { upsert: true, contentType: blob.type });
    if (error) throw error;
  }

  async getAsset(id: string) {
    const owner = await this.userId;
    const { data, error } = await this.client.storage.from(BUCKET).download(`${owner}/${id}`);
    if (error) return null;
    return data;
  }
}
