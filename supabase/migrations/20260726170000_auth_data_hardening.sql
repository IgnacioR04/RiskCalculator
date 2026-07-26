-- Supabase auth/data hardening for RiskCalculator.
--
-- This migration is intentionally additive/idempotent:
-- * no tables or user data are dropped;
-- * private rows stay owned by auth.uid();
-- * anon receives no table privileges;
-- * authenticated receives only the privileges the browser app needs;
-- * public SECURITY DEFINER trigger functions cannot be called directly.

-- Keep explicit timestamps for conflict handling and audit views in the app.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

alter table public.broker_accounts
  add column if not exists updated_at timestamptz not null default now();

alter table public.assets
  add column if not exists updated_at timestamptz not null default now();

alter table public.transactions
  add column if not exists updated_at timestamptz not null default now();

alter table public.scenarios
  add column if not exists updated_at timestamptz not null default now();

alter table public.import_batches
  add column if not exists updated_at timestamptz not null default now();

alter table public.risk_profiles
  add column if not exists updated_at timestamptz not null default now();

-- Preferences are separated from the profile row so client settings can evolve
-- without turning auth profile data into an authorization surface.
create table if not exists public.preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_currency text not null default 'EUR' check (display_currency in ('EUR', 'USD')),
  locale text not null default 'es-ES' check (locale = 'es-ES'),
  risk_free_rate numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.risk_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  result_type text not null check (
    result_type in ('portfolio_risk', 'diversification', 'stress_test', 'calculator')
  ),
  source_id uuid,
  inputs jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists preferences_user_idx on public.preferences (user_id);
create index if not exists risk_results_user_idx on public.risk_results (user_id);
create index if not exists risk_results_user_type_idx on public.risk_results (user_id, result_type);

alter table public.preferences enable row level security;
alter table public.risk_results enable row level security;

-- RLS remains enabled on every exposed public table.
alter table public.profiles enable row level security;
alter table public.risk_profiles enable row level security;
alter table public.brokers enable row level security;
alter table public.broker_accounts enable row level security;
alter table public.assets enable row level security;
alter table public.transactions enable row level security;
alter table public.scenarios enable row level security;
alter table public.import_batches enable row level security;
alter table public.price_cache enable row level security;
alter table public.fx_rates enable row level security;

-- Data API privileges. RLS still decides which rows are visible.
revoke all on
  public.profiles,
  public.preferences,
  public.risk_profiles,
  public.risk_results,
  public.brokers,
  public.broker_accounts,
  public.assets,
  public.transactions,
  public.scenarios,
  public.import_batches,
  public.price_cache,
  public.fx_rates
from anon;

grant select, insert, update, delete on
  public.profiles,
  public.preferences,
  public.risk_profiles,
  public.risk_results,
  public.broker_accounts,
  public.assets,
  public.transactions,
  public.scenarios,
  public.import_batches
to authenticated;

grant select on public.brokers, public.price_cache, public.fx_rates to authenticated;

-- Harden existing ownership policies with explicit roles and cached auth.uid().
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);

drop policy if exists "preferences_select_own" on public.preferences;
drop policy if exists "preferences_insert_own" on public.preferences;
drop policy if exists "preferences_update_own" on public.preferences;
drop policy if exists "preferences_delete_own" on public.preferences;

create policy "preferences_select_own" on public.preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "preferences_insert_own" on public.preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "preferences_update_own" on public.preferences
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "preferences_delete_own" on public.preferences
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "risk_profiles_select_own" on public.risk_profiles;
drop policy if exists "risk_profiles_insert_own" on public.risk_profiles;
drop policy if exists "risk_profiles_update_own" on public.risk_profiles;
drop policy if exists "risk_profiles_delete_own" on public.risk_profiles;

create policy "risk_profiles_select_own" on public.risk_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "risk_profiles_insert_own" on public.risk_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "risk_profiles_update_own" on public.risk_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "risk_profiles_delete_own" on public.risk_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "risk_results_select_own" on public.risk_results;
drop policy if exists "risk_results_insert_own" on public.risk_results;
drop policy if exists "risk_results_update_own" on public.risk_results;
drop policy if exists "risk_results_delete_own" on public.risk_results;

create policy "risk_results_select_own" on public.risk_results
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "risk_results_insert_own" on public.risk_results
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "risk_results_update_own" on public.risk_results
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "risk_results_delete_own" on public.risk_results
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "broker_accounts_select_own" on public.broker_accounts;
drop policy if exists "broker_accounts_insert_own" on public.broker_accounts;
drop policy if exists "broker_accounts_update_own" on public.broker_accounts;
drop policy if exists "broker_accounts_delete_own" on public.broker_accounts;

