begin;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(user_id) on delete cascade,
  invoice_number text not null,
  access_token text not null unique,
  payment_reference text not null unique,
  network text not null check (network in ('testnet', 'mainnet')),
  token_contract_id text not null,
  asset_symbol text not null,
  token_decimals integer not null check (token_decimals between 0 and 24),
  asset_kind text not null check (asset_kind in ('circle-usdc', 'test-token')),
  receiving_account text not null check (char_length(receiving_account) between 2 and 64),
  amount_atomic text not null,
  amount_display text not null,
  status text not null check (status in ('unpaid', 'viewed', 'paid')) default 'unpaid',
  due_date date,
  client_label text not null check (char_length(client_label) between 1 and 100),
  description text,
  created_at timestamptz not null default now(),
  viewed_at timestamptz,
  paid_at timestamptz
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null check (char_length(description) between 1 and 200),
  quantity numeric not null check (quantity > 0),
  unit_price text not null,
  total text not null,
  sort_order integer not null default 0
);

create index invoices_merchant_id_idx on public.invoices(merchant_id);
create index invoices_access_token_idx on public.invoices(access_token);
create index invoices_payment_reference_idx on public.invoices(payment_reference);
create index invoice_items_invoice_id_idx on public.invoice_items(invoice_id);

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

revoke all on public.invoices, public.invoice_items from anon, authenticated;
grant select on public.invoices, public.invoice_items to authenticated;
grant all on public.invoices, public.invoice_items to service_role;

-- Merchants can only read their own invoices
create policy own_invoices on public.invoices for select to authenticated
  using (merchant_id = (select auth.uid()));

-- Merchants can only read items of their own invoices
create policy own_invoice_items on public.invoice_items for select to authenticated
  using (exists (
    select 1 from public.invoices
    where id = invoice_items.invoice_id and merchant_id = (select auth.uid())
  ));

commit;
