begin;
create table public.verification_limits (
 invoice_id uuid primary key references public.invoices(id) on delete cascade,
 window_start timestamptz not null,
 requests integer not null
);
alter table public.verification_limits enable row level security;
revoke all on public.verification_limits from public,anon,authenticated;
create function public.reserve_verification(p_invoice uuid,p_hash text,p_sender text) returns boolean
language plpgsql security definer set search_path='' as $$
declare count_requests integer; distinct_attempts integer;
begin
 perform 1 from public.invoices where id=p_invoice for update;
 if not found then return false; end if;
 insert into public.verification_limits values(p_invoice,clock_timestamp(),1)
 on conflict(invoice_id) do update set
 requests=case when verification_limits.window_start < clock_timestamp()-interval '1 minute' then 1 else verification_limits.requests+1 end,
 window_start=case when verification_limits.window_start < clock_timestamp()-interval '1 minute' then clock_timestamp() else verification_limits.window_start end
 returning requests into count_requests;
 if count_requests>120 then return false; end if;
 if exists(select 1 from public.payment_attempts where invoice_id=p_invoice and transaction_hash=p_hash) then return true; end if;
 select count(*) into distinct_attempts from public.payment_attempts where invoice_id=p_invoice and created_at>=clock_timestamp()-interval '10 minutes';
 if distinct_attempts>=10 then return false; end if;
 insert into public.payment_attempts(invoice_id,transaction_hash,sender_account,outcome) values(p_invoice,p_hash,p_sender,'pending');
 return true;
end;
$$;
revoke all on function public.reserve_verification(uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_verification(uuid,text,text) to service_role;
commit;
