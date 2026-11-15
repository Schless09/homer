"use client";

import { useState } from "react";
import type { CatalogItem } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { CatalogThumb } from "./CatalogThumb";

/** Retailer photo when available, otherwise (or if it fails to load) the plan-view illustration. */
export function ProductImage({ item, color, size = 64, className }: { item: CatalogItem; color?: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (item.imageUrl && !failed) {
    return (
      <img
        src={item.imageUrl}
        alt={item.name}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn("object-contain mix-blend-multiply", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return <CatalogThumb item={item} color={color} size={size} />;
}
