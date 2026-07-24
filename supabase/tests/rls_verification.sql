-- Verificación de RLS (criterio de aceptación 10):
-- «Un usuario autenticado no puede acceder a datos de otro».
--
-- Ejecutar en el SQL Editor de Supabase (o psql) DESPUÉS de aplicar las
-- migraciones y de crear dos usuarios de prueba. Sustituye los UUID.
--
-- ⚠️ PENDIENTE DE EJECUTAR contra un proyecto real: este repositorio no
-- incluye credenciales. El resultado esperado de cada bloque está anotado.

-- 1) Como service_role, sembrar datos de dos usuarios ficticios ya creados
--    en auth.users (magic link o invitación):
--    :user_a = uuid del usuario A, :user_b = uuid del usuario B

insert into public.broker_accounts (id, user_id, broker_name, account_label)
values
  ('00000000-0000-4000-8000-00000000000a', :'user_a', 'Broker A', 'Cuenta A'),
  ('00000000-0000-4000-8000-00000000000b', :'user_b', 'Broker B', 'Cuenta B');

-- 2) Simular al usuario A con el rol authenticated:
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);

-- ESPERADO: solo la cuenta de A (1 fila, 'Broker A')
select broker_name from public.broker_accounts;

-- ESPERADO: 0 filas afectadas (no puede tocar datos de B)
update public.broker_accounts set account_label = 'hackeada'
where id = '00000000-0000-4000-8000-00000000000b';

-- ESPERADO: error o 0 filas (no puede insertar con user_id de B)
insert into public.broker_accounts (user_id, broker_name, account_label)
values (:'user_b', 'Broker Falso', 'X');

-- ESPERADO: 0 filas eliminadas
delete from public.broker_accounts
where id = '00000000-0000-4000-8000-00000000000b';

reset role;

-- 3) Repetir el bloque 2 con :user_b y comprobar el espejo.

-- 4) Cachés globales: como authenticated debe PODER leer y NO escribir.
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
select count(*) from public.fx_rates;          -- ESPERADO: OK (0+ filas)
insert into public.fx_rates (base_currency, quote_currency, date, rate, provider)
values ('EUR', 'USD', current_date, 1.1, 'x'); -- ESPERADO: error de política
reset role;
