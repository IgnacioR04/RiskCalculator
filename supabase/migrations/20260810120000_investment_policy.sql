-- Política de inversión del Laboratorio (LAB-205).
--
-- Migración **aditiva**: crea tablas nuevas y no toca ninguna de las cuatro ya
-- aplicadas. Implementa el modelo de `docs/adr/ADR-002-investment-policy.md` y
-- el dominio de `src/lib/lab/domain/investmentPolicy.ts`.
--
-- Dos reglas del ADR se hacen cumplir aquí, no solo en el cliente:
--
--   · no puede haber riesgo efectivo sin capacidad medida;
--   · un objetivo o una restricción no pueden colgar de la política de otro.
--
-- El cliente ya valida ambas con zod, pero una base de datos que solo confía en
-- su cliente no protege nada: cualquiera con la anon key puede hablar con ella
-- directamente.

-- ── Políticas ──────────────────────────────────────────────────────────────

create table public.investment_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  schema_version integer not null default 1 check (schema_version >= 1),
  version integer not null default 1 check (version >= 1),
  status text not null check (status in ('draft', 'active', 'superseded')),

  effective_from date not null,
  reviewed_at date,
  next_review_at date,

  base_currency text not null default 'EUR' check (base_currency in ('EUR', 'USD')),

  -- Tolerancia, capacidad y necesidad. Se guardan juntas porque son una
  -- evaluación con fecha, no tres columnas sueltas que puedan desincronizarse.
  assessment jsonb not null,

  effective_risk smallint check (effective_risk between 1 and 5),
  effective_risk_rule_version integer not null default 1 check (effective_risk_rule_version >= 1),

  liquidity_reserve_months numeric(5, 2) check (liquidity_reserve_months >= 0),
  contribution_plan jsonb,
  rebalance_policy jsonb not null default '{"kind":"none"}'::jsonb,
  assumptions jsonb not null default '{}'::jsonb,
  acknowledgements jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- La revisión no puede ser anterior a la entrada en vigor.
  constraint investment_policies_review_after_start
    check (next_review_at is null or next_review_at >= effective_from),

  -- ADR-002 §3: sin capacidad medida no hay riesgo efectivo. La capacidad no
  -- se deduce de la tolerancia, así que tampoco puede aparecer un riesgo
  -- efectivo «heredado» de ella.
  constraint investment_policies_effective_risk_needs_capacity
    check (
      effective_risk is null
      or (assessment #>> '{capacity,band}') is not null
    ),

  -- Tres bloques obligatorios en la evaluación, aunque capacidad venga vacía.
  constraint investment_policies_assessment_shape
    check (
      jsonb_typeof(assessment) = 'object'
      and assessment ? 'tolerance'
      and assessment ? 'capacity'
    ),

  -- Necesario para la clave ajena compuesta de objetivos y restricciones.
  constraint investment_policies_id_user_unique unique (id, user_id)
);

-- Una sola política activa por usuario. Índice parcial: los borradores y las
-- superadas pueden ser muchos, la vigente solo una.
create unique index investment_policies_one_active_per_user
  on public.investment_policies (user_id)
  where status = 'active';

create index investment_policies_user_id_idx on public.investment_policies (user_id);
create index investment_policies_user_status_idx on public.investment_policies (user_id, status);

create trigger investment_policies_set_updated_at
  before update on public.investment_policies
  for each row execute function public.set_updated_at();

-- ── Objetivos ──────────────────────────────────────────────────────────────

create table public.investment_goals (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,

  name text not null check (length(name) between 1 and 120),
  priority text not null check (priority in ('esencial', 'importante', 'deseable')),
  currency text not null check (currency in ('EUR', 'USD')),
  target_amount numeric(20, 4) not null check (target_amount > 0),
  target_date date not null,
  date_flexible boolean not null default false,
  amount_flexible boolean not null default false,
  monthly_contribution numeric(20, 4) check (monthly_contribution >= 0),
  notes text check (notes is null or length(notes) <= 500),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Clave ajena **compuesta**: un objetivo solo puede colgar de una política
  -- del mismo usuario. Con una clave ajena simple sobre `policy_id`, alguien
  -- podría crear un objetivo suyo apuntando a la política de otro: la RLS
  -- filtra filas, pero no comprueba a dónde apuntan las que sí puede escribir.
  constraint investment_goals_policy_same_owner
    foreign key (policy_id, user_id)
    references public.investment_policies (id, user_id)
    on delete cascade
);

