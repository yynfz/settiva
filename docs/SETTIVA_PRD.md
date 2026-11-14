# Settiva — Native USDC Invoicing MVP PRD (v2.3)

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

**Testnet reality check:** Circle lists a testnet token address; that does **not** mean free testnet USDC is automatically available. Verify its onchain metadata and fund two development accounts. Time-box testnet USDC funding investigation to one hour. If no usable funded path is established within that hour, use a **clearly labeled, separately allowlisted testnet NEP-141 test token** to exercise the exact transfer/verifier code; label it **“Test token — no monetary value”** and show its actual asset identity on invoices and receipts. Freeze its separately allowlisted contract and verified metadata on issuance; never substitute assets on an existing invoice. This fallback is testnet-only; mainnet accepts native Circle USDC only. A real native Circle USDC payment on mainnet is then the required proof for the mainnet-USDC claim, subject to human authorization and lawful operation. Never simulate a successful payment.

## 3. MVP product experience

1. An explicitly invited merchant signs in (Supabase Auth) and connects or manually sets a **merchant-controlled receiving wallet** for a selected network. App verifies account format and token-storage registration before issuing the invoice. Public merchant registration is outside the MVP; invite-only access is enforced server-side. Manual receiving-account entry is permitted after the merchant explicitly confirms “I control this receiving account” and confirms the destination. Format/storage checks do not constitute cryptographic ownership proof; the MVP makes no verified-ownership claim.
2. Merchant creates a USD invoice (client label, description, one amount, due date optional). For USDC, the USD invoice amount fixes the requested USDC decimal amount, e.g., `5.25` USDC, stored in **integer atomic units** (`5250000` for 6 decimals). Test-token fallback invoices are demonstrations with an explicit test-token amount and no monetary-value claim.
3. Invoice is issued with immutable `network`, `token_contract_id`, `recipient_account_id`, `amount_atomic`, and a random one-time `payment_reference`. Public link is copyable.
4. Payer opens public invoice without an app account. UI explicitly displays **NEAR / actual asset / network**, receiving wallet and transfer amount. It warns that a payer needs **the requested token plus a small NEAR balance for gas**, and that wallet connection is required for the MVP.
5. Payer connects a wallet on the invoice's exact network and explicitly signs **one NEP-141 `ft_transfer` contract call**, with `receiver_id`, `amount` (atomic integer string), and `memo` containing the invoice's opaque one-time reference. Attach **exactly 1 yoctoNEAR** to the call and reasonable gas as supported by the wallet/NEAR SDK. Funds go **directly from the payer's wallet to the merchant**, not to the app.
6. Wallet returns a transaction hash (or redirects and returns later). App verifies asynchronously; if the response is lost, the payer can paste `txHash + senderAccountId`. **Never ask them to pay again automatically** merely because the response timed out.
7. Backend independently queries the correct network RPC with `wait_until: 'FINAL'`, checks successful execution of the whole relevant transaction/receipts, exact token contract, single expected `ft_transfer` action, sender, merchant recipient, exact atomic amount, and exact payment reference. It checks transaction uniqueness and atomically records the verified payment. The first recorded matching payment sets the invoice to `paid`; subsequent distinct matching payments are retained as overpayments requiring refund.
8. Public receipt displays amount, token, network, recipient, sender, finalized transaction hash, timestamp and an appropriate network explorer link. Invoice/payment CSV export is P1.

**Identity and reconciliation:** the `memo` includes a high-entropy opaque reference unique to the invoice. It is publicly visible onchain: no names, emails, invoice descriptions, or customer PII in the memo. A transfer with no matching memo **must not be auto-credited**. Show the mismatch on that payment attempt and explain that funds may have moved without satisfying the invoice; the MVP provides no manual crediting workflow. An invalid attempt does not block a later valid payment or its receipt.

**Invoice and attempt states:** an invoice is `unpaid` until a matching verified payment atomically makes it `paid`. Pending confirmation, failed execution, and mismatched verification describe individual payment attempts, not invoice states. Display pending confirmation for the relevant attempt without implying the invoice is paid. Persist submitted transaction hashes, claimed sender accounts, invoice associations, and verification outcomes server-side. Retry verification while the invoice page is open and resume on reopening; background monitoring is outside the MVP. If the hash never reaches Settiva, guide the payer to retrieve it from wallet history and submit it. An uncertain result must never automatically trigger another transfer.

