-- RLS verification for RiskCalculator.
--
-- Run after applying migrations and creating two confirmed test users.
-- Replace the psql variables below with real auth.users UUIDs:
--
--   \set user_a 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
--   \set user_b 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
--
-- The script runs in one transaction and rolls back the seed rows at the end.

begin;

-- Seed rows as the privileged SQL editor role. The two users must already
-- exist in auth.users because application rows reference that table.
insert into public.profiles (id)
values (:'user_a'), (:'user_b')
on conflict do nothing;

insert into public.preferences (user_id, display_currency, locale, risk_free_rate)
values
  (:'user_a', 'EUR', 'es-ES', 0),
  (:'user_b', 'USD', 'es-ES', 0.02)
on conflict (user_id) do update set display_currency = excluded.display_currency;

insert into public.broker_accounts (id, user_id, broker_name, account_label)
values
  ('00000000-0000-4000-8000-00000000000a', :'user_a', 'Broker A', 'Cuenta A'),
  ('00000000-0000-4000-8000-00000000000b', :'user_b', 'Broker B', 'Cuenta B')
on conflict (id) do nothing;

insert into public.assets (id, user_id, symbol, name, asset_type, quote_currency)
values
  ('00000000-0000-4000-8000-00000000001a', :'user_a', 'AAA', 'Activo A', 'stock', 'EUR'),
  ('00000000-0000-4000-8000-00000000001b', :'user_b', 'BBB', 'Activo B', 'stock', 'USD')
on conflict (id) do nothing;

insert into public.transactions (
  id,
  user_id,
  account_id,
  asset_id,
  type,
  datetime,
  invested_amount,
  invested_currency,
  quantity,
  execution_price,
  quote_currency,
  fee,
  fee_currency,
  source_type,
  confidence
)
values
  (
    '00000000-0000-4000-8000-00000000002a',
    :'user_a',
    '00000000-0000-4000-8000-00000000000a',
    '00000000-0000-4000-8000-00000000001a',
    'buy',
    now(),
    100,
    'EUR',
    1,
    100,
    'EUR',
    null,
    null,
    'exact',
    'exact'
  ),
  (
    '00000000-0000-4000-8000-00000000002b',
    :'user_b',
    '00000000-0000-4000-8000-00000000000b',
    '00000000-0000-4000-8000-00000000001b',
    'buy',
    now(),
    100,
    'USD',
    1,
    100,
    'USD',
    null,
    null,
    'exact',
    'exact'
  )
on conflict (id) do nothing;

insert into public.scenarios (id, user_id, name, mode, currency, inputs)
values
  ('00000000-0000-4000-8000-00000000003a', :'user_a', 'Escenario A', 'restore', 'EUR', '{}'::jsonb),
  ('00000000-0000-4000-8000-00000000003b', :'user_b', 'Escenario B', 'restore', 'USD', '{}'::jsonb)
on conflict (id) do nothing;

insert into public.import_batches (id, user_id, raw_json, validation_status, warnings, confirmed_at)
values
  ('00000000-0000-4000-8000-00000000004a', :'user_a', '{"a": true}'::jsonb, 'valid', '[]'::jsonb, now()),
  ('00000000-0000-4000-8000-00000000004b', :'user_b', '{"b": true}'::jsonb, 'valid', '[]'::jsonb, now())
on conflict (id) do nothing;

insert into public.risk_profiles (id, user_id, version, answers, score, category, completed_at)
values
  ('00000000-0000-4000-8000-00000000005a', :'user_a', 1, '{}'::jsonb, 3, 'conservador', now()),
  ('00000000-0000-4000-8000-00000000005b', :'user_b', 1, '{}'::jsonb, 8, 'dinamico', now())
on conflict (id) do nothing;

insert into public.risk_results (id, user_id, result_type, inputs, result)
values
  ('00000000-0000-4000-8000-00000000006a', :'user_a', 'portfolio_risk', '{}'::jsonb, '{"ok": true}'::jsonb),
  ('00000000-0000-4000-8000-00000000006b', :'user_b', 'portfolio_risk', '{}'::jsonb, '{"ok": true}'::jsonb)
on conflict (id) do nothing;

-- Simulate user A.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text,
  true
);

select 'profiles' as table_name, count(*) = 1 as only_own_rows from public.profiles;
select 'preferences' as table_name, count(*) = 1 as only_own_rows from public.preferences;
select 'broker_accounts' as table_name, count(*) = 1 as only_own_rows from public.broker_accounts;
select 'assets' as table_name, count(*) = 1 as only_own_rows from public.assets;
select 'transactions' as table_name, count(*) = 1 as only_own_rows from public.transactions;
select 'scenarios' as table_name, count(*) = 1 as only_own_rows from public.scenarios;
select 'import_batches' as table_name, count(*) = 1 as only_own_rows from public.import_batches;
select 'risk_profiles' as table_name, count(*) = 1 as only_own_rows from public.risk_profiles;
select 'risk_results' as table_name, count(*) = 1 as only_own_rows from public.risk_results;

-- These should affect zero rows: user A cannot mutate user B rows.
update public.broker_accounts
set account_label = 'blocked'
where id = '00000000-0000-4000-8000-00000000000b';
select 'cross_user_update_blocked' as check_name, count(*) = 1 as ok
from public.broker_accounts
where id = '00000000-0000-4000-8000-00000000000a';

delete from public.assets
where id = '00000000-0000-4000-8000-00000000001b';
select 'cross_user_delete_blocked' as check_name, count(*) = 1 as ok
from public.assets
where id = '00000000-0000-4000-8000-00000000001a';

-- This must fail with an RLS error because user A cannot insert user B data.
select set_config('riskcalculator.test_user_b', :'user_b', true);

do $$
declare
  blocked boolean := false;
  target_user uuid := current_setting('riskcalculator.test_user_b')::uuid;
begin
  begin
    insert into public.scenarios (user_id, name, mode, currency, inputs)
    values (target_user, 'No deberia entrar', 'restore', 'EUR', '{}'::jsonb);
  exception
    when insufficient_privilege then
      blocked := true;
  end;

  if not blocked then
    raise exception 'cross-user insert was allowed';
  end if;
end;
$$;

select 'cross_user_insert_blocked' as check_name, true as ok;

rollback;
