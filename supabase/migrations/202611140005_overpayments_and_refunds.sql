begin;

-- Enhance verified_payments with overpayment resolution and refund evidence (ADR-0002).
alter table public.verified_payments
  add column if not exists refund_status text null check (refund_status in ('refund_needed', 'refunded')),
  add column if not exists refund_hash text null,
  add column if not exists refund_timestamp timestamptz null,
  add column if not exists refund_block_hash text null;

-- Ensure refund hashes are unique across the network
create unique index if not exists verified_payments_refund_hash
  on public.verified_payments(network, refund_hash)
  where refund_hash is not null;

-- Update record_verified_payment to set refund_needed for overpayments
create or replace function public.record_verified_payment(p_invoice uuid, p_hash text, p_sender text, p_block text, p_timestamp timestamptz)
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
  insert into public.verified_payments(
    invoice_id, network, transaction_hash, sender_account, block_hash, block_timestamp, applied, refund_status
  ) values (
    inv.id, inv.network, p_hash, p_sender, p_block, p_timestamp, first_payment,
    case when first_payment then null else 'refund_needed' end
  ) returning * into payment;
  if first_payment then
    update public.invoices set status = 'paid', paid_at = payment.verified_at where id = inv.id;
  end if;
  return payment;
end;
$$;

-- Function for atomically recording a verified refund
create or replace function public.record_verified_refund(
  p_payment_id uuid,
  p_refund_hash text,
  p_refund_block text,
  p_refund_timestamp timestamptz
)
returns public.verified_payments language plpgsql security definer set search_path = '' as $$
declare payment public.verified_payments;
begin
  select * into payment from public.verified_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if payment.applied then raise exception 'Cannot refund applied invoice payment'; end if;
  if payment.refund_status = 'refunded' then
    if payment.refund_hash <> p_refund_hash then
      raise exception 'Payment already refunded with different transaction';
    end if;
    return payment;
  end if;
  update public.verified_payments
    set refund_status = 'refunded',
        refund_hash = p_refund_hash,
        refund_block_hash = p_refund_block,
        refund_timestamp = p_refund_timestamp
    where id = payment.id
    returning * into payment;
  return payment;
end;
$$;

revoke all on function public.record_verified_refund(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_verified_refund(uuid, text, text, timestamptz) to service_role;

-- Grant supabase_auth_admin permissions conditionally so hosted invites succeed
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.require_merchant_invitation() to supabase_auth_admin;
    grant execute on function public.record_merchant_invitation() to supabase_auth_admin;
    grant all on public.merchant_access to supabase_auth_admin;
  end if;
end $$;

commit;
