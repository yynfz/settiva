# Settiva

Itemized invoices, direct NEAR payments, and independently verified payment and refund evidence.

Settiva lets an invited merchant configure a receiving account, issue an invoice, export a PDF, and share a Customer Portal link. The payer approves a direct token transfer in their wallet. Settiva verifies finalized onchain execution before issuing a receipt. Distinct duplicate payments are retained as overpayments; the merchant approves a separate full return transfer, which Settiva verifies. Payers can look up one known transfer without seeing the complete payment history.

## Start here

- [Demo walkthrough](docs/DEMO.md): the complete merchant → payer → refund journey.
- [Merchant invitation guide](docs/MERCHANT_INVITATIONS.md): hosted setup and the invitation-trigger repair.
- [Genuine testnet evidence](docs/TESTNET_EVIDENCE.md): actual evidence status; fixture tests are separate.
- [Domain vocabulary](GLOSSARY.md) and [decisions](docs/adr/).

## Fresh checkout: automated evaluation

Use Node 22.18+ and npm on macOS or Linux as an ordinary non-root user. The tests need loopback networking; they never require hosted Supabase credentials or real wallets.

```bash
git clone https://github.com/yynfz/settiva.git
cd settiva
npm ci
npm run test:setup
npx playwright install chromium
# Linux CI machines may need: npx playwright install --with-deps chromium
npm run typecheck
npm test
npm run test:browser
npm run format:check
npm run build
```

`test:setup` downloads a pinned official PostgREST binary and verifies its published SHA-256 digest. The harness creates disposable native PostgreSQL, applies every migration, and runs real PostgREST/RLS. It builds and starts the production Next.js app for each configuration. Supabase Auth responses, NEAR RPC, and wallet approval are controlled external fixtures. `npm test` includes all HTTP and browser cases, the fallback-token configuration, and a separately simulated enabled mainnet policy. `test:browser` runs every browser journey, including one complete invoice-to-refund flow. These are application tests, not evidence that real blockchain funds moved.

On macOS, an existing Google Chrome installation is used when available. Otherwise install Chromium, or point `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at a Chromium executable. Test logs, screenshots, PDFs, downloaded binaries, and generated Next.js types stay ignored. Run individual tests with `npm test -- tests/lookup.http.test.ts` during development. Avoid concurrent test runs in the same checkout because the production builds share the same `.next` output.

## Run against your Supabase project

```bash
cp .env.example .env.local
# Fill in the Supabase project URL, publishable key, and server secret locally.
npm run merchant:invite -- merchant@example.com
npm run dev
```

Before inviting a merchant, apply **all SQL files in `supabase/migrations` in filename order** to your development Supabase project using its SQL Editor or your migration tooling. Migrations are versioned changes; do not rerun the whole set over an already migrated database. In Auth settings, disable **Allow new users to sign up**, and keep email/password sign-in enabled. The database also enforces invitations at transaction completion. Existing Auth users are not granted access automatically. See the [invitation guide](docs/MERCHANT_INVITATIONS.md) for provisioning and repair.

The application works at `http://localhost:3000`; `/demo` contains the public walkthrough. Keep your server secret in `SUPABASE_SECRET_KEY`, never in `NEXT_PUBLIC_*`. The browser receives only the public project URL and publishable key. Merchant documents are downloaded with an Authorization header; session credentials are not accepted in URL query parameters.

## Network and asset configuration

Circle testnet USDC is the default. `npm run near:check -- your-account.testnet` reads the current chain, token metadata, storage bounds, account, and token balance. It signs and broadcasts nothing. A registered account with zero token balance can still receive funds. Format/storage checks are point-in-time observations, not cryptographic ownership proof. See [preflight findings](docs/TESTNET_PREFLIGHT.md).

Time-box investigation of Circle testnet funding to one hour. If a usable path is unavailable, explicitly select `NEAR_TESTNET_ASSET=test-token` and configure its contract, name, symbol, and decimals. The server checks exact metadata and labels it **Test token — no monetary value**. Fixture address `demo-token.testnet` is not a claim of a deployed or funded token. Never invent live evidence from test fixtures.

Token storage registration requires a separate wallet-approved `storage_deposit` and NEAR deposit; gas also costs NEAR. The payer's token transfer attaches 1 yoctoNEAR. Settiva never holds keys or funds and never signs automatically.

`ENABLE_MAINNET_PAYMENTS=false` is the default. Any live activation requires explicit human authorization before changing this server-only flag. New mainnet invoices remain blocked in this release. Previously issued mainnet invoices, PDFs, lookup, and genuine settlement verification remain available while checkout is disabled. Mainnet accepts only the allowlisted Circle native USDC contract with six decimals; fallback test tokens and bridged USDC.e are rejected. UI and PDFs show `TESTNET DEMO`, `MAINNET LIMITED DEMO`, or `DISABLED` from server policy.

## Deployment

`npm run build` and `npm start` run production Next.js. Supply server environment values at runtime and the public values when building. The included Dockerfile and Compose configuration support the repository's existing Traefik/Docker Hub deployment; their domains, network names, and image names must be adapted for another host. Build contexts exclude `.env*` files and test caches. Applying hosted migrations and provisioning accounts are separate operator steps; the application does not migrate the hosted database automatically.

The existing publish workflow deploys on its configured triggers. Pushing or publishing a release may therefore deploy; obtain the operator's approval first. This task does not authorize deployment, mainnet activation, hackathon submission, or posting publicly.

## Review boundaries and attribution

This is a testnet hackathon demonstration under development, not a production-readiness certification. Genuine payment/duplicate/refund evidence is pending until the [evidence report](docs/TESTNET_EVIDENCE.md) contains verified real hashes. No automated test output should be presented as that evidence. Known operational limits include shared invoice-level lookup throttling, manual merchant refund authorization, and a required hosted Auth smoke after migrations.

Built with Next.js, React, Tailwind CSS, Supabase, NEAR Connect, Zod, PostgreSQL/PostgREST, Vitest, and Playwright. Itemization, company settings, customer portal reading state, and PDF document flows are inspired by InvoiceShelf. The implementation is local TypeScript/SQL; it does not embed the InvoiceShelf application. AI coding assistance was used. Git history identifies the implementation window and subsequent changes; the original repository baseline is commit `23605c4`.

License selection is pending the project owner's choice; see `LICENSE` for the current rights status. Dependency licenses remain their respective owners'.

References: [Supabase Auth](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [NEAR Connect](https://docs.near.org/web3-apps/tutorials/wallet-login), [NEAR transaction finality](https://docs.near.org/api/rpc/transactions), [token/storage standards](https://docs.near.org/primitives/ft/standard), [Circle contracts](https://developers.circle.com/stablecoins/usdc-contract-addresses), [Circle faucet](https://faucet.circle.com/).
