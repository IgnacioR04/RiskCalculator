-- Add direct indexes for foreign keys flagged by Supabase performance advisors.
-- These are additive and do not rewrite table data.

create index if not exists broker_accounts_broker_id_idx
  on public.broker_accounts (broker_id)
  where broker_id is not null;

create index if not exists transactions_account_id_idx
  on public.transactions (account_id);

create index if not exists transactions_asset_id_only_idx
  on public.transactions (asset_id);
