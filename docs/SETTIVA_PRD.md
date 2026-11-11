# Settiva — Native USDC Invoicing MVP PRD (v2.1)

**Product brand:** Settiva (selected by the project lead on 11 November 2026). **Tagline:** *Invoice globally. Settle with USDC.* This is the project name used throughout the MVP, README, dashboard, demo and hackathon submission. It is not an assertion of trademark or domain availability; clear those before public commercial launch.

| Property | Decision |
|---|---|
| Event | NEAR HACKATHON 2026 |
| Primary track | `realworld` — Real-World Money |
| Revised | 11 November 2026 |
| Product | **Settiva** — non-custodial USD invoices paid in native Circle USDC on NEAR |
| Marketing position | An invoicing software product, **not** a custodial payment service |
| Networks | Testnet development; **opt-in, controlled mainnet USDC demonstration** |
| Current status | **Specification only** — no mainnet deployment or real payment has been executed by this document |

## 1. Product thesis and customer

**Customer-facing description:** Settiva lets a merchant create a USD invoice and share a payment link, while a customer pays native USDC on NEAR directly into the merchant's NEAR account. The invoice only becomes Paid after the app independently verifies final onchain settlement. The demo must be labeled testnet or mainnet accurately.

**Create an invoice → share a link → payer pays native USDC from their NEAR wallet → server verifies settlement → merchant receives an onchain-backed receipt.**

Initial customer: freelancers, online agencies, independent contractors, and internationally operating crypto-native service businesses in jurisdictions where stablecoin acceptance is permitted. Their immediate need is to price an invoice in USD and receive a matching USDC transfer directly, without custodial escrow or manual blockchain-explorer reconciliation.

**Non-custodial scope:** the application does not generate, receive, store, or operate private keys and never holds customer funds. The payer authorizes the transfer in a separate wallet; the merchant's designated NEAR account receives USDC directly. The app is invoicing, payment-request, and verification software; it is **not** a licensed payment processor, wallet, exchange, fiat ramp, stablecoin issuer, or automatic bank payout service.

**Commercial limitation:** an operable mainnet demo does **not** establish suitability or authorization for public commercial use. Before offering real payments to customers, obtain target-jurisdiction legal review (payment services, financial services, AML/sanctions, tax, privacy, consumer obligations). **Indonesia generally prohibits cryptoassets, including stablecoins, as payment instruments for domestic transactions. Do not market or enable domestic Indonesian USDC merchant payments without advice resolving that restriction.** This restriction is not removed by a non-custodial architecture.

## 2. Exact asset and network definitions — fail closed

Circle confirms **native USDC** (NEP-141) exists on NEAR. **It is not the bridged asset USDC.e.**

| Network | Token | Contract account ID | Role |
|---|---|---|---|
| Mainnet | Circle-issued native USDC | `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` | Real-money settlement, gated demonstration |
| Testnet | Circle-listed testnet USDC | `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` | Development **only if funded wallets and transfer work** |
| Mainnet | Bridged USDC.e | `a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near` | **Explicitly rejected**; never silently substitute |

**Source and verification requirement:** cross-check both official Circle pages and live `ft_metadata`, `storage_balance_of`, `ft_balance_of` queries at runtime. Treat token identifiers as an **explicit per-network allowlist**; never accept client-supplied token addresses. Check `ft_metadata.decimals` and expected symbol/name against the configured token before accepting payments. Native USDC is ordinarily 6 decimals, but confirm actual onchain metadata rather than silently assuming it. Reject unexpected contract metadata.

- Circle NEAR page: https://www.circle.com/multi-chain-usdc/near
- Circle native-versus-bridged announcement: https://www.circle.com/blog/usdc-is-now-available-on-near
- NEP-141 and storage requirements: https://docs.near.org/primitives/ft/standard
- NEAR RPC transactions: https://docs.near.org/api/rpc/transactions

