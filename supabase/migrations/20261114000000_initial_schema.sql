-- Homer: AI interior design & space planning
-- Initial schema. Every object is prefixed `homer_` / `homer-` so this can live
-- in a Supabase project shared with other apps without touching their tables. The editable scene lives in projects.scene (jsonb, the canonical
-- model shared by the 2D editor, 3D view, solver and AI). Relational tables hold
-- entities we query or audit independently. Every table is owner-scoped via RLS.
--
-- Auth: the app signs users in anonymously by default (enable "Anonymous sign-ins"
-- in Supabase Auth settings). Linking an email later keeps the same auth.uid().

create extension if not exists "pgcrypto";

-- ───────────────────────── preferences ─────────────────────────
create table if not exists public.homer_user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  style text,
  budget_usd numeric,
  notes text,
  updated_at timestamptz not null default now()
);

-- ───────────────────────── projects ─────────────────────────
create table if not exists public.homer_projects (
  id text primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  unit_type text not null default 'custom' check (unit_type in ('studio', '1br', '2br', 'custom')),
  -- canonical scene (walls, openings, rooms, items, style) in inches
  scene jsonb not null,
  conversation jsonb not null default '[]'::jsonb,
  preferences jsonb,
  -- optimistic concurrency: clients update with `where revision = <expected>`
  revision integer not null default 0,
  thumbnail text,
  item_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists homer_projects_owner_updated_idx on public.homer_projects (owner_id, updated_at desc);

-- uploaded floor plans + AI extraction results (pixel space) and calibration
create table if not exists public.homer_floor_plans (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.homer_projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path text not null,
  width_px integer not null,
  height_px integer not null,
  inches_per_px numeric,
  calibration_source text,
  extraction jsonb,
  created_at timestamptz not null default now()
);

-- saved layout alternatives (e.g. "Maximum open space")
create table if not exists public.homer_design_layouts (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.homer_projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  strategy text,
  items jsonb not null,
  metrics jsonb,
  created_at timestamptz not null default now()
);

-- ───────────────────────── catalog ─────────────────────────
-- Public catalog (sample items ship in code; retailer feeds land here).
create table if not exists public.homer_furniture_catalog (
  id text primary key,
  source text not null default 'retailer' check (source in ('sample', 'retailer', 'user')),
  owner_id uuid references auth.users (id) on delete cascade, -- set for user-created items
  name text not null,
  category text not null,
  width_in numeric not null,
  depth_in numeric not null,
  height_in numeric not null,
  price_usd numeric,
  styles text[] not null default '{}',
  finishes jsonb not null default '[]'::jsonb,
  materials text[] not null default '{}',
  description text,
  product_url text,
  image_url text,
  model_url text,
  retailer text,
  updated_at timestamptz not null default now()
);
create index if not exists homer_furniture_catalog_category_idx on public.homer_furniture_catalog (category);

-- denormalized furniture placements for analytics/shopping lists (scene jsonb stays canonical)
create table if not exists public.homer_furniture_instances (
  id text not null,
  project_id text not null references public.homer_projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  catalog_id text not null,
  x_in numeric not null,
  y_in numeric not null,
  rotation_deg numeric not null default 0,
  width_in numeric not null,
  depth_in numeric not null,
  color text,
  material text,
  primary key (project_id, id)
);

-- ───────────────────────── AI ─────────────────────────
create table if not exists public.homer_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.homer_projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.homer_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.homer_ai_conversations (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  provider text,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

-- every validated action the AI proposed, and whether the user accepted it
create table if not exists public.homer_ai_actions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.homer_ai_messages (id) on delete cascade,
  project_id text not null references public.homer_projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action jsonb not null,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected', 'invalid')),
  created_at timestamptz not null default now()
);

create table if not exists public.homer_generated_visualizations (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.homer_projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null,
  provider_job_id text,
  status text not null default 'starting',
  prompt text,
  source_image_path text,
  output_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── RLS ─────────────────────────
alter table public.homer_user_preferences enable row level security;
alter table public.homer_projects enable row level security;
alter table public.homer_floor_plans enable row level security;
alter table public.homer_design_layouts enable row level security;
alter table public.homer_furniture_catalog enable row level security;
alter table public.homer_furniture_instances enable row level security;
alter table public.homer_ai_conversations enable row level security;
alter table public.homer_ai_messages enable row level security;
alter table public.homer_ai_actions enable row level security;
alter table public.homer_generated_visualizations enable row level security;

drop policy if exists "own preferences" on public.homer_user_preferences;
create policy "own preferences" on public.homer_user_preferences for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['homer_projects', 'homer_floor_plans', 'homer_design_layouts', 'homer_furniture_instances', 'homer_ai_conversations', 'homer_ai_messages', 'homer_ai_actions', 'homer_generated_visualizations']
  loop
    execute format('drop policy if exists "owner select" on public.%I', t);
    execute format('drop policy if exists "owner insert" on public.%I', t);
    execute format('drop policy if exists "owner update" on public.%I', t);
    execute format('drop policy if exists "owner delete" on public.%I', t);
    execute format('create policy "owner select" on public.%I for select using (owner_id = (select auth.uid()))', t);
    execute format('create policy "owner insert" on public.%I for insert with check (owner_id = (select auth.uid()))', t);
    execute format('create policy "owner update" on public.%I for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    execute format('create policy "owner delete" on public.%I for delete using (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- catalog: everyone signed in can read retailer/sample items; users manage their own
drop policy if exists "catalog read" on public.homer_furniture_catalog;
create policy "catalog read" on public.homer_furniture_catalog for select using (owner_id is null or owner_id = (select auth.uid()));
drop policy if exists "catalog own insert" on public.homer_furniture_catalog;
create policy "catalog own insert" on public.homer_furniture_catalog for insert with check (source = 'user' and owner_id = (select auth.uid()));
drop policy if exists "catalog own update" on public.homer_furniture_catalog;
create policy "catalog own update" on public.homer_furniture_catalog for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "catalog own delete" on public.homer_furniture_catalog;
create policy "catalog own delete" on public.homer_furniture_catalog for delete using (owner_id = (select auth.uid()));

-- ───────────────────────── storage ─────────────────────────
insert into storage.buckets (id, name, public)
values ('homer-floorplans', 'homer-floorplans', false)
on conflict (id) do nothing;

drop policy if exists "homer floorplans own read" on storage.objects;
create policy "homer floorplans own read" on storage.objects for select
  using (bucket_id = 'homer-floorplans' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "homer floorplans own write" on storage.objects;
create policy "homer floorplans own write" on storage.objects for insert
  with check (bucket_id = 'homer-floorplans' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "homer floorplans own update" on storage.objects;
create policy "homer floorplans own update" on storage.objects for update
  using (bucket_id = 'homer-floorplans' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "homer floorplans own delete" on storage.objects;
create policy "homer floorplans own delete" on storage.objects for delete
  using (bucket_id = 'homer-floorplans' and (storage.foldername(name))[1] = (select auth.uid())::text);
