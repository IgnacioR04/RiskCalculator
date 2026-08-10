-- Pruebas negativas de RLS (cierre de D6, criterio de G2).
--
-- Se ejecutan con `supabase test db`, que las corre con pgTAP sobre una base
-- local recién migrada. Sustituyen al script manual anterior, que dependía de
-- variables de psql y de dos usuarios creados a mano: eso no podía correr en
-- CI, así que la RLS nunca llegaba a comprobarse de forma automática.
--
-- Lo que importa aquí no es que un usuario vea lo suyo —eso solo demuestra que
-- la consulta funciona— sino que **no pueda ver, cambiar ni borrar lo ajeno**.
-- Una política mal escrita casi siempre falla por el lado permisivo, y ese es
-- justo el lado que estas pruebas vigilan.

begin;
-- El plan es explícito a propósito: si una aserción deja de ejecutarse por un
-- error a mitad del archivo, pgTAP lo detecta en vez de dar por buena una
-- suite incompleta. A cambio hay que mantener el número al día.
select plan(28);

create extension if not exists pgtap with schema extensions;

-- ── Semilla ────────────────────────────────────────────────────────────────
-- Dos usuarios reales en auth.users. El trigger on_auth_user_created crea su
-- fila en profiles, cosa que también se comprueba.

insert into auth.users (id, email)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@ejemplo.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@ejemplo.test');

insert into public.broker_accounts (id, user_id, broker_name, account_label)
values
  ('00000000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Broker A', 'Cuenta A'),
  ('00000000-0000-4000-8000-00000000000b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Broker B', 'Cuenta B');

