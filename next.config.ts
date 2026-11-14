import type { NextConfig } from "next";

/**
 * Homer reads its Supabase settings only from HOMER_-prefixed variables, so it
 * can't accidentally connect to another app's project that shares the same
 * environment (generic NEXT_PUBLIC_SUPABASE_* names are ignored on purpose).
 * They're inlined at build time for the browser; both values are public by design.
 */
const nextConfig: NextConfig = {
  env: {
    HOMER_SUPABASE_URL: process.env.HOMER_NEXT_PUBLIC_SUPABASE_URL ?? "",
    HOMER_SUPABASE_KEY: process.env.HOMER_NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.HOMER_NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  },
};

export default nextConfig;
