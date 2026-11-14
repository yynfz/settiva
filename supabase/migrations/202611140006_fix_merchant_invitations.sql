begin;
-- Supabase admin.createUser adds app_metadata AFTER inserting auth.users,
-- within the same transaction. Check the final row at commit time.
drop trigger if exists require_merchant_invitation on auth.users;
drop trigger if exists record_merchant_invitation on auth.users;
drop policy if exists insert_merchant_access on public.merchant_access;
create or replace function public.require_merchant_invitation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare invited boolean;
begin
  select invited_at is not null or coalesce(raw_app_meta_data ->> 'settiva_invited', 'false') = 'true'
    into invited from auth.users where id = new.id;
  if not found then return null; end if;
  if not invited then raise exception 'Settiva requires a merchant invitation'; end if;
  insert into public.merchant_access(user_id) values(new.id) on conflict do nothing;
  return null;
end;
$$;
create constraint trigger require_merchant_invitation
  after insert on auth.users deferrable initially deferred
  for each row execute function public.require_merchant_invitation();
revoke all on function public.require_merchant_invitation() from public, anon, authenticated;
commit;