insert into public.assets (id, user_id, symbol, name, asset_type, quote_currency)
values
  ('00000000-0000-4000-8000-00000000001a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'AAA', 'Activo A', 'stock', 'EUR'),
  ('00000000-0000-4000-8000-00000000001b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'BBB', 'Activo B', 'stock', 'USD');

insert into public.scenarios (id, user_id, name, mode, currency, inputs)
values
  ('00000000-0000-4000-8000-00000000002a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Escenario A', 'restore', 'EUR', '{}'::jsonb),
  ('00000000-0000-4000-8000-00000000002b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Escenario B', 'breakeven', 'USD', '{}'::jsonb);

-- El trigger de alta debe haber creado ambos perfiles.
select is(
  (select count(*)::int from public.profiles
   where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),
  2,
  'el alta de usuario crea su perfil'
);

-- ── Todas las tablas privadas tienen RLS activa ───────────────────────────
-- Una tabla sin RLS no falla ninguna prueba de datos: simplemente lo enseña
-- todo. Por eso se comprueba el interruptor, no solo el comportamiento.

select is(
  (select bool_and(rowsecurity) from pg_tables
   where schemaname = 'public'
     and tablename in ('profiles', 'preferences', 'risk_profiles', 'risk_results',
                       'broker_accounts', 'assets', 'transactions', 'scenarios',
                       'import_batches')),
  true,
  'las nueve tablas privadas tienen RLS activada'
);

select is(
  (select bool_and(rowsecurity) from pg_tables
   where schemaname = 'public' and tablename in ('brokers', 'price_cache', 'fx_rates')),
  true,
  'las cachés compartidas también tienen RLS activada'
);

-- ── Como usuario A ─────────────────────────────────────────────────────────

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
  true
);

select is((select count(*)::int from public.profiles), 1, 'A ve un solo perfil: el suyo');
select is((select count(*)::int from public.broker_accounts), 1, 'A ve una sola cuenta');
select is((select count(*)::int from public.assets), 1, 'A ve un solo activo');
select is((select count(*)::int from public.scenarios), 1, 'A ve un solo escenario');

-- Negativas de lectura: las filas de B no existen para A.
select is(
  (select count(*)::int from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  0,
  'A no ve el perfil de B'
);
select is(
  (select count(*)::int from public.broker_accounts where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  0,
  'A no ve las cuentas de B'
);
select is(
  (select count(*)::int from public.assets where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  0,
  'A no ve los activos de B'
);
select is(
  (select count(*)::int from public.scenarios where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  0,
  'A no ve los escenarios de B'
);

-- Negativas de escritura: un UPDATE sobre lo ajeno no lanza error, simplemente
-- no afecta a ninguna fila. Por eso se cuenta el efecto y no se espera excepción.
with cambiadas as (
  update public.assets set name = 'Secuestrado'
  where id = '00000000-0000-4000-8000-00000000001b'
  returning 1
)
select is((select count(*)::int from cambiadas), 0, 'A no puede modificar un activo de B');

with cambiadas as (
  update public.broker_accounts set account_label = 'Secuestrada'
  where id = '00000000-0000-4000-8000-00000000000b'
  returning 1
)
select is((select count(*)::int from cambiadas), 0, 'A no puede modificar una cuenta de B');

with borradas as (
  delete from public.assets
  where id = '00000000-0000-4000-8000-00000000001b'
  returning 1
)
select is((select count(*)::int from borradas), 0, 'A no puede borrar un activo de B');

with borrados as (
  delete from public.scenarios
  where id = '00000000-0000-4000-8000-00000000002b'
  returning 1
)
select is((select count(*)::int from borrados), 0, 'A no puede borrar un escenario de B');

-- Negativa de inserción: A no puede crear filas a nombre de B.
select throws_ok(
  $$insert into public.assets (user_id, symbol, name, asset_type, quote_currency)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'CCC', 'Suplantado', 'stock', 'EUR')$$,
  '42501',
  null,
  'A no puede insertar un activo a nombre de B'
);

select throws_ok(
  $$insert into public.scenarios (user_id, name, mode, currency, inputs)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Suplantado', 'restore', 'EUR', '{}'::jsonb)$$,
  '42501',
  null,
  'A no puede insertar un escenario a nombre de B'
);

-- Las cachés compartidas se leen pero no se escriben desde el cliente.
select throws_ok(
  $$insert into public.brokers (name) values ('Broker inventado')$$,
  '42501',
  null,
  'A no puede escribir en la caché compartida de brokers'
);

-- ── Como usuario B: la simetría importa ────────────────────────────────────
-- Sin esto, una política que devolviera siempre las filas del primer usuario
-- pasaría todas las pruebas anteriores.

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'role', 'authenticated')::text,
  true
);

select is((select count(*)::int from public.assets), 1, 'B ve un solo activo');
select is(
  (select symbol from public.assets),
  'BBB',
  'y el que ve B es el suyo, no el de A'
);
select is(
  (select count(*)::int from public.assets where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0,
  'B tampoco ve los activos de A'
);
select is(
  (select count(*)::int from public.scenarios where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0,
  'B no ve los escenarios de A'
);

-- ── Sin sesión ─────────────────────────────────────────────────────────────
-- El rol anónimo es el que usa cualquiera con la anon key, que es pública.

reset role;
set local role anon;
select set_config('request.jwt.claims', null, true);

select is((select count(*)::int from public.profiles), 0, 'sin sesión no se ve ningún perfil');
select is((select count(*)::int from public.assets), 0, 'sin sesión no se ve ningún activo');
select is((select count(*)::int from public.transactions), 0, 'sin sesión no se ve ninguna operación');
select is((select count(*)::int from public.scenarios), 0, 'sin sesión no se ve ningún escenario');
select is((select count(*)::int from public.broker_accounts), 0, 'sin sesión no se ve ninguna cuenta');

select throws_ok(
  $$insert into public.assets (user_id, symbol, name, asset_type, quote_currency)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ZZZ', 'Anónimo', 'stock', 'EUR')$$,
  '42501',
  null,
  'sin sesión no se puede insertar nada'
);

select * from finish();
rollback;
