# Settiva

Invoice globally. Settle with USDC.

This first application slice implements invited-merchant sign-in and NEAR testnet receiving-account setup (GitHub issue #2). Invoice issuance, payment checkout, settlement receipts, and refunds are separate tickets and are not implemented yet.

## Run locally

Use Node 22.18+ and npm. Install with `npm ci`, copy the environment example to a local environment file, and supply your Supabase project URL, publishable key, and server secret. Never commit the local file or put the server secret in a public environment variable.

Apply the SQL migration in `supabase/migrations` to your development Supabase project through its SQL editor or your normal migration tooling. It creates merchant access/profile tables, read-only user RLS policies, and an Auth signup guard. Review it before applying it to a shared project: this app intentionally rejects public signups. Existing users are not automatically granted merchant access.

In Supabase Auth settings, also disable **Allow new users to sign up**. The database guard provides defense in depth even if that switch is accidentally enabled. Keep email/password sign-in enabled. The application has no public registration flow.

Provision a merchant with `npm run merchant:invite -- merchant@example.com`. This operator-only command confirms the target email, reads a hidden temporary password, and uses the admin API to create a confirmed, explicitly invited account. The database trigger grants merchant access. It sends no email; deliver credentials through your existing private channel. For existing Auth users, an operator may grant access by inserting their verified user ID into `merchant_access` through privileged SQL. Do not give clients write access to this table.

Run `npm run dev`, open the local URL, sign in, and enter a display name and receiving account. Confirm control of that exact account, then choose **Check and save account**. The server verifies the RPC chain, account existence, allowlisted token metadata, token balance response, and token-storage registration before saving. A zero token balance does not prevent an already registered account from receiving funds.

Profiles are writable only by the server after validation. Authenticated clients can read only their own profile and invitation. Changing a receiving account requires fresh confirmation and checks. A successful setup check is a point-in-time observation, not proof of wallet ownership or a guarantee of future storage registration; invoice issuance must check again.

## Token configuration and live checks

Circle testnet USDC is the default allowlisted asset. Run `npm run near:check` to read token metadata and storage bounds, or `npm run near:check -- your-account.testnet` to include that account's token storage and balance. This command does not fund accounts, sign, or broadcast.

The read-only investigation is recorded in `docs/TESTNET_PREFLIGHT.md`. Circle's public faucet lists NEAR Testnet, but receipt of faucet tokens must be verified for the actual supplied accounts. Time-box funding investigation to one hour. If no usable funded path is established, an operator can explicitly choose `NEAR_TESTNET_ASSET=test-token` and provide the fallback contract, expected name, symbol, and decimals in the environment settings. All four are required. The app checks them against live metadata and labels the asset **Test token — no monetary value**. It does not invent or deploy a fallback contract, and never accepts one from the client.

An unregistered receiving account gets contract-specific `storage_deposit` guidance, including arguments and the minimum yoctoNEAR deposit. The merchant reviews and signs that separate transaction in their own wallet. Settiva does not execute it. No account funding or transaction signing has been performed by this implementation.

Mainnet setup is unavailable in this slice, even if someone changes the mainnet environment flag. The later mainnet-controls ticket will add the full gated behavior. Never enable live payments or claim mainnet settlement from a testnet demonstration.

## Tests and checks

- `npm run test:setup` downloads a pinned official PostgREST release into the ignored test cache and checks its published SHA-256 digest.
- `npm test` runs the HTTP/RLS and browser cases, then the separate explicit-fallback configuration.
- `npm test -- tests/merchant.http.test.ts` runs just the HTTP/RLS file during development.
- `npm run test:browser` runs the merchant browser smoke.
- `npm run test:fallback` tests the custom test-token configuration.
- `npm run typecheck`, `npm run format:check`, and `npm run build` validate types, formatting, and the production build.

The harness runs disposable native PostgreSQL and real PostgREST on loopback with unique ports, applies the real migration, and exercises actual database grants and RLS. No Docker or hosted credentials are needed. Supabase Auth responses and NEAR RPC are controlled external fixtures; the suite is not an end-to-end test of hosted Supabase Auth or real blockchain settlement. Tests assert through the application HTTP interface and the exposed PostgREST interface, not internal implementation functions. The signup test inserts through the fixture Auth service to exercise the real database signup guard. A real invited account must still be smoke-tested after applying the migration to a hosted project.

Browser smoke uses installed Google Chrome on macOS if present. Otherwise install Chromium with `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing Chromium executable. CI uses Playwright's Chromium. Browser evidence and process logs remain in the ignored test cache. The native database harness supports macOS/Linux and requires an ordinary non-root user. Test servers may require sandbox permission to bind loopback sockets.

## Reference documentation

- [Supabase password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
- [Supabase Auth configuration](https://supabase.com/docs/guides/auth/general-configuration)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [Circle testnet faucet](https://faucet.circle.com/)
- [NEAR token and storage standards](https://docs.near.org/primitives/ft/standard)
- [NEAR read-only RPC queries](https://docs.near.org/api/rpc/contracts)

The project is non-custodial software under development. This testnet setup does not establish production readiness or authorization for commercial payment services. The PRD records the project's commercial and jurisdiction-review limits.