**Payer identity:** any payer may satisfy an invoice with a fully matching transfer. Verify that the actual onchain sender matches the submitted sender account; do not restrict payment to the private client label or a preassigned payer wallet. Record the actual sender on the receipt.

**Duplicate payments and refunds:** repeated verification of the same transaction returns its existing result. The first fully matching payment successfully recorded by Settiva satisfies the invoice; each later distinct fully matching transfer is recorded as an overpayment, shown to the merchant and affected payer as **“Overpayment — refund needed.”** The merchant manually authorizes a separate return transfer from the invoice's original receiving account, returning the full extra token amount in the same asset/network to that payment's original sender, then submits its transaction hash. Refunds from other accounts do not satisfy the MVP verification rules. Settiva independently verifies the return transfer before showing **“Overpayment — refunded.”** Submission, wallet approval, pending execution, or verification failure never proves a refund. The invoice remains paid and its original receipt is unchanged. Settiva holds no funds and performs no automatic refunds. Detection requires submission of the additional payment's transaction hash; background wallet monitoring remains deferred.

**Refund scope:** the MVP verifies refunds for additional fully matching payments only. Two separate correct 10-token payments for a 10-token invoice produce one applied payment and one refundable overpayment. A single 20-token transfer, a partial payment, or a wrong-reference transfer is a mismatch: do not apply it to the invoice or put it through the verified duplicate-payment refund workflow. Show the mismatch and direct resolution to the merchant; Settiva does not automatically reconcile these transfers.

**Due dates:** a due date is advisory. An unpaid invoice past its due date is displayed as overdue and remains payable. Accept valid late payments, including payments verified after the due date. There is no invoice expiry state in the MVP.

**Public information:** possession of an invoice link grants access to its public payment details and, after verified payment, its receipt. Public fields are merchant display name, amount, asset, network, receiving account, payment reference, optional due date, and invoice status. Receipts additionally expose the verified transaction proof described above. Client labels and free-text invoice descriptions remain merchant-private, including in public API responses. The invoice-owning merchant can see the full attempt, overpayment, and refund history. Public invoice/receipt responses do not enumerate that history. A rate-limited lookup scoped to the invoice and a specific transaction hash returns only that transfer's status and relevant payment/refund proof. Knowledge of a publicly visible hash is not proof of payer identity; the lookup grants no signing, refund-submission, or merchant-data privileges.

**Wallet/storage caveat:** the recipient account must have storage registered with the USDC contract. Check `storage_balance_of` (or contract-specific equivalent) before invoice issuance; guide the merchant through a separate wallet-approved `storage_deposit` where needed, subject to the contract's rules, network charges and user consent. A merchant should never unknowingly publish an unreceivable invoice. Both payer and merchant must use wallet/account configurations compatible with the selected NEAR network.

## 4. Feature priorities and kill switches

### P0 — ship or do not claim completed

- [ ] Network/contract allowlist and verified onchain token metadata, with wrong-network/wrong-token rejection.
- [ ] Invited merchants can sign in, set a receiving wallet, create immutable invoices, and view a basic own-invoice list; public invoice links work without payer registration.
- [ ] Required release proof: create an invoice → one **real, successful, finalized testnet** NEP-141 transfer using the exact merchant recipient, amount and memo → independent verification → receipt. Label the actual asset accurately. Mainnet USDC proof is an optional milestone requiring separate human authorization; its absence does not block the testnet release.
- [ ] Backend independently verifies transaction, token contract, `ft_transfer` call, `receiver_id`, amount, memo, sender, successful finalized execution, and uniqueness.
- [ ] Invoice transitions from `Unpaid` to `Paid` only after verification. Individual payment attempts show pending confirmation or explicit errors; a failed attempt never blocks a valid payment. A paid invoice has an onchain receipt and network-correct explorer link.
- [ ] `ENABLE_MAINNET_PAYMENTS=false` by default. Mainnet checkout **requires an explicit human decision**, a separate config activation and a clearly labeled warning about real funds. Backend must enforce the flag, not just hide the button. When disabled, the backend rejects new mainnet invoice issuance and reports in-app mainnet checkout disabled. Existing invoice details and receipts remain accessible. Verification against already-issued invoices remains available and may record a genuine matching transfer as paid.
- [ ] Duplicate-payment resolution: retain each distinct verified overpayment; show refund-needed status; let the invoice-owning merchant submit a manually authorized refund transaction; verify it independently before marking the overpayment refunded.
- [ ] Negative tests: wrong asset, bridged USDC.e, wrong network, recipient, amount, memo, sender mismatch, transaction failure, unfinalized tx, duplicate hash, concurrent verifier requests.
- [ ] Deployable public demo, public repository, LICENSE, `.env.example`, audited setup instructions, working README examples, no credentials committed.

