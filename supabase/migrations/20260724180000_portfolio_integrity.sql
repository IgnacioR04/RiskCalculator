-- Analítica y sincronización completa del portfolio.

alter table public.broker_accounts
  add column if not exists fee_policy jsonb;

alter table public.assets
  add column if not exists holdings jsonb not null default '[]'::jsonb;

alter table public.transactions
  add column if not exists cost_known boolean not null default true;

alter table public.transactions
  drop constraint if exists transactions_source_type_check;
alter table public.transactions
  add constraint transactions_source_type_check check (
    source_type in (
      'exact',
      'historical_estimate',
      'return_estimate',
      'json_import',
      'position_snapshot'
    )
  );

-- Evita que una transacción pueda relacionar, por error o manipulación, una
-- cuenta o un activo que pertenezcan a otro usuario.
create or replace function public.validate_transaction_ownership()
returns trigger
language plpgsql
security definer
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

drop trigger if exists transactions_validate_ownership on public.transactions;
create trigger transactions_validate_ownership
  before insert or update of user_id, account_id, asset_id
  on public.transactions
  for each row execute function public.validate_transaction_ownership();
