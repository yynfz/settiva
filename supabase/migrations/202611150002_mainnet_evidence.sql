begin;
alter table public.verified_payments drop constraint verified_payments_network_check;
alter table public.verified_payments add constraint verified_payments_network_check check (network in ('testnet','mainnet'));
create or replace function public.record_verified_payment(p_invoice uuid, p_hash text, p_sender text, p_block text, p_timestamp timestamptz)
returns public.verified_payments language plpgsql security definer set search_path = '' as $$
declare inv public.invoices; payment public.verified_payments; first_payment boolean;
begin
  select * into strict inv from public.invoices where id = p_invoice for update;
  if inv.network = 'mainnet' and (inv.asset_kind <> 'circle-usdc' or inv.token_contract_id <> '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1' or inv.token_decimals <> 6) then raise exception 'Unsupported mainnet asset'; end if;
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


commit;