### P1 — only after P0 succeeds

- [ ] Merchant dashboard enhancements beyond the P0 basic own-invoice list.
- [ ] CSV export and printable browser receipt.
- [ ] Read-only hosted sample showing **a genuinely verified** mainnet transaction (never fabricated or implied to be live until confirmed).
- [ ] One network selector for merchants, disabled for already-issued invoices.

### P2 — explicitly after hackathon

Multi-chain checkout/NEAR Intents, gas abstraction, payer fiat onramps, stablecoin swaps, subscriptions, PDF generation, email reminders, partial payments, fee monetization, advanced accounting, general refunds/disputes beyond duplicate-payment resolution, teams/multi-tenancy, automated wallet monitoring, mobile applications, bank payouts, enterprise compliance workflows.

**Hard stop:** do not sacrifice actual successful transfer verification for the configured USDC or explicitly labeled testnet fallback asset to build dashboards, animations or AI features. Never claim **mainnet enabled**, **production ready**, **gasless**, **fiat-supported**, or **compliant** without proof.

## 5. UI and routes

- `/` — brief commercial value proposition, testnet demo and clearly distinct *mainnet limited preview* state.
- `/dashboard` — basic authenticated own-invoice list and payment statuses (P0); dashboard enhancements are P1.
- `/dashboard/new` — USD amount/description, merchant receiving account and **network selection**, plus preflight storage registration check.
- `/invoice/[id]` — public, non-editable network/token/amount/destination; payer wallet connect, Pay USDC, recovery-by-hash and risk warnings.
- `/invoice/[id]/receipt` — accessible to anyone with the invoice link, only when server records verified payment; excludes client label and invoice description.
- `/api/invoices` — invited-merchant authenticated create/list; server validates ownership of the invoice/profile and canonical amount; this does not assert cryptographic control of the receiving account. Reject new mainnet invoices when mainnet payments are disabled.
- `/api/invoices/[id]/pay-config` — public **read-only** immutable invoice payment details; server reports whether mainnet checkout is enabled, preserving existing invoice details when disabled.
- `/api/invoices/[id]/verify` — idempotent, rate-limited server verifier accepting only `{txHash,senderAccountId}` (no `paid` state or token/amount from client).
- `/api/invoices/[id]/transfers/[txHash]` — public, rate-limited lookup of one submitted transfer's status and relevant payment/refund proof; never lists other attempts or reveals private invoice fields.
- `/api/payments/[id]/refund/verify` — authenticated invoice-owning merchant submits a refund transaction hash for a verified overpayment. Server derives expected asset, network, amount, original receiving account as sender, and original payer as recipient from stored evidence and independently verifies the return transfer.
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
- `client_label text null` (merchant-private)
- `description text not null` (merchant-private), `due_at timestamptz null` (advisory; does not expire the invoice)
- `currency text not null default 'USD'`, `asset_symbol text not null` (server-selected from the allowlisted asset; test-token fallback must not inherit a USDC label)
- `network text not null check (network in ('testnet','mainnet'))`
- `token_contract_id text not null` (immutable, allowlisted)
- `recipient_account_id text not null` (immutable)
- `amount_atomic text not null` (positive **integer string**; never JS float)
- `token_decimals integer not null` (frozen metadata; expected 6 for native USDC)
- `payment_reference text not null unique` (high-entropy random; **no PII**)
- `status text not null default 'unpaid'` (`unpaid`,`paid`); overdue is derived from an unpaid invoice's due date
- `created_at timestamptz`, `paid_at timestamptz null`

### Table: `payments`

- `id uuid primary key`, `invoice_id uuid not null references invoices(id)`
- `network text not null`, `token_contract_id text not null`
- `tx_hash text not null`, `sender_account_id text not null`, `recipient_account_id text not null`
- `amount_atomic text not null`, `payment_reference text not null`
- `block_height text null`, `verified_at timestamptz not null`
- `allocation text not null` (`applied`, `overpayment`); at most one `applied` payment per invoice, enforced by a partial unique index
- `unique(network, tx_hash)` enforced in Postgres; the same transaction cannot be allocated twice