**Testnet reality check:** Circle lists a testnet token address; that does **not** mean free testnet USDC is automatically available. Verify its onchain metadata and fund two development accounts. If testnet USDC cannot be obtained promptly, use a **clearly labeled, separately allowlisted testnet NEP-141 test token** to exercise the exact transfer/verifier code; do not label it genuine Circle USDC. A real native Circle USDC payment on mainnet is then the required proof for the mainnet-USDC claim, subject to human authorization and lawful operation. Never simulate a successful payment.

## 3. MVP product experience

1. Merchant signs in (Supabase Auth) and connects or manually sets a **merchant-controlled receiving wallet** for a selected network. App verifies account format and token-storage registration before issuing the invoice.
2. Merchant creates a USD invoice (client label, description, one amount, due date optional). Amount is fixed as a **USDC decimal amount**, e.g., `5.25` USDC, stored in **integer atomic units** (`5250000` for 6 decimals).
3. Invoice is issued with immutable `network`, `token_contract_id`, `recipient_account_id`, `amount_atomic`, and a random one-time `payment_reference`. Public link is copyable.
4. Payer opens public invoice without an app account. UI explicitly displays **NEAR / USDC / network**, receiving wallet and transfer amount. It warns that a payer needs **USDC plus a small NEAR balance for gas**, and that wallet connection is required for the MVP.
5. Payer connects a wallet on the invoice's exact network and explicitly signs **one NEP-141 `ft_transfer` contract call**, with `receiver_id`, `amount` (atomic integer string), and `memo` containing the invoice's opaque one-time reference. Attach **exactly 1 yoctoNEAR** to the call and reasonable gas as supported by the wallet/NEAR SDK. Funds go **directly from the payer's wallet to the merchant**, not to the app.
6. Wallet returns a transaction hash (or redirects and returns later). App verifies asynchronously; if the response is lost, the payer can paste `txHash + senderAccountId`. **Never ask them to pay again automatically** merely because the response timed out.
7. Backend independently queries the correct network RPC with `wait_until: 'FINAL'`, checks successful execution of the whole relevant transaction/receipts, exact token contract, single expected `ft_transfer` action, sender, merchant recipient, exact atomic amount, and exact payment reference. It checks that the hash has not already paid another invoice and the invoice is eligible, then atomically sets `paid`.
8. Public receipt displays amount, token, network, recipient, sender, finalized transaction hash, timestamp and an appropriate network explorer link; merchant can export invoice/payment CSV.

**Identity and reconciliation:** the `memo` includes a high-entropy opaque reference unique to the invoice. It is publicly visible onchain: no names, emails, invoice descriptions, or customer PII in the memo. A transfer with no matching memo **must not be auto-credited**; show `Needs manual review` and do not issue a paid receipt until a separately approved future reconciliation workflow exists. This is intentional to prevent one unrelated transfer from paying another invoice.

**Wallet/storage caveat:** the recipient account must have storage registered with the USDC contract. Check `storage_balance_of` (or contract-specific equivalent) before invoice issuance; guide the merchant through a separate wallet-approved `storage_deposit` where needed, subject to the contract's rules, network charges and user consent. A merchant should never unknowingly publish an unreceivable invoice. Both payer and merchant must use wallet/account configurations compatible with the selected NEAR network.

## 4. Feature priorities and kill switches

### P0 — ship or do not claim completed

- [ ] Network/contract allowlist and verified onchain token metadata, with wrong-network/wrong-token rejection.
- [ ] One merchant can set a receiving wallet and create one immutable USD/USDC invoice; public invoice link works.
- [ ] One **real, successful, finalized** NEP-141 transfer from a wallet using exact merchant recipient, amount and memo; first on testnet if funded, then a **minimal authorized mainnet USDC transfer** if permitted/available.
- [ ] Backend independently verifies transaction, token contract, `ft_transfer` call, `receiver_id`, amount, memo, sender, successful finalized execution, and uniqueness.
- [ ] `Unpaid` → `Pending confirmation` → `Paid` or explicit error, with an onchain receipt and network-correct explorer link.
- [ ] `ENABLE_MAINNET_PAYMENTS=false` by default. Mainnet checkout **requires an explicit human decision**, a separate config activation and a clearly labeled warning about real funds. Backend must enforce the flag, not just hide the button. Read-only validation of pre-existing mainnet tx evidence may remain available when checkout is off.
- [ ] Negative tests: wrong asset, bridged USDC.e, wrong network, recipient, amount, memo, sender mismatch, transaction failure, unfinalized tx, duplicate hash, concurrent verifier requests.
- [ ] Deployable public demo, public repository, LICENSE, `.env.example`, audited setup instructions, working README examples, no credentials committed.

