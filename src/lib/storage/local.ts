import type { Project } from "@/lib/scene/types";
import { toMeta, type ProjectRepository, type SaveResult } from "./repository";

const DB_NAME = "homer";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("assets")) db.createObjectStore("assets");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
const db = () => (dbPromise ??= openDb());

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(store, mode);
        const s = t.objectStore(store);
        const req = fn(s);
        let result: T;
        if (req) req.onsuccess = () => (result = req.result);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

/** Browser-local repository (IndexedDB). Used when Supabase isn't configured. */
export class LocalProjectRepository implements ProjectRepository {
  readonly kind = "local" as const;

  async list() {
    const all = await tx<Project[]>("projects", "readonly", (s) => s.getAll());
    return (all ?? []).map(toMeta).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string) {
    return (await tx<Project | undefined>("projects", "readonly", (s) => s.get(id))) ?? null;
  }

  async create(p: Project) {
    await tx("projects", "readwrite", (s) => s.put(p));
  }

  async save(p: Project, expectedRevision: number): Promise<SaveResult> {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction("projects", "readwrite");
      const s = t.objectStore("projects");
      let out: SaveResult = { ok: true, revision: expectedRevision + 1 };
      const getReq = s.get(p.id);
      getReq.onsuccess = () => {
        const current = getReq.result as Project | undefined;
        if (current && current.revision !== expectedRevision) {
          out = { ok: false, conflict: current };
          return;
        }
        s.put({ ...p, revision: expectedRevision + 1 });
      };
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
    });
  }

  async remove(id: string) {
    await tx("projects", "readwrite", (s) => s.delete(id));
  }

  async putAsset(id: string, blob: Blob) {
    await tx("assets", "readwrite", (s) => s.put(blob, id));
  }

  async getAsset(id: string) {
    return (await tx<Blob | undefined>("assets", "readonly", (s) => s.get(id))) ?? null;
  }
}
