begin;
create table public.lookup_limits (
 invoice_id uuid primary key references public.invoices(id) on delete cascade,
 window_start timestamptz not null,
 requests integer not null
);
alter table public.lookup_limits enable row level security;
revoke all on public.lookup_limits from public, anon, authenticated;
create function public.consume_lookup(p_invoice uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
 insert into public.lookup_limits values(p_invoice, clock_timestamp(), 1)
 on conflict(invoice_id) do update set
 requests = case when lookup_limits.window_start < clock_timestamp() - interval '1 minute' then 1 else lookup_limits.requests + 1 end,
 window_start = case when lookup_limits.window_start < clock_timestamp() - interval '1 minute' then clock_timestamp() else lookup_limits.window_start end
 returning requests <= 30 into allowed;
 return allowed;
end;
$$;
revoke all on function public.consume_lookup(uuid) from public, anon, authenticated;
grant execute on function public.consume_lookup(uuid) to service_role;
commit;
