-- Política de inversión: RLS y reglas de integridad (LAB-205).
--
-- Además del acceso cruzado, se comprueban aquí las dos reglas de ADR-002 que
-- la migración hace cumplir en la base: que no exista riesgo efectivo sin
-- capacidad medida, y que un objetivo no pueda colgar de la política de otro.
--
-- Esa segunda es la que da nombre al criterio de aceptación de la tarea:
-- «usuario A no ve **ni referencia** policy B». La RLS filtra filas; no
-- comprueba a dónde apuntan las que sí puede escribir.

begin;
select plan(23);

create extension if not exists pgtap with schema extensions;

insert into auth.users (id, email)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ips-a@ejemplo.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ips-b@ejemplo.test');

-- Evaluación mínima válida: tolerancia respondida, capacidad vacía.
-- Es exactamente el borrador que produce la migración desde el perfil antiguo.
insert into public.investment_policies (id, user_id, status, effective_from, assessment)
values
  (
    '00000000-0000-4000-8000-0000000000a1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'draft',
    '2026-08-10',
    '{"tolerance":{"answers":{},"band":4,"assessedAt":"2026-08-10T00:00:00Z"},"capacity":{}}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-0000000000b1',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'draft',
    '2026-08-10',
    '{"tolerance":{"answers":{},"band":2,"assessedAt":"2026-08-10T00:00:00Z"},"capacity":{}}'::jsonb
  );

-- ── Integridad, con privilegios ────────────────────────────────────────────

select is(
  (select count(*)::int from pg_tables
   where schemaname = 'public'
     and tablename in ('investment_policies', 'investment_goals', 'portfolio_constraints')
     and rowsecurity),
  3,
  'las tres tablas nuevas nacen con RLS activada'
);

select throws_ok(
  $$insert into public.investment_policies (user_id, status, effective_from, assessment, effective_risk)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'draft', '2026-08-10',
            '{"tolerance":{"answers":{},"band":5,"assessedAt":"2026-08-10T00:00:00Z"},"capacity":{}}'::jsonb,
            5)$$,
  '23514',
  null,
  'no se puede guardar riesgo efectivo sin capacidad medida'
);

select lives_ok(
  $$insert into public.investment_policies (user_id, status, effective_from, assessment, effective_risk)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'superseded', '2026-08-10',
            '{"tolerance":{"answers":{},"band":5,"assessedAt":"2026-08-10T00:00:00Z"},"capacity":{"band":3,"horizonYears":10}}'::jsonb,
            3)$$,
  'con capacidad medida sí se admite riesgo efectivo'
);

select throws_ok(
  $$insert into public.investment_policies (user_id, status, effective_from, next_review_at, assessment)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'draft', '2026-08-10', '2026-08-09',
            '{"tolerance":{"answers":{},"band":3,"assessedAt":"2026-08-10T00:00:00Z"},"capacity":{}}'::jsonb)$$,
  '23514',
  null,
  'la revisión no puede ser anterior a la entrada en vigor'
);

select throws_ok(
  $$insert into public.investment_policies (user_id, status, effective_from, assessment)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'inventado', '2026-08-10',
            '{"tolerance":{"answers":{},"band":3,"assessedAt":"2026-08-10T00:00:00Z"},"capacity":{}}'::jsonb)$$,
  '23514',
  null,
  'un estado desconocido no entra'
);

-- Una sola activa por usuario.
update public.investment_policies set status = 'active'
where id = '00000000-0000-4000-8000-0000000000a1';

select throws_ok(
  $$insert into public.investment_policies (user_id, status, effective_from, assessment)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'active', '2026-08-11',
            '{"tolerance":{"answers":{},"band":3,"assessedAt":"2026-08-10T00:00:00Z"},"capacity":{}}'::jsonb)$$,
  '23505',
  null,
  'un usuario no puede tener dos políticas activas'
);

select lives_ok(
  $$insert into public.investment_policies (user_id, status, effective_from, assessment)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'active', '2026-08-11',
            '{"tolerance":{"answers":{},"band":3,"assessedAt":"2026-08-10T00:00:00Z"},"capacity":{}}'::jsonb)$$,
  'pero otro usuario sí puede tener la suya activa'
);