### P1 — only after P0 succeeds

- [ ] Authenticated merchant dashboard and minimal invoice history.
- [ ] CSV export and printable browser receipt.
- [ ] Read-only hosted sample showing **a genuinely verified** mainnet transaction (never fabricated or implied to be live until confirmed).
- [ ] One network selector for merchants, disabled for already-issued invoices.

### P2 — explicitly after hackathon

Multi-chain checkout/NEAR Intents, gas abstraction, payer fiat onramps, stablecoin swaps, subscriptions, PDF generation, email reminders, partial payments, fee monetization, advanced accounting, refunds/disputes, teams/multi-tenancy, automated wallet monitoring, mobile applications, bank payouts, enterprise compliance workflows.

**Hard stop:** do not sacrifice actual successful USDC transfer verification to build dashboards, animations or AI features. Never claim **mainnet enabled**, **production ready**, **gasless**, **fiat-supported**, or **compliant** without proof.

## 5. UI and routes

- `/` — brief commercial value proposition, testnet demo and clearly distinct *mainnet limited preview* state.
- `/dashboard` — own invoices and payment statuses (P1; fall back to basic authenticated list).
- `/dashboard/new` — USD amount/description, merchant receiving account and **network selection**, plus preflight storage registration check.
- `/invoice/[id]` — public, non-editable network/token/amount/destination; payer wallet connect, Pay USDC, recovery-by-hash and risk warnings.
- `/invoice/[id]/receipt` — only when server records verified payment.
- `/api/invoices` — authenticated create/list; server validates merchant ownership and canonical amount.
- `/api/invoices/[id]/pay-config` — public **read-only** immutable invoice payment details; server reports whether mainnet payments are enabled.
- `/api/invoices/[id]/verify` — idempotent, rate-limited server verifier accepting only `{txHash,senderAccountId}` (no `paid` state or token/amount from client).
- `/api/export/invoices.csv` — authenticated own-invoice CSV (P1).

The UI must never imply the user has paid when the wallet request merely succeeded locally or an RPC returned `INCLUDED`/`EXECUTED_OPTIMISTIC`. Display explicit network names; never bury mainnet vs testnet in a tooltip.

## 6. Stack and data model

**Stack:** Next.js (TypeScript), Tailwind CSS, Supabase Auth/Postgres/RLS, `@hot-labs/near-connect` if still compatible with official current wallet docs, `near-api-js` and direct JSON-RPC as appropriate, Vitest, Vercel. Verify actual SDK APIs/versions before coding; no speculative SDK method calls. Default to a single, small deployment without an indexer, bridge, smart contract, or custodial component.

### Table: `merchant_profiles`

- `user_id uuid primary key references auth.users(id)`
- `display_name text`, `testnet_wallet_id text null`, `mainnet_wallet_id text null`, `created_at timestamptz`

### Table: `invoices`

- `id uuid primary key` (public high-entropy UUID)
- `merchant_user_id uuid not null`
- `client_label text null` (do not expose unnecessary PII publicly)
- `description text not null`, `due_at timestamptz null`
- `currency text not null default 'USD'`, `asset_symbol text not null default 'USDC'`
- `network text not null check (network in ('testnet','mainnet'))`
- `token_contract_id text not null` (immutable, allowlisted)
- `recipient_account_id text not null` (immutable)
- `amount_atomic text not null` (positive **integer string**; never JS float)
- `token_decimals integer not null` (frozen metadata; expected 6 for native USDC)
- `payment_reference text not null unique` (high-entropy random; **no PII**)
- `status text not null default 'unpaid'` (`unpaid`,`pending`,`paid`,`expired`,`review_required`)
- `created_at timestamptz`, `paid_at timestamptz null`

