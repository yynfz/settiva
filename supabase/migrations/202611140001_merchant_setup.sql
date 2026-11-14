begin;

create table public.merchant_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  invited_at timestamptz not null default now()
);
create table public.merchant_profiles (
  user_id uuid primary key references public.merchant_access(user_id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  testnet_wallet_id text not null check (char_length(testnet_wallet_id) between 2 and 64),
  token_contract_id text not null,
  asset_symbol text not null,
  token_decimals integer not null check (token_decimals between 0 and 24),
  asset_kind text not null check (asset_kind in ('circle-usdc', 'test-token')),
  control_confirmed_at timestamptz not null,
  checked_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.merchant_access enable row level security;
alter table public.merchant_profiles enable row level security;
revoke all on public.merchant_access, public.merchant_profiles from anon, authenticated;
grant select on public.merchant_access, public.merchant_profiles to authenticated;
grant all on public.merchant_access, public.merchant_profiles to service_role;
create policy own_invitation on public.merchant_access for select to authenticated
  using (user_id = (select auth.uid()));
create policy own_profile on public.merchant_profiles for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.merchant_access where user_id = (select auth.uid())
  ));

-- Auth-level guard: a caller cannot bypass the app and register via the public Auth API.
-- Only the trusted admin API can set app metadata or invited_at.
create function public.require_merchant_invitation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.invited_at is null and coalesce(new.raw_app_meta_data ->> 'settiva_invited', 'false') <> 'true' then
    raise exception 'Settiva requires a merchant invitation';
  end if;
  return new;
end;
$$;
create trigger require_merchant_invitation before insert on auth.users
  for each row execute function public.require_merchant_invitation();

create function public.record_merchant_invitation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.merchant_access (user_id) values (new.id);
  return new;
end;
$$;
create trigger record_merchant_invitation after insert on auth.users
  for each row execute function public.record_merchant_invitation();
revoke all on function public.require_merchant_invitation(), public.record_merchant_invitation() from public, anon, authenticated;
commit;
