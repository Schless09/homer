"use client";

export interface LoadedPlan {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = url;
  });
}

function canvasToBlob(c: HTMLCanvasElement, type = "image/png", q?: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Image encoding failed"))), type, q));
}

/** Render page 1 of a PDF to a PNG (client-side, pdf.js). */
async function pdfToPng(file: File, onProgress?: (p: number) => void): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  onProgress?.(0.2);
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  onProgress?.(0.5);
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, 2400 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  onProgress?.(0.9);
  return canvasToBlob(canvas);
}

export async function loadPlanFile(file: File, onProgress?: (p: number) => void): Promise<LoadedPlan> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf && !/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error("Please upload a PNG, JPG or PDF floor plan.");
  if (file.size > 25 * 1024 * 1024) throw new Error("That file is over 25 MB.");
  const blob = isPdf ? await pdfToPng(file, onProgress) : file;
  const url = URL.createObjectURL(blob);
  const img = await loadImage(url);
  onProgress?.(1);
  return { blob, url, width: img.naturalWidth, height: img.naturalHeight };
}

/** Downscale for the vision model (long side ≤ 1568 px) and return base64 JPEG + the factor applied. */
export async function prepareForVision(url: string): Promise<{ data: string; width: number; height: number; factor: number }> {
  const img = await loadImage(url);
  const factor = Math.min(1, 1568 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * factor);
  const h = Math.round(img.naturalHeight * factor);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = c.toDataURL("image/jpeg", 0.9);
  return { data: dataUrl.split(",")[1], width: w, height: h, factor };
}