create index investment_goals_policy_id_idx on public.investment_goals (policy_id);
create index investment_goals_user_id_idx on public.investment_goals (user_id);

create trigger investment_goals_set_updated_at
  before update on public.investment_goals
  for each row execute function public.set_updated_at();

-- ── Restricciones de cartera ───────────────────────────────────────────────

create table public.portfolio_constraints (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,

  -- El tipo se guarda aparte del resto para poder indexarlo y para que un
  -- valor desconocido no entre; el detalle variable va en `payload`.
  kind text not null check (
    kind in (
      'assetWeight', 'groupWeight', 'turnover', 'liquidity',
      'lockedPosition', 'eligibleUniverse', 'contributionsOnly'
    )
  ),
  payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint portfolio_constraints_payload_is_object
    check (jsonb_typeof(payload) = 'object'),

  constraint portfolio_constraints_policy_same_owner
    foreign key (policy_id, user_id)
    references public.investment_policies (id, user_id)
    on delete cascade
);

create index portfolio_constraints_policy_id_idx on public.portfolio_constraints (policy_id);
create index portfolio_constraints_user_id_idx on public.portfolio_constraints (user_id);

create trigger portfolio_constraints_set_updated_at
  before update on public.portfolio_constraints
  for each row execute function public.set_updated_at();

-- ── Privilegios y RLS ──────────────────────────────────────────────────────
-- Mismo patrón que el resto del esquema: políticas `*_own` por `user_id`,
-- separadas por operación y limitadas al rol `authenticated`.
--
-- Los GRANT no son un detalle administrativo: una política RLS no concede
-- nada, solo restringe lo ya concedido. Sin privilegio de tabla, Postgres
-- deniega antes de evaluar ninguna política; y al revés, un GRANT olvidado a
-- `anon` dejaría la tabla expuesta a cualquiera con la clave pública.

revoke all on public.investment_policies from anon;
revoke all on public.investment_goals from anon;
revoke all on public.portfolio_constraints from anon;

grant select, insert, update, delete on
  public.investment_policies,
  public.investment_goals,
  public.portfolio_constraints
to authenticated;

alter table public.investment_policies enable row level security;
alter table public.investment_goals enable row level security;
alter table public.portfolio_constraints enable row level security;

create policy "investment_policies_select_own" on public.investment_policies
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "investment_policies_insert_own" on public.investment_policies
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "investment_policies_update_own" on public.investment_policies
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "investment_policies_delete_own" on public.investment_policies
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "investment_goals_select_own" on public.investment_goals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "investment_goals_insert_own" on public.investment_goals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "investment_goals_update_own" on public.investment_goals
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "investment_goals_delete_own" on public.investment_goals
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "portfolio_constraints_select_own" on public.portfolio_constraints
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "portfolio_constraints_insert_own" on public.portfolio_constraints
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "portfolio_constraints_update_own" on public.portfolio_constraints
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "portfolio_constraints_delete_own" on public.portfolio_constraints
  for delete to authenticated using ((select auth.uid()) = user_id);

comment on table public.investment_policies is
  'Política de inversión versionada (ADR-002). Una sola activa por usuario.';
comment on constraint investment_policies_effective_risk_needs_capacity
  on public.investment_policies is
  'ADR-002: sin capacidad medida no hay riesgo efectivo; la capacidad nunca se deduce de la tolerancia.';
comment on constraint investment_goals_policy_same_owner on public.investment_goals is
  'Impide colgar un objetivo de la política de otro usuario: la RLS filtra filas, no referencias.';