### Refund evidence

Keep refund evidence linked to the specific overpayment. Preserve the refund transaction hash, network, token contract, actual sender and recipient, exact atomic amount, and verification timestamp. A verified return transfer can resolve only one overpayment; retries of the same proof are idempotent. Failed or pending verification leaves the refund unresolved. The detailed refund binding and persistence design must preserve these invariants.

Prefer a database transaction/RPC function with row locks that inserts `payments` and transitions `invoices` from unpaid to paid **atomically**; handle repeated verifications idempotently. Persist submitted transaction evidence and attempt outcomes separately from invoice status, supporting verification retries after reopening. Retain multiple distinct verified payments per invoice, with exactly one applied payment for a paid invoice; record all others as overpayments. Refund verification updates only the associated overpayment resolution and never replaces the applied payment. Enforce RLS and the public field boundary in §3. Never expose Supabase service-role secrets in frontend. Restrict verification abuse with rate limiting and structured server logs without sensitive invoice details.

## 7. Exact NEP-141 transfer and verification

### 7.1 Signing the transfer

At the selected network, build an **authenticated wallet-signed** NEP-141 FunctionCall transaction:

- `transaction.receiver_id` is the **allowlisted token contract account ID**, **not** the merchant's wallet.
- There is exactly one intended `FunctionCall` action with `method_name === 'ft_transfer'`.
- Decode function args to confirm `receiver_id === invoice.recipient_account_id`, `amount === invoice.amount_atomic` and `memo === invoice.payment_reference` (or `memo === 'INV:' + reference` if consistently specified).
- Contract call attaches exactly **1 yoctoNEAR** and a documented gas budget (check wallet/library compatibility; e.g. an order of tens of Tgas; do not hardcode before verifying SDK guidance).
- Check wallet network; never silently switch chains, sign automatically, or create payer accounts on behalf of users.
- Display the actual token amount and separate NEAR gas/storage costs. Never claim a gas-free or fee-free transfer.

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

1. Load **server-stored immutable** invoice details and allowlist. Ensure `network` is supported. An already-paid invoice still accepts verification submissions so distinct matching transfers can be recorded as overpayments.
2. Query that **invoice network's RPC** (`tx` / appropriate status method) with hash, sender, `wait_until: 'FINAL'`. Do not accept other-network tx receipts.
3. Ensure response is finalized and the transaction/required receipts are successfully executed, with no failed relevant outcomes; use official schema to check final execution status and receipt outcomes rather than assuming an optimistic inclusion means success.
4. Ensure `transaction.signer_id` is the claimed sender, `transaction.receiver_id` equals **the invoice's immutable, server-allowlisted token contract** for that network (native USDC, or the explicitly configured testnet fallback only), and the transaction contains exactly the permitted `ft_transfer` action (do not accept mixed or potentially ambiguous batches).
5. Decode and validate function call arguments, exact merchant `receiver_id`, exact integer atomic `amount`, exact random `memo` reference, and required `1 yoctoNEAR` attached deposit. Reject bridged/unknown token contracts.
6. Enforce tx/block timestamp **no earlier than invoice creation**, where retrievable. If not reliably available, treat the exact unguessable memo plus unique tx hash as the primary invoice-binding invariant and disclose limitations. No third-party transfer can be auto-claimed without its exact reference.
7. Atomically enforce `unique(network, tx_hash)` and at most one applied payment per invoice. Under an invoice row lock, the first recorded matching payment is applied and marks the invoice `paid`; later distinct matching payments are recorded as overpayments. Same invoice + same hash rechecks return the existing result. Concurrent distinct payments are both retained with only one applied.
8. On RPC outage, pending/failure, missing hash, wrong payment or a hash claimed for another invoice, return an explicit attempt-level pending/error result without changing the invoice status. An unpaid invoice remains unpaid; a paid invoice stays paid. Do not invent reversals or claim a refund before its separate return transfer is verified. A sent transaction cannot be undone by this app.

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

