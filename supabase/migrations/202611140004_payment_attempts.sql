begin;

-- Payment attempts persist submitted hash evidence independent of invoice status.
-- An unsuccessful attempt never downgrades a paid invoice.
create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  transaction_hash text not null,
  sender_account text not null,
  -- outcome: pending | verified | failed | mismatch | rpc_unavailable
  outcome text not null default 'pending' check (outcome in ('pending','verified','failed','mismatch','rpc_unavailable')),
  error_code text null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  unique (invoice_id, transaction_hash)
);
alter table public.payment_attempts enable row level security;
revoke all on public.payment_attempts from anon, authenticated;
grant select on public.payment_attempts to authenticated;
grant all on public.payment_attempts to service_role;
create policy own_payment_attempts on public.payment_attempts for select to authenticated using (
  exists(select 1 from public.invoices where id = invoice_id and merchant_id = (select auth.uid()))
);

commit;
