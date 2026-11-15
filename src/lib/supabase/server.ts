import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Public (publishable-key) client for server routes; RLS applies exactly as in the browser. */
export function publicSupabase(): SupabaseClient | null {
  const url = process.env.HOMER_SUPABASE_URL || process.env.HOMER_NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.HOMER_SUPABASE_KEY || process.env.HOMER_NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Privileged client for catalog writes during feed sync only. Requires
 * HOMER_SUPABASE_SECRET_KEY (a Supabase secret / service-role key), which must
 * never be exposed to the browser.
 */
export function adminSupabase(): SupabaseClient | null {
  const url = process.env.HOMER_SUPABASE_URL || process.env.HOMER_NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.HOMER_SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