create policy "broker_accounts_select_own" on public.broker_accounts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "broker_accounts_insert_own" on public.broker_accounts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "broker_accounts_update_own" on public.broker_accounts
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "broker_accounts_delete_own" on public.broker_accounts
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "assets_select_own" on public.assets;
drop policy if exists "assets_insert_own" on public.assets;
drop policy if exists "assets_update_own" on public.assets;
drop policy if exists "assets_delete_own" on public.assets;

create policy "assets_select_own" on public.assets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "assets_insert_own" on public.assets
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "assets_update_own" on public.assets
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "assets_delete_own" on public.assets
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "transactions_select_own" on public.transactions;
drop policy if exists "transactions_insert_own" on public.transactions;
drop policy if exists "transactions_update_own" on public.transactions;
drop policy if exists "transactions_delete_own" on public.transactions;

create policy "transactions_select_own" on public.transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "transactions_insert_own" on public.transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "transactions_update_own" on public.transactions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "transactions_delete_own" on public.transactions
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "scenarios_select_own" on public.scenarios;
drop policy if exists "scenarios_insert_own" on public.scenarios;
drop policy if exists "scenarios_update_own" on public.scenarios;
drop policy if exists "scenarios_delete_own" on public.scenarios;

create policy "scenarios_select_own" on public.scenarios
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "scenarios_insert_own" on public.scenarios
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "scenarios_update_own" on public.scenarios
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "scenarios_delete_own" on public.scenarios
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "import_batches_select_own" on public.import_batches;
drop policy if exists "import_batches_insert_own" on public.import_batches;
drop policy if exists "import_batches_update_own" on public.import_batches;
drop policy if exists "import_batches_delete_own" on public.import_batches;

create policy "import_batches_select_own" on public.import_batches
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "import_batches_insert_own" on public.import_batches
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "import_batches_update_own" on public.import_batches
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "import_batches_delete_own" on public.import_batches
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "brokers_read_authenticated" on public.brokers;
create policy "brokers_read_authenticated" on public.brokers
  for select to authenticated using (true);

drop policy if exists "price_cache_read_authenticated" on public.price_cache;
create policy "price_cache_read_authenticated" on public.price_cache
  for select to authenticated using (true);

drop policy if exists "fx_rates_read_authenticated" on public.fx_rates;
create policy "fx_rates_read_authenticated" on public.fx_rates
  for select to authenticated using (true);

-- Avoid cross-user FK wiring on transactions. SECURITY INVOKER is enough here:
-- the authenticated user can only see their own parent rows through RLS.
create or replace function public.validate_transaction_ownership()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.broker_accounts
    where id = new.account_id and user_id = new.user_id
  ) then
    raise exception 'account_id does not belong to transaction user';
  end if;

  if not exists (
    select 1 from public.assets
    where id = new.asset_id and user_id = new.user_id
  ) then
    raise exception 'asset_id does not belong to transaction user';
  end if;

  return new;
end;
$$;

-- New auth users receive both rows. This function must be SECURITY DEFINER
-- because it runs from the auth schema trigger.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

insert into public.profiles (id)
select id from auth.users
on conflict do nothing;

insert into public.preferences (user_id)
select id from auth.users
on conflict do nothing;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.validate_transaction_ownership() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists preferences_set_updated_at on public.preferences;
create trigger preferences_set_updated_at
  before update on public.preferences
  for each row execute function public.set_updated_at();

drop trigger if exists broker_accounts_set_updated_at on public.broker_accounts;
create trigger broker_accounts_set_updated_at
  before update on public.broker_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists assets_set_updated_at on public.assets;
create trigger assets_set_updated_at
  before update on public.assets
  for each row execute function public.set_updated_at();

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

drop trigger if exists scenarios_set_updated_at on public.scenarios;
create trigger scenarios_set_updated_at
  before update on public.scenarios
  for each row execute function public.set_updated_at();

drop trigger if exists import_batches_set_updated_at on public.import_batches;
create trigger import_batches_set_updated_at
  before update on public.import_batches
  for each row execute function public.set_updated_at();

drop trigger if exists risk_profiles_set_updated_at on public.risk_profiles;
create trigger risk_profiles_set_updated_at
  before update on public.risk_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists risk_results_set_updated_at on public.risk_results;
create trigger risk_results_set_updated_at
  before update on public.risk_results
  for each row execute function public.set_updated_at();