### Table: `payments`

- `id uuid primary key`, `invoice_id uuid not null unique references invoices(id)`
- `network text not null`, `token_contract_id text not null`
- `tx_hash text not null`, `sender_account_id text not null`, `recipient_account_id text not null`
- `amount_atomic text not null`, `payment_reference text not null`
- `block_height text null`, `verified_at timestamptz not null`
- `unique(network, tx_hash)` enforced in Postgres

Prefer a database transaction/RPC function with row locks that inserts `payments` and transitions `invoices` from unpaid/pending to paid **atomically**; handle repeated verifications idempotently. Enforce RLS; public invoice views only expose what is needed to pay. Never expose Supabase service-role secrets in frontend. Restrict verification abuse with rate limiting and structured server logs without sensitive invoice details.

## 7. Exact NEP-141 transfer and verification

### 7.1 Signing the transfer

At the selected network, build an **authenticated wallet-signed** NEP-141 FunctionCall transaction:

- `transaction.receiver_id` is the **allowlisted token contract account ID**, **not** the merchant's wallet.
- There is exactly one intended `FunctionCall` action with `method_name === 'ft_transfer'`.
- Decode function args to confirm `receiver_id === invoice.recipient_account_id`, `amount === invoice.amount_atomic` and `memo === invoice.payment_reference` (or `memo === 'INV:' + reference` if consistently specified).
- Contract call attaches exactly **1 yoctoNEAR** and a documented gas budget (check wallet/library compatibility; e.g. an order of tens of Tgas; do not hardcode before verifying SDK guidance).
- Check wallet network; never silently switch chains, sign automatically, or create payer accounts on behalf of users.
- Display USDC amount and separate NEAR gas/storage costs. Never claim a gas-free or fee-free transfer.

**Example shape only; do not paste into an SDK call until its current argument types are verified:**

```json
{
  "contract": "<ALLOWLISTED_NATIVE_USDC_TOKEN_CONTRACT>",
  "method": "ft_transfer",
  "args": {
    "receiver_id": "merchant.near",
    "amount": "5250000",
    "memo": "<UNIQUE_OPAQUE_INVOICE_REFERENCE>"
  },
  "attached_deposit_yocto": "1"
}
```

### 7.2 Server verification checklist

Given only invoice ID, hash and sender account ID from the payer:

1. Load **server-stored immutable** invoice details and allowlist. Ensure invoice not already paid to a different hash and `network` is supported.
2. Query that **invoice network's RPC** (`tx` / appropriate status method) with hash, sender, `wait_until: 'FINAL'`. Do not accept other-network tx receipts.
3. Ensure response is finalized and the transaction/required receipts are successfully executed, with no failed relevant outcomes; use official schema to check final execution status and receipt outcomes rather than assuming an optimistic inclusion means success.
4. Ensure `transaction.signer_id` is the claimed sender, `transaction.receiver_id` equals **native USDC contract** for that network, and the transaction contains exactly the permitted `ft_transfer` action (do not accept mixed or potentially ambiguous batches).
5. Decode and validate function call arguments, exact merchant `receiver_id`, exact integer atomic `amount`, exact random `memo` reference, and required `1 yoctoNEAR` attached deposit. Reject bridged/unknown token contracts.
6. Enforce tx/block timestamp **no earlier than invoice creation**, where retrievable. If not reliably available, treat the exact unguessable memo plus unique tx hash as the primary invoice-binding invariant and disclose limitations. No third-party transfer can be auto-claimed without its exact reference.
7. Atomically enforce `unique(network, tx_hash)` and `unique(invoice_id)`, record proof fields, and mark invoice `paid`. Competing claims must fail; same invoice + same hash rechecks are idempotent.
8. On RPC outage, pending/failure, missing hash, wrong or duplicate payment, return an explicit pending/error result and keep the invoice **unpaid**, without inventing reversals or promising refunds. A sent transaction cannot be undone by this app.

