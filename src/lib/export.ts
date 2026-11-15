"use client";

import { getCatalogItem } from "@/lib/catalog/items";
import { SceneSchema, type Project } from "@/lib/scene/types";
import { z } from "zod";

export function download(name: string, data: Blob | string, type = "application/octet-stream") {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/data:(.*?);/)?.[1] ?? "application/octet-stream";
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
}

export function shoppingListCsv(p: Project, origin = typeof window !== "undefined" ? window.location.origin : ""): string {
  const rows = [["Item", "Retailer", "Category", "Width (in)", "Depth (in)", "Height (in)", "Color", "Material", "Price (USD)", "Buy link"]];
  for (const i of p.scene.items) {
    const c = getCatalogItem(i.catalogId);
    if (!c || c.fixture) continue;
    const color = c.colors.find((x) => x.hex === i.color)?.name ?? i.color ?? "";
    const retail = c.source === "retailer";
    rows.push([
      c.name,
      retail ? (c.retailer ?? "") : "Sample (not for sale)",
      c.category,
      String(i.width),
      String(i.depth),
      String(i.height),
      color,
      i.material ?? "",
      String(c.price),
      retail ? `${origin}/go/${encodeURIComponent(c.id)}?from=csv&p=${encodeURIComponent(p.id)}` : "",
    ]);
  }
  return rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
}

export const ProjectFileSchema = z.object({
  format: z.literal("homer-project"),
  version: z.literal(1),
  project: z.object({
    name: z.string(),
    unitType: z.enum(["studio", "1br", "2br", "custom"]),
    scene: SceneSchema,
    conversation: z.array(z.object({ id: z.string(), role: z.enum(["user", "assistant"]), content: z.string(), createdAt: z.number() }).passthrough()).default([]),
    preferences: z.object({ style: z.string().optional(), budget: z.number().optional(), notes: z.string().optional() }).optional(),
  }),
  background: z.string().optional(),
});

export async function projectFile(p: Project, background: Blob | null): Promise<string> {
  return JSON.stringify({
    format: "homer-project",
    version: 1,
    project: { name: p.name, unitType: p.unitType, scene: p.scene, conversation: p.conversation, preferences: p.preferences },
    background: background ? await blobToDataUrl(background) : undefined,
  });
}
