-- RiskCalculator — esquema inicial con Row Level Security en todas las tablas.
-- Aplicar con: supabase db push  (o supabase migration up en local)
--
-- Principios:
-- * Cada fila privada lleva user_id y las políticas exigen auth.uid() = user_id.
-- * Las posiciones NO se guardan: se derivan de transactions.
-- * price_cache y fx_rates son caché global: lectura para autenticados,
--   escritura solo para service_role (las Edge Functions).
-- * En el piloto los activos son por usuario (assets.user_id); un catálogo
--   global compartido queda como evolución futura (docs/DECISIONS.md).

-- ── Perfiles ──────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_currency text not null default 'EUR' check (display_currency in ('EUR', 'USD')),
  locale text not null default 'es-ES',
  risk_free_rate numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

-- Crea el perfil automáticamente al registrarse.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Perfil de riesgo (versionado, repetible) ──────────────────────────────

create table public.risk_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version int not null default 1,
  answers jsonb not null,
  score int not null check (score between 0 and 10),
  category text not null check (category in ('conservador', 'moderado', 'dinamico')),
  completed_at timestamptz not null default now()
);

create index risk_profiles_user_idx on public.risk_profiles (user_id);
alter table public.risk_profiles enable row level security;

create policy "risk_profiles_select_own" on public.risk_profiles
  for select using (auth.uid() = user_id);
create policy "risk_profiles_insert_own" on public.risk_profiles
  for insert with check (auth.uid() = user_id);
create policy "risk_profiles_update_own" on public.risk_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "risk_profiles_delete_own" on public.risk_profiles
  for delete using (auth.uid() = user_id);

-- ── Catálogo de brókeres (lectura pública autenticada; sin escritura) ─────

create table public.brokers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  country text,
  supported_products text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb
);

alter table public.brokers enable row level security;

create policy "brokers_read_authenticated" on public.brokers
  for select to authenticated using (true);
-- Escrituras solo con service_role (sin política ⇒ denegado).

-- ── Cuentas de bróker ─────────────────────────────────────────────────────

create table public.broker_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_id uuid references public.brokers (id),
  broker_name text not null,
  account_label text not null default 'Cuenta principal',
  country text,
  plan text,
  default_currency text not null default 'EUR' check (default_currency in ('EUR', 'USD')),
  created_at timestamptz not null default now()
);

create index broker_accounts_user_idx on public.broker_accounts (user_id);
alter table public.broker_accounts enable row level security;

create policy "broker_accounts_select_own" on public.broker_accounts
  for select using (auth.uid() = user_id);
create policy "broker_accounts_insert_own" on public.broker_accounts
  for insert with check (auth.uid() = user_id);
create policy "broker_accounts_update_own" on public.broker_accounts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "broker_accounts_delete_own" on public.broker_accounts
  for delete using (auth.uid() = user_id);

-- ── Activos (por usuario en el piloto) ────────────────────────────────────

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  name text not null,
  asset_type text not null check (
    asset_type in ('stock', 'etf', 'crypto', 'commodity', 'index', 'cash', 'manual')
  ),
  quote_currency text not null default 'EUR' check (quote_currency in ('EUR', 'USD')),
  isin text,
  exchange text,
  sector text,
  industry text,
  country text,
  provider_ids jsonb not null default '{}'::jsonb,
  manual_price jsonb,
  is_demo boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index assets_user_idx on public.assets (user_id);
alter table public.assets enable row level security;

create policy "assets_select_own" on public.assets
  for select using (auth.uid() = user_id);
create policy "assets_insert_own" on public.assets
  for insert with check (auth.uid() = user_id);
create policy "assets_update_own" on public.assets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "assets_delete_own" on public.assets
  for delete using (auth.uid() = user_id);

-- ── Transacciones (fuente de verdad de las posiciones) ────────────────────

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.broker_accounts (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete cascade,
  type text not null check (type in ('buy', 'sell')),
  datetime timestamptz not null,
  invested_amount numeric not null check (invested_amount > 0),
  invested_currency text not null check (invested_currency in ('EUR', 'USD')),
  quantity numeric not null check (quantity > 0),
  execution_price numeric check (execution_price > 0),
  quote_currency text not null check (quote_currency in ('EUR', 'USD')),
  -- Comisión real o estimada; el origen/regla vive en la cuenta.
  fee numeric check (fee >= 0),
  fee_currency text check (fee_currency in ('EUR', 'USD')),
  source_type text not null default 'exact' check (
    source_type in ('exact', 'historical_estimate', 'return_estimate', 'json_import')
  ),
  confidence text not null default 'exact' check (
    confidence in ('exact', 'high', 'medium', 'low')
  ),
  estimation_notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index transactions_user_idx on public.transactions (user_id);
create index transactions_asset_idx on public.transactions (user_id, asset_id);
alter table public.transactions enable row level security;

create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);
create policy "transactions_insert_own" on public.transactions
  for insert with check (auth.uid() = user_id);
create policy "transactions_update_own" on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions_delete_own" on public.transactions
  for delete using (auth.uid() = user_id);

-- ── Escenarios guardados de la calculadora ────────────────────────────────

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  mode text not null check (mode in ('restore', 'breakeven')),
  currency text not null check (currency in ('EUR', 'USD')),
  inputs jsonb not null,
  created_at timestamptz not null default now()
);

create index scenarios_user_idx on public.scenarios (user_id);
alter table public.scenarios enable row level security;

create policy "scenarios_select_own" on public.scenarios
  for select using (auth.uid() = user_id);
create policy "scenarios_insert_own" on public.scenarios
  for insert with check (auth.uid() = user_id);
create policy "scenarios_update_own" on public.scenarios
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "scenarios_delete_own" on public.scenarios
  for delete using (auth.uid() = user_id);

-- ── Lotes de importación JSON ─────────────────────────────────────────────

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  raw_json jsonb not null,
  validation_status text not null check (validation_status in ('valid', 'invalid')),
  warnings jsonb not null default '[]'::jsonb,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create index import_batches_user_idx on public.import_batches (user_id);
alter table public.import_batches enable row level security;

create policy "import_batches_select_own" on public.import_batches
  for select using (auth.uid() = user_id);
create policy "import_batches_insert_own" on public.import_batches
  for insert with check (auth.uid() = user_id);
create policy "import_batches_delete_own" on public.import_batches
  for delete using (auth.uid() = user_id);

-- ── Cachés globales de mercado (escritura solo service_role) ──────────────

create table public.price_cache (
  provider text not null,
  asset_key text not null,
  "interval" text not null default '1day',
  ts timestamptz not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric not null,
  currency text not null check (currency in ('EUR', 'USD')),
  fetched_at timestamptz not null default now(),
  primary key (provider, asset_key, "interval", ts)
);

alter table public.price_cache enable row level security;
create policy "price_cache_read_authenticated" on public.price_cache
  for select to authenticated using (true);

create table public.fx_rates (
  base_currency text not null check (base_currency in ('EUR', 'USD')),
  quote_currency text not null check (quote_currency in ('EUR', 'USD')),
  date date not null,
  rate numeric not null check (rate > 0),
  provider text not null,
  fetched_at timestamptz not null default now(),
  primary key (base_currency, quote_currency, date, provider)
);

alter table public.fx_rates enable row level security;
create policy "fx_rates_read_authenticated" on public.fx_rates
  for select to authenticated using (true);