**Stop-loss:** if dashboard enhancements/CSV are delaying proof, cut them; retain the P0 basic own-invoice list. If token funding is a blocker, stop and report it rather than quietly switching to a mock. If official wallet integration is unstable, permit verified manual hash reconciliation from an externally signed transaction (but disclose that the in-app checkout is incomplete). The final submitted project must demonstrate at least one real, reproducible onchain payment mechanism.

## 10. Judge-ready acceptance tests

1. Create a `5.25 USDC` invoice; public page shows `5.25 USDC`, `NEAR`, exact network and receiver and immutable payment reference; backend stores `5250000` atomic units if `decimals=6`.
2. Payer wallet signs an **actual** NEP-141 `ft_transfer`; RPC `FINAL` and all relevant successful outcomes are independently verified → invoice changes to `paid`, receipt proves transaction.
3. Use a legitimate native NEAR `Transfer` or USDC.e `ft_transfer` for that invoice → **rejected**.
4. Correct USDC amount sent to wrong merchant or with wrong memo → **not credited**.
5. Wrong amount, failed/pending tx, missing tx, incorrect sender, or wrong network → **not credited**.
6. Reuse same hash for another invoice → **rejected**; retry same hash on original invoice → **idempotent**.
7. Two concurrent verifications of the same hash → one payment record. Two distinct fully matching transfers → two payment records, exactly one applied and the other an overpayment needing refund; only one invoice transition to paid.
8. Merchant token-storage unregistered → invoice issuance blocked with actionable registration guidance.
9. Mainnet disabled at server → new mainnet invoice issuance is rejected and in-app checkout is disabled even if the client UI is modified. Existing invoice details and receipts remain accessible; a genuine matching transfer against an already-issued invoice can still be verified and recorded as paid.
10. Repo clone + README reproduces the testnet flow without a private mainnet wallet; genuine mainnet proof is labeled as such and independently explorable **only if actually executed**.
11. Uninvited users cannot create or list merchant invoices; invited merchants can access only their own merchant data. Payers need no account.
12. A wrong or pending payment attempt cannot block a later valid payment or change an already-paid invoice back to unpaid.
13. An unpaid invoice past its due date is overdue and payable; valid late settlement produces a receipt.
14. Public invoice and receipt responses exclude client label and invoice description; possession of the invoice link grants access to the approved public fields.
15. A valid transfer from a different payer than the merchant's named client is accepted; the receipt records the actual sender.
16. Submitted transaction evidence survives page closure; reopening resumes verification without initiating another transfer. A missing hash leads to wallet-history recovery guidance.
17. Test-token fallback invoices and receipts show the actual asset and “Test token — no monetary value”; they never claim native USDC settlement.
18. A second distinct fully matching payment is recorded as an overpayment needing refund; the original applied payment and receipt remain unchanged.
19. Submitting a refund hash does not mark it refunded. Only independently verified successful final return from the invoice's original receiving account of the full extra amount in the same asset/network to the original payer resolves the overpayment. Wrong source, destination, amount, asset/network, failed or unfinalized transfers remain unresolved.
20. Reusing one refund transfer for another overpayment is rejected; rechecking the same refund for its original overpayment is idempotent. Unauthorized merchants cannot submit refund evidence for another merchant's payments.
21. Public invoice/receipt responses never list payment attempts, overpayments, or refunds. Specific-transfer lookup returns only the requested transfer's status and proof; the invoice-owning merchant can access the complete history. Private invoice fields remain excluded from public responses.
22. A single double-amount transfer is a mismatch, not an applied payment or eligible duplicate-payment refund. Two distinct exact-amount matching transfers produce one applied payment and one refundable overpayment.

## 11. Business model / post-hackathon roadmap

- **Initial commercial product:** invoicing SaaS sold to legally eligible crypto-native freelancers and agencies; no custody, with hosted invoice links, independent onchain receipts, CSV and better accounting tools. Charging for software subscriptions (when lawful) is a simpler first revenue model than charging a percentage of money flows.
- **Later:** multiple stablecoins/chains, NEAR Intents cross-chain funding, payer fiat purchase options through appropriately authorized partners, reminders, merchant team roles, payment monitoring, general refunds/disputes beyond duplicate-payment resolution, automated tax accounting, anti-abuse and AML/sanctions workflow as required.
- Do not represent the app as licensed or compliant, nor promise bank settlement, payouts, automatic or guaranteed refunds, or fiat conversion.

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
