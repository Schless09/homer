"use client";

import * as THREE from "three";
import type { FloorMaterial } from "@/lib/scene/types";
import { FLOOR_COLORS } from "../FloorSwatch";

const cache = new Map<FloorMaterial, THREE.Texture>();

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function shift(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/**
 * Procedural floor textures (no network assets). One texture tile covers
 * 48" × 48" of floor; ShapeGeometry UVs are in inches so repeat = 1/48.
 */
export function floorTexture(material: FloorMaterial): THREE.Texture {
  const hit = cache.get(material);
  if (hit) return hit;
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const { base, line } = FLOOR_COLORS[material];
  const r = rand(material.length * 7919 + 13);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const px = size / 48; // pixels per inch
  if (material === "tile-white" || material === "tile-gray") {
    const t = 24 * px;
    for (let x = 0; x < size; x += t)
      for (let y = 0; y < size; y += t) {
        ctx.fillStyle = shift(base, (r() - 0.5) * 8);
        ctx.fillRect(x + 1, y + 1, t - 2, t - 2);
      }
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    for (let x = 0; x <= size; x += t) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, x);
      ctx.lineTo(size, x);
      ctx.stroke();
    }
  } else if (material === "concrete" || material === "carpet-oatmeal") {
    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * (material === "concrete" ? 18 : 12);
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  } else if (material === "herringbone") {
    const pw = 3 * px;
    const pl = 12 * px;
    ctx.save();
    for (let row = -4; row < 20; row++) {
      for (let col = -4; col < 20; col++) {
        const x = col * pw * 2 + row * pw;
        const y = row * pw * 2 - col * pw * 2;
        for (const flip of [0, 1]) {
          ctx.save();
          ctx.translate(x + flip * pw * 2, y + flip * pw);
          ctx.rotate(flip ? -Math.PI / 4 : Math.PI / 4);
          ctx.fillStyle = shift(base, (r() - 0.5) * 26);
          ctx.fillRect(0, 0, pl, pw);
          ctx.strokeStyle = line;
          ctx.lineWidth = 1;
          ctx.strokeRect(0, 0, pl, pw);
          ctx.restore();
        }
      }
    }
    ctx.restore();
  } else {
    // planks: 6" wide, staggered 48" lengths
    const pw = 6 * px;
    for (let x = 0; x < size; x += pw) {
      const offset = r() * size;
      for (let y = -size; y < size * 2; y += size) {
        ctx.fillStyle = shift(base, (r() - 0.5) * 22);
        ctx.fillRect(x, y + offset, pw, size);
        // grain
        ctx.strokeStyle = shift(base, -14);
        ctx.globalAlpha = 0.18;
        for (let g = 0; g < 4; g++) {
          ctx.beginPath();
          const gx = x + r() * pw;
          ctx.moveTo(gx, y + offset);
          ctx.bezierCurveTo(gx + 3, y + offset + size * 0.3, gx - 3, y + offset + size * 0.6, gx, y + offset + size);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = line;
        ctx.fillRect(x, y + offset, pw, 1.5);
      }
      ctx.fillStyle = line;
      ctx.fillRect(x, 0, 1.5, size);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / 48, 1 / 48);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(material, tex);
  return tex;
}