-- ── Como usuario A ─────────────────────────────────────────────────────────

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
  true
);

select is(
  (select count(*)::int from public.investment_policies
   where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  0,
  'A no ve ninguna política de B'
);

select is(
  (select count(*)::int from public.investment_policies
   where id = '00000000-0000-4000-8000-0000000000b1'),
  0,
  'A no ve la política de B ni buscándola por su identificador'
);

-- CRUD sobre lo propio.
select lives_ok(
  $$insert into public.investment_goals
      (policy_id, user_id, name, priority, currency, target_amount, target_date)
    values ('00000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'Entrada casa', 'esencial', 'EUR', 60000, '2032-01-01')$$,
  'A puede crear un objetivo en su propia política'
);

select is((select count(*)::int from public.investment_goals), 1, 'y lo ve');

select lives_ok(
  $$update public.investment_goals set target_amount = 65000
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  'A puede modificar su objetivo'
);

select lives_ok(
  $$insert into public.portfolio_constraints (policy_id, user_id, kind, payload)
    values ('00000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'turnover', '{"max":0.2}'::jsonb)$$,
  'A puede crear una restricción en su política'
);

select throws_ok(
  $$insert into public.portfolio_constraints (policy_id, user_id, kind, payload)
    values ('00000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'inventada', '{}'::jsonb)$$,
  '23514',
  null,
  'pero no de un tipo desconocido'
);

-- ── El criterio de aceptación: ni ver, ni referenciar ───────────────────────
-- La clave ajena compuesta es lo que impide esto. Con una simple sobre
-- `policy_id`, A podría colgar un objetivo suyo de la política de B.

select throws_ok(
  $$insert into public.investment_goals
      (policy_id, user_id, name, priority, currency, target_amount, target_date)
    values ('00000000-0000-4000-8000-0000000000b1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'Colado', 'esencial', 'EUR', 1000, '2030-01-01')$$,
  '23503',
  null,
  'A no puede colgar un objetivo de la política de B'
);

select throws_ok(
  $$insert into public.portfolio_constraints (policy_id, user_id, kind, payload)
    values ('00000000-0000-4000-8000-0000000000b1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'turnover', '{"max":0.5}'::jsonb)$$,
  '23503',
  null,
  'A tampoco puede colgar una restricción de la política de B'
);

select throws_ok(
  $$insert into public.investment_policies (user_id, status, effective_from, assessment)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'draft', '2026-08-10',
            '{"tolerance":{"answers":{},"band":3,"assessedAt":"2026-08-10T00:00:00Z"},"capacity":{}}'::jsonb)$$,
  '42501',
  null,
  'A no puede crear una política a nombre de B'
);

-- Escrituras cruzadas: no lanzan, simplemente no afectan a nada.
with cambiadas as (
  update public.investment_policies set status = 'superseded'
  where id = '00000000-0000-4000-8000-0000000000b1'
  returning 1
)
select is((select count(*)::int from cambiadas), 0, 'A no puede cambiar el estado de la política de B');

with borradas as (
  delete from public.investment_policies
  where id = '00000000-0000-4000-8000-0000000000b1'
  returning 1
)
select is((select count(*)::int from borradas), 0, 'A no puede borrar la política de B');

-- ── Como usuario B: simetría ───────────────────────────────────────────────

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'role', 'authenticated')::text,
  true
);

select is(
  (select count(*)::int from public.investment_goals),
  0,
  'B no ve los objetivos de A'
);
select is(
  (select count(*)::int from public.portfolio_constraints),
  0,
  'B no ve las restricciones de A'
);

-- ── Sin sesión ─────────────────────────────────────────────────────────────

reset role;
set local role anon;
select set_config('request.jwt.claims', null, true);

select throws_ok(
  $$select id from public.investment_policies$$,
  '42501', null,
  'sin sesión no se puede ni leer las políticas'
);
select throws_ok(
  $$select id from public.investment_goals$$,
  '42501', null,
  'sin sesión no se puede ni leer los objetivos'
);

select * from finish();
rollback;
