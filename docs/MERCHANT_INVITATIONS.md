# Merchant invitations

Only an operator with the Supabase server secret can provision merchant access. Public registration is disabled. Payers do not need merchant accounts.

1. Apply all pending migrations to the intended Supabase project in filename order. Back up a shared database first and review the SQL. Keep `.env.local` pointed at that same project.
2. Disable public signup in Supabase Auth settings. Keep email/password sign-in enabled.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` in `.env.local`.
4. Run `npm run merchant:invite -- merchant@example.com`. Confirm the project hostname and exact email, then enter a temporary password of at least 12 characters. Input is hidden.
5. Deliver the credentials through your existing private channel. The script creates an email-confirmed account and sends no invitation email. Sign in through Settiva and configure the receiving account.

For an existing Auth user, verify the user's identity and UUID through your operator process, then grant access via privileged SQL:

```sql
insert into public.merchant_access(user_id)
values ('REPLACE_WITH_VERIFIED_AUTH_USER_UUID')
on conflict (user_id) do nothing;
```

Do not give clients write access to `merchant_access` or trust editable user metadata as invitation evidence.

## Repairing `Database error creating new user`

Apply `supabase/migrations/202611140006_fix_merchant_invitations.sql` in the hosted SQL Editor, then retry the command. The original guard ran before Supabase assigned the administrator-provided application metadata. Supabase inserts the user first and updates that metadata later in the same transaction. The repair validates the final row at transaction completion and grants merchant access only for trusted invitation metadata or an Auth invitation. Confirmed email alone is not sufficient.

Do not rerun the initial table-creation migration over an existing schema. If the error persists after the repair, inspect the matching Supabase Auth/database log entry. The script reports the returned error code/message and does not print credentials. For an already registered email, use the existing-user procedure rather than trying to create the same identity again. Verify the user's existence before retrying an ambiguous network failure.

Local tests reproduce the insert-then-metadata sequence against isolated PostgreSQL and assert that public signup remains rejected. They do not independently prove that your hosted project has received the migration or that its Auth configuration is correct.
