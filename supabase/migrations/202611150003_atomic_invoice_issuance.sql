begin;
create table public.invoice_counters (
 merchant_id uuid not null references public.merchant_profiles(user_id) on delete cascade,
 year integer not null,
 last_number bigint not null check(last_number > 0),
 primary key(merchant_id,year)
);
alter table public.invoice_counters enable row level security;
revoke all on public.invoice_counters from public,anon,authenticated;
create unique index invoice_number_per_merchant on public.invoices(merchant_id,invoice_number);

create function public.issue_invoice(p_merchant uuid,p_terms jsonb,p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare merchant public.merchant_profiles; inv public.invoices; seq bigint; yr integer; item_rows jsonb;
begin
 select * into strict merchant from public.merchant_profiles where user_id=p_merchant for update;
 if p_terms->>'network' <> 'testnet' then raise exception 'Mainnet issuance unavailable'; end if;
 if merchant.testnet_wallet_id <> p_terms->>'receiving_account' or merchant.token_contract_id <> p_terms->>'token_contract_id'
   or merchant.token_decimals <> (p_terms->>'token_decimals')::integer or merchant.asset_kind <> p_terms->>'asset_kind'
   or merchant.asset_symbol <> p_terms->>'asset_symbol' then raise exception 'Merchant configuration changed; check and retry'; end if;
 if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Invalid invoice items'; end if;
 yr:=extract(year from clock_timestamp() at time zone 'UTC')::integer;
 insert into public.invoice_counters(merchant_id,year,last_number)
 values(p_merchant,yr,coalesce((select max(substring(invoice_number from '([0-9]+)$')::bigint) from public.invoices where merchant_id=p_merchant and invoice_number ~ ('^INV-'||yr||'-[0-9]+$')),0)+1)
 on conflict(merchant_id,year) do update set last_number=invoice_counters.last_number+1 returning last_number into seq;
 insert into public.invoices(merchant_id,invoice_number,access_token,payment_reference,network,token_contract_id,asset_symbol,token_decimals,asset_kind,receiving_account,amount_atomic,amount_display,status,due_date,client_label,description)
 values(p_merchant,'INV-'||yr||'-'||case when seq<10000 then lpad(seq::text,4,'0') else seq::text end,p_terms->>'access_token',p_terms->>'payment_reference','testnet',merchant.token_contract_id,merchant.asset_symbol,merchant.token_decimals,merchant.asset_kind,merchant.testnet_wallet_id,p_terms->>'amount_atomic',p_terms->>'amount_display','unpaid',(p_terms->>'due_date')::date,p_terms->>'client_label',p_terms->>'description') returning * into inv;
 insert into public.invoice_items(invoice_id,description,quantity,unit_price,total,sort_order)
 select inv.id,description,quantity,unit_price,total,sort_order from jsonb_to_recordset(p_items) as x(description text,quantity numeric,unit_price text,total text,sort_order integer);
 select jsonb_agg(to_jsonb(i) order by sort_order) into item_rows from public.invoice_items i where invoice_id=inv.id;
 return to_jsonb(inv)||jsonb_build_object('items',item_rows);
end;
$$;
revoke all on function public.issue_invoice(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.issue_invoice(uuid,jsonb,jsonb) to service_role;

-- Prevent modifications to issued public line items through privileged mistakes too.
create function public.protect_invoice_items() returns trigger language plpgsql as $$
begin
 if tg_op='UPDATE' then raise exception 'Issued invoice items are immutable'; end if;
 return old;
end;
$$;
create trigger protect_invoice_items before update on public.invoice_items for each row execute function public.protect_invoice_items();
commit;
