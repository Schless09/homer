"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { Appearance, MaterialKind } from "@/lib/catalog/appearance";

/**
 * Procedural surface textures (no network assets). Each is a light grayscale
 * detail map that the material color tints, so one texture serves every color.
 */

const cache = new Map<string, THREE.Texture>();

function rnd(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function canvasTex(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, r: () => number) => void, repeat = 2): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  draw(ctx, rnd(key.length * 7919 + 17));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

function shade(v: number) {
  const g = Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${g},${g},${g})`;
}

export function surfaceTexture(kind: MaterialKind): THREE.Texture | null {
  switch (kind) {
    case "linen":
    case "cotton":
      return canvasTex(kind, 128, (ctx, r) => {
        for (let y = 0; y < 128; y += 2) {
          ctx.fillStyle = shade(232 + r() * 18);
          ctx.fillRect(0, y, 128, 1);
        }
        for (let x = 0; x < 128; x += 2) {
          ctx.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.05})`;
          ctx.fillRect(x, 0, 1, 128);
        }
      }, 6);
    case "boucle":
      return canvasTex(kind, 128, (ctx, r) => {
        for (let i = 0; i < 900; i++) {
          ctx.strokeStyle = `rgba(0,0,0,${0.05 + r() * 0.1})`;
          ctx.beginPath();
          ctx.arc(r() * 128, r() * 128, 1 + r() * 2.2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }, 5);
    case "wool":
      return canvasTex(kind, 128, (ctx, r) => {
        for (let i = 0; i < 2400; i++) {
          ctx.fillStyle = `rgba(0,0,0,${r() * 0.08})`;
          ctx.fillRect(r() * 128, r() * 128, 1.5, 1.5);
        }
      }, 4);
    case "velvet":
      return canvasTex(kind, 64, (ctx, r) => {
        for (let i = 0; i < 400; i++) {
          ctx.fillStyle = `rgba(0,0,0,${r() * 0.035})`;
          ctx.fillRect(r() * 64, r() * 64, 2, 2);
        }
      }, 3);
    case "leather":
      return canvasTex(kind, 128, (ctx, r) => {
        for (let i = 0; i < 700; i++) {
          ctx.strokeStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`;
          ctx.beginPath();
          const x = r() * 128;
          const y = r() * 128;
          ctx.moveTo(x, y);
          ctx.lineTo(x + (r() - 0.5) * 6, y + (r() - 0.5) * 6);
          ctx.stroke();
        }
      }, 3);
    case "wood":
      return canvasTex(kind, 256, (ctx, r) => {
        for (let i = 0; i < 70; i++) {
          ctx.strokeStyle = `rgba(60,35,15,${0.05 + r() * 0.12})`;
          ctx.lineWidth = 0.6 + r() * 1.6;
          ctx.beginPath();
          const y = r() * 256;
          ctx.moveTo(0, y);
          for (let x = 0; x <= 256; x += 32) ctx.lineTo(x, y + Math.sin(x / 40 + i) * (2 + r() * 4));
          ctx.stroke();
        }
      }, 1);
    case "marble":
    case "stone":
      return canvasTex(kind, 256, (ctx, r) => {
        if (kind === "stone") {
          for (let i = 0; i < 5000; i++) {
            ctx.fillStyle = `rgba(0,0,0,${r() * 0.06})`;
            ctx.fillRect(r() * 256, r() * 256, 1.5, 1.5);
          }
          return;
        }
        for (let i = 0; i < 9; i++) {
          ctx.strokeStyle = `rgba(80,80,90,${0.12 + r() * 0.25})`;
          ctx.lineWidth = 0.6 + r() * 1.8;
          ctx.beginPath();
          let x = r() * 256;
          let y = 0;
          ctx.moveTo(x, y);
          while (y < 256) {
            x += (r() - 0.5) * 40;
            y += 10 + r() * 25;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }, 1);
    case "rattan":
      return canvasTex(kind, 128, (ctx, r) => {
        ctx.strokeStyle = "rgba(70,45,20,0.35)";
        ctx.lineWidth = 1.4;
        for (let i = -128; i < 256; i += 10) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i + 128, 128);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(i + 128, 0);
          ctx.lineTo(i, 128);
          ctx.stroke();
        }
        for (let i = 0; i < 200; i++) {
          ctx.fillStyle = `rgba(0,0,0,${r() * 0.08})`;
          ctx.fillRect(r() * 128, r() * 128, 2, 2);
        }
      }, 4);
    default:
      return null;
  }
}

const PROPS: Record<MaterialKind, { roughness: number; metalness: number; sheen?: number; clearcoat?: number; transmission?: number }> = {
  linen: { roughness: 0.95, metalness: 0, sheen: 0.2 },
  cotton: { roughness: 0.92, metalness: 0, sheen: 0.2 },
  boucle: { roughness: 1, metalness: 0, sheen: 0.4 },
  wool: { roughness: 1, metalness: 0, sheen: 0.3 },
  velvet: { roughness: 0.7, metalness: 0, sheen: 1 },
  leather: { roughness: 0.48, metalness: 0, clearcoat: 0.25 },
  wood: { roughness: 0.6, metalness: 0 },
  metal: { roughness: 0.35, metalness: 0.6 },
  marble: { roughness: 0.18, metalness: 0, clearcoat: 0.4 },
  stone: { roughness: 0.85, metalness: 0 },
  glass: { roughness: 0.05, metalness: 0.1 },
  rattan: { roughness: 0.8, metalness: 0 },
  lacquer: { roughness: 0.2, metalness: 0, clearcoat: 0.8 },
  ceramic: { roughness: 0.3, metalness: 0, clearcoat: 0.3 },
  plastic: { roughness: 0.5, metalness: 0 },
};

/** A physically based material for a surface kind, tinted by color. */
export function Surface({ kind, color, finish, emissive, opacity }: { kind: MaterialKind; color: string; finish?: Appearance["finish"]; emissive?: string; opacity?: number }) {
  const p = PROPS[kind];
  const map = useMemo(() => surfaceTexture(kind), [kind]);
  const rough = finish === "gloss" ? Math.min(p.roughness, 0.22) : finish === "satin" ? Math.min(p.roughness, 0.45) : p.roughness;
  const isGlass = kind === "glass";
  return (
    <meshPhysicalMaterial
      color={color}
      map={map ?? undefined}
      roughness={rough}
      metalness={p.metalness}
      sheen={p.sheen ?? 0}
      sheenRoughness={0.6}
      sheenColor={color}
      clearcoat={p.clearcoat ?? 0}
      clearcoatRoughness={0.3}
      emissive={emissive ?? "#000000"}
      emissiveIntensity={emissive ? 1.4 : 0}
      transparent={isGlass || opacity !== undefined}
      opacity={isGlass ? 0.35 : (opacity ?? 1)}
    />
  );
}

/** Rug pattern textures, generated per pattern + color pair. */
export function rugTexture(pattern: Appearance["pattern"], primary: string, secondary: string | null): THREE.Texture | null {
  if (pattern === "solid") return null;
  const sec = secondary ?? "#3d3d3f";
  const key = `rug:${pattern}:${primary}:${sec}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const r = rnd(key.length * 31);
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = sec;
  ctx.fillStyle = sec;
  switch (pattern) {
    case "striped":
      for (let y = 10; y < size; y += 28) ctx.fillRect(0, y, size, 7);
      break;
    case "border":
      ctx.lineWidth = 10;
      ctx.strokeRect(14, 14, size - 28, size - 28);
      ctx.lineWidth = 3;
      ctx.strokeRect(34, 34, size - 68, size - 68);
      break;
    case "diamond":
      ctx.lineWidth = 3;
      for (let i = -size; i < size * 2; i += 36) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + size, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i + size, 0);
        ctx.lineTo(i, size);
        ctx.stroke();
      }
      break;
    case "geometric":
      for (let x = 0; x < size; x += 32)
        for (let y = 0; y < size; y += 32) if ((x / 32 + y / 32) % 2 === 0) ctx.fillRect(x + 6, y + 6, 20, 20);
      break;
    case "floral":
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, size - 20, size - 20);
      for (let i = 0; i < 26; i++) {
        const x = 30 + r() * (size - 60);
        const y = 30 + r() * (size - 60);
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.ellipse(x + Math.cos((k * Math.PI * 2) / 5) * 6, y + Math.sin((k * Math.PI * 2) / 5) * 6, 5, 3, (k * Math.PI * 2) / 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.beginPath();
      ctx.ellipse(size / 2, size / 2, 46, 30, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "distressed":
      for (let i = 0; i < 2600; i++) {
        ctx.globalAlpha = r() * 0.35;
        ctx.fillRect(r() * size, r() * size, 2 + r() * 6, 1 + r() * 2);
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = 6;
      ctx.strokeRect(12, 12, size - 24, size - 24);
      break;
    case "abstract":
      for (let i = 0; i < 9; i++) {
        ctx.globalAlpha = 0.35 + r() * 0.4;
        ctx.beginPath();
        ctx.ellipse(r() * size, r() * size, 20 + r() * 50, 10 + r() * 30, r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}
