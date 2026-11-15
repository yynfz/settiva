begin;
create function public.check_settlement_chronology() returns trigger
language plpgsql set search_path='' as $$
declare issued_at timestamptz;
begin
 select created_at into strict issued_at from public.invoices where id=new.invoice_id;
 if new.block_timestamp < issued_at then raise exception 'Payment predates invoice'; end if;
 if new.refund_hash is not null and (new.refund_hash=new.transaction_hash or new.refund_timestamp < new.block_timestamp) then raise exception 'Refund predates or reuses payment'; end if;
 return new;
end;
$$;
create trigger check_settlement_chronology before insert or update on public.verified_payments for each row execute function public.check_settlement_chronology();
commit;
