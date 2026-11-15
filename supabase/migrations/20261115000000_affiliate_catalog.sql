-- Homer: retailer product feeds + affiliate click tracking.
-- Safe to run more than once.

-- ── retailer products (written by the feed sync with the secret key) ──
alter table public.homer_furniture_catalog
  add column if not exists network text,
  add column if not exists external_id text,
  add column if not exists currency text not null default 'USD',
  add column if not exists in_stock boolean not null default true,
  add column if not exists active boolean not null default true,
  -- the normalized catalog item exactly as the app uses it
  add column if not exists item jsonb;

create index if not exists homer_furniture_catalog_retailer_idx on public.homer_furniture_catalog (retailer, active);

-- ── outbound "Buy" clicks; the id is sent to the network as the sub-ID ──
create table if not exists public.homer_affiliate_clicks (
  id text primary key,
  catalog_id text not null,
  retailer text,
  network text,
  external_id text,
  price numeric,
  currency text,
  project_id text,
  placement text,
  tracked boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists homer_affiliate_clicks_created_idx on public.homer_affiliate_clicks (created_at desc);

-- commissions reported by the networks, matched back to clicks by sub-ID
create table if not exists public.homer_affiliate_conversions (
  id uuid primary key default gen_random_uuid(),
  click_id text references public.homer_affiliate_clicks (id),
  network text not null,
  order_id text,
  sale_amount numeric,
  commission numeric,
  currency text,
  status text,
  occurred_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (network, order_id)
);

alter table public.homer_affiliate_clicks enable row level security;
alter table public.homer_affiliate_conversions enable row level security;

-- anyone may record a click (the /go redirect logs with the publishable key);
-- nobody can read clicks or conversions without the secret key / dashboard
drop policy if exists "log clicks" on public.homer_affiliate_clicks;
create policy "log clicks" on public.homer_affiliate_clicks for insert to anon, authenticated with check (true);