**Don't verify USDC by checking a native NEAR `Transfer` action.** USDC is an **FT contract method call**. `transaction.receiver_id` is the USDC token contract, while the merchant is encoded in the `ft_transfer` call arguments.

## 8. Network and live-payment safety

- `.env` sample: `NEXT_PUBLIC_NEAR_DEFAULT_NETWORK=testnet`, `ENABLE_MAINNET_PAYMENTS=false`, `NEAR_TESTNET_RPC_URL=...`, `NEAR_MAINNET_RPC_URL=...`, `SUPABASE_URL=...`, `SUPABASE_ANON_KEY=...`, `SUPABASE_SERVICE_ROLE_KEY=...` (never log or commit secrets). Derive frontend permissions from a **server endpoint**; client flags alone are not security controls.
- **Never deploy, sign, spend tokens, broadcast transfers, or toggle live mainnet checkout without the human's explicit approval.** The human supplies the mainnet account(s), arranges a **tiny** USDC test amount and enough NEAR gas, and signs payments in the wallet themselves.
- If mainnet checkout isn't authorized or funded by deadline, ship honest **testnet stablecoin/FT demonstration** with mainnet USDC adapter implemented and disabled, and explicitly describe mainnet as **not demonstrated**. This still qualifies under the hackathon's testnet-only rule but does **not** prove live USDC settlement.
- Show clearly whether checkout is `TESTNET DEMO`, `MAINNET LIMITED DEMO`, or `DISABLED`; show token contract and explorer links for verification.
- No network/token changes on an issued invoice. All deployed mainnet capability is controlled by server configuration and documented; avoid exposing broad mainnet payment collection before jurisdiction-specific legal review.
- Distinguish a **working technical prototype** from an authorized financial service. Include a `LEGAL_AND_SAFETY.md` or short README section explaining jurisdictions, no custody, irreversibility, and what is not included.

## 9. Three-person sprint (11–14 November)

| Date | Member 1 — lead / backend | Member 2 — frontend | Member 3 — QA/docs/release | Stop/go proof |
|---|---|---|---|---|
| **Nov 11** | Validate Circle token IDs / metadata / storage; prove first funded testnet FT transfer, establish verifier | Next.js scaffold, public invoice, wallet connection and payment intent UI | Docs, demo account setup (with consent), threat/edge-case list, README | **Real FT call + final status verified; no fake result** |
| **Nov 12** | Supabase schema/RLS, robust hash+memo verifier, idempotent writes, mainnet adapter disabled by default | Merchant invoice form and payable checkout, pending/error recovery | Negative tests, wallet compatibility, CI | **Create → transfer → verify → receipt** |
| **Nov 13** | Harden contract allowlist and race handling; **tiny mainnet USDC smoke test only after human approval** | Dashboard/receipt polish, deploy staging | Validate real transaction evidence, security/README, test cases | **If authorized: successful mainnet USDC proof; otherwise explicit testnet-only claim** |
| **Nov 14** | Bug fixes only, freeze scope, verify production config | Mobile payment funnel and final smoke test | Record demo, secrets audit, X post for human to publish, submission checklist | **Submit by 20:00 WIB** |

**Stop-loss:** if dashboard/CSV is delaying proof, cut dashboard/CSV. If token funding is a blocker, stop and report it rather than quietly switching to a mock. If official wallet integration is unstable, permit verified manual hash reconciliation from an externally signed transaction (but disclose that the in-app checkout is incomplete). The final submitted project must demonstrate at least one real, reproducible onchain payment mechanism.

## 10. Judge-ready acceptance tests

