begin;
create table public.verified_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  network text not null check (network = 'testnet'),
  transaction_hash text not null,
  sender_account text not null,
  block_hash text not null,
  block_timestamp timestamptz not null,
  applied boolean not null,
  verified_at timestamptz not null default now(),
  unique (network, transaction_hash)
);
create unique index one_applied_payment on public.verified_payments(invoice_id) where applied;
alter table public.verified_payments enable row level security;
revoke all on public.verified_payments from anon, authenticated;
grant select on public.verified_payments to authenticated;
grant all on public.verified_payments to service_role;
create policy own_verified_payments on public.verified_payments for select to authenticated using (
  exists(select 1 from public.invoices where id = invoice_id and merchant_id = (select auth.uid()))
);

-- Serialize settlement per invoice. A distinct additional transfer is retained;
-- it never replaces the original applied payment or receipt (ADR-0002).
create function public.record_verified_payment(p_invoice uuid, p_hash text, p_sender text, p_block text, p_timestamp timestamptz)
returns public.verified_payments language plpgsql security definer set search_path = '' as $$
declare inv public.invoices; payment public.verified_payments; first_payment boolean;
begin
  select * into strict inv from public.invoices where id = p_invoice for update;
  if inv.network <> 'testnet' then raise exception 'Mainnet unavailable'; end if;
  select * into payment from public.verified_payments where network = inv.network and transaction_hash = p_hash;
  if found then
    if payment.invoice_id <> inv.id or payment.sender_account <> p_sender then raise exception 'Transfer already associated'; end if;
    return payment;
  end if;
  first_payment := not exists(select 1 from public.verified_payments where invoice_id = inv.id and applied);
  insert into public.verified_payments(invoice_id,network,transaction_hash,sender_account,block_hash,block_timestamp,applied)
    values(inv.id,inv.network,p_hash,p_sender,p_block,p_timestamp,first_payment) returning * into payment;
  if first_payment then
    update public.invoices set status = 'paid', paid_at = payment.verified_at where id = inv.id;
  end if;
  return payment;
end;
$$;
revoke all on function public.record_verified_payment(uuid,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.record_verified_payment(uuid,text,text,text,timestamptz) to service_role;

-- Issued payment terms cannot change; reading an invoice cannot undo settlement.
create function public.protect_invoice_terms() returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - array['status','viewed_at','paid_at']) is distinct from (to_jsonb(old) - array['status','viewed_at','paid_at']) then
    raise exception 'Issued invoice terms are immutable';
  end if;
  if old.status = 'paid' and new.status <> 'paid' then raise exception 'Paid status is permanent'; end if;
  return new;
end;
$$;
create trigger protect_invoice_terms before update on public.invoices for each row execute function public.protect_invoice_terms();
commit;
