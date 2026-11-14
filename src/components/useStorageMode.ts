"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getRepository, STORAGE_FALLBACK_EVENT } from "@/lib/storage";

/** Current storage backend; announces when Supabase falls back to browser storage. */
export function useStorageMode() {
  const [kind, setKind] = useState<"local" | "supabase" | null>(null);
  useEffect(() => {
    const repo = getRepository();
    setKind(repo.kind);
    const onFallback = (e: Event) => {
      setKind("local");
      const reason = (e as CustomEvent<string>).detail;
      toast.warning("Cloud sync is unavailable, so projects are being saved in this browser.", { description: reason, duration: 8000 });
    };
    window.addEventListener(STORAGE_FALLBACK_EVENT, onFallback);
    return () => window.removeEventListener(STORAGE_FALLBACK_EVENT, onFallback);
  }, []);
  return kind;
}