1. Create a `5.25 USDC` invoice; public page shows `5.25 USDC`, `NEAR`, exact network and receiver and immutable payment reference; backend stores `5250000` atomic units if `decimals=6`.
2. Payer wallet signs an **actual** NEP-141 `ft_transfer`; RPC `FINAL` and all relevant successful outcomes are independently verified → invoice changes to `paid`, receipt proves transaction.
3. Use a legitimate native NEAR `Transfer` or USDC.e `ft_transfer` for that invoice → **rejected**.
4. Correct USDC amount sent to wrong merchant or with wrong memo → **not credited**.
5. Wrong amount, failed/pending tx, missing tx, incorrect sender, or wrong network → **not credited**.
6. Reuse same hash for another invoice → **rejected**; retry same hash on original invoice → **idempotent**.
7. Two concurrent verification calls → at most one payment record, no duplicate status transitions.
8. Merchant token-storage unregistered → invoice issuance blocked with actionable registration guidance.
9. Mainnet disabled at server → mainnet payment creation endpoint denies even if client hacks UI.
10. Repo clone + README reproduces the testnet flow without a private mainnet wallet; genuine mainnet proof is labeled as such and independently explorable **only if actually executed**.

## 11. Business model / post-hackathon roadmap

- **Initial commercial product:** invoicing SaaS sold to legally eligible crypto-native freelancers and agencies; no custody, with hosted invoice links, independent onchain receipts, CSV and better accounting tools. Charging for software subscriptions (when lawful) is a simpler first revenue model than charging a percentage of money flows.
- **Later:** multiple stablecoins/chains, NEAR Intents cross-chain funding, payer fiat purchase options through appropriately authorized partners, reminders, merchant team roles, payment monitoring, refunds/disputes, automated tax accounting, anti-abuse and AML/sanctions workflow as required.
- Do not represent the app as licensed or compliant, nor promise bank settlement, payouts, refunds, or fiat conversion.

## 12. Mandatory NEAR HACKATHON submission rules

**Chosen project name: `Settiva`.** Track: `realworld`; team size category: `2 - 4`. Other form fields still require explicit user-provided values and confirmation. Do not create a submission without confirming the complete payload.

Read `HACKATHON.md` and **re-read https://nearhackathon.com/HACKATHON.md just before submission**. Event rules are separate from this PRD. The supplied rules say testnet-only prototypes are eligible, integration hints are optional, and prior code/templates are allowed with disclosures.

- The **human chooses** final name, lead name, email, team size, tracks, mainnet NEAR prize account, repo URL, X demo post URL, idea text, and consent. **Never invent values.** A mainnet prize payout wallet is still mandatory even if payment demonstration is testnet-only.
- Repo is public by **14 Nov 23:59 UTC**; never change repo visibility or push without authorization.
- Human publishes an X post saying built at NEAR HACKATHON and tagging `@NEARProtocol` and `#NEARHackathon` with attached video/screenshots. Hosted demo and exact reproducible instructions are preferable.
- Project is submitted **once** via `https://nearhackathon.com/#apply` or the submission API; before API POST, **show exact JSON payload and receive explicit human confirmation**. Mistakes go to `/request-changes`.
- Human must agree to the exact sentence: "I agree that the organizers may use these details to review our submission and contact us about this hackathon."
- Never sign transactions, spend tokens, deploy to mainnet, publish X posts, or make the repository public without human approval.
- Keep demonstration available until at least judging on **18 November**, preferably **25 November**.

## 13. Reference URLs

- Source rules: https://nearhackathon.com/HACKATHON.md
- NEAR docs: https://docs.near.org/
- NEP-141 transfer/storage: https://docs.near.org/primitives/ft/standard
- RPC `tx`/`tx_status` and `FINAL`: https://docs.near.org/api/rpc/transactions
- Wallet: https://docs.near.org/web3-apps/tutorials/wallet-login
- Circle native USDC: https://www.circle.com/multi-chain-usdc/near
- Circle token ID distinction: https://www.circle.com/blog/usdc-is-now-available-on-near
- Circle NEAR/NEP-141 support: https://help.circle.com/support/en/usdc-supported-blockchains-minting-redemption-faqs?id=kb_article_view&sysparm_article=KB0010590
- Indonesian payment restrictions: https://www.bi.go.id/id/publikasi/ruang-media/news-release/Pages/sp_200418.aspx
- Recent legal context: https://chambers.com/practice-guides/guides/fintech-2026/indonesia/law-and-practice
- Track prompt: https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/08-realworld.md
