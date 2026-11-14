# Settiva ticket breakdown — published

Source: [spec #1](https://github.com/yynfz/settiva/issues/1). Approved and published on 12 November 2026. All nine tickets are ready-for-agent sub-issues with verified native blocking relationships. Section numbers are planning identifiers; issue links and blockers below use GitHub issue numbers.

Every slice includes its own behavior tests at the approved HTTP seam with real isolated Postgres/RLS and controlled external RPC. Browser smoke coverage accompanies the relevant journey. The repository has no application code to prefactor.

## 1. Configure an invited merchant's receiving account

**GitHub issue:** [#2](https://github.com/yynfz/settiva/issues/2)

**Blocked by:** None (can start immediately)

**What it delivers:** An invited merchant signs in, confirms a receiving account, and receives actionable token/network/storage checks before invoicing.

**Acceptance criteria**

- [ ] Bootstrap the minimal agreed application stack and test harness as part of this working merchant journey; public merchant registration is disabled server-side.
- [ ] Persist the invited merchant's profile and selected receiving account; isolate merchants with server authorization and RLS, including direct data-access tests.
- [ ] Allow manual account entry with explicit control and destination confirmation; do not present format/storage checks as cryptographic ownership proof.
- [ ] Validate server-owned per-network asset configuration, metadata/decimals, account format, and receiving-account storage; provide guidance for separately wallet-approved registration.
- [ ] Time-box Circle testnet USDC funding investigation to one hour; if needed, configure the explicit testnet-only fallback with accurate asset identity and no-monetary-value labeling. Verify current official contracts/SDK guidance before integration.
- [ ] Keep mainnet unavailable by default and secrets server-only; no account funding, signing, deployment, or mainnet activation is implied by this ticket.
- [ ] Exercise the journey through the approved HTTP seam with isolated real Postgres/RLS and controlled RPC, including rejected access, wrong metadata, and missing storage; add a small merchant browser smoke.

## 2. Issue and share an immutable testnet invoice

**GitHub issue:** [#3](https://github.com/yynfz/settiva/issues/3)

**Blocked by:** [#2](https://github.com/yynfz/settiva/issues/2)

**What it delivers:** A merchant creates an invoice, sees it in their own list, and shares a public unpaid invoice that exposes only approved fields.

**Acceptance criteria**

- [ ] Accept one exact positive decimal amount, private client label/description, and optional advisory due date; persist integer atomic units without floating-point rounding.
- [ ] Freeze actual asset/network, contract, receiving account, amount, decimals, and unique opaque payment reference on issuance; reject unsupported client-supplied payment configuration.
- [ ] Create a copyable public link and basic merchant invoice list; unauthenticated payers see merchant display name and approved payment fields but never client labels or descriptions.
- [ ] Show actual asset and network explicitly, including fallback test-token labeling and separate token/NEAR cost guidance; block new mainnet issuance on the server.
- [ ] Show an unpaid invoice past its due date as overdue and keep it payable; no expiry or editable issued payment terms.
- [ ] HTTP/database tests prove merchant isolation, public projections, immutability, exact amounts, and advisory due dates; browser smoke demonstrates create → list → public invoice.

## 3. Pay a testnet invoice and obtain a verified receipt

**GitHub issue:** [#4](https://github.com/yynfz/settiva/issues/4)

**Blocked by:** [#3](https://github.com/yynfz/settiva/issues/3)

**What it delivers:** Any payer authorizes a real direct transfer; Settiva verifies final settlement, marks the invoice paid, and presents the original receipt.

**Acceptance criteria**

- [ ] Integrate the verified current wallet interface: explicit authorization on the exact invoice network for one NEP-141 ft_transfer to the configured contract, matching recipient/amount/reference and required deposit; no private keys or automatic signing.
- [ ] Accept only invoice identifier, transaction hash, and claimed sender for verification; derive expected details server-side and validate returned hash, sender, contract, action/arguments/deposit, finality, and successful relevant receipts.
- [ ] Reject wrong network/token/bridged asset, native NEAR transfer, wrong sender/recipient/amount/reference/deposit, mixed actions, failed or unfinalized evidence; explain mismatch without marking paid or promising refund.
- [ ] Atomically persist the verified applied payment and paid invoice with network/hash uniqueness and at most one applied payment; same-hash retries are idempotent and cross-invoice reuse is rejected. Keep persistence compatible with multiple payment records introduced by the overpayment slice.
- [ ] Pending/errors describe the attempt and cannot downgrade paid state or block a later valid transfer. Accept payment from any payer and valid overdue settlement.
- [ ] Publish the original receipt only after verification, with actual asset/network, sender/recipient, exact amount, transaction/timestamp and correct explorer link; preserve private-field exclusions.
- [ ] Cover success, negatives, same-hash concurrency, rate limiting, and authorization through HTTP with real database constraints and controlled RPC. Demonstrate a genuine authorized testnet wallet transfer; fixtures alone are not live proof.

## 4. Recover payment verification after interruption

**GitHub issue:** [#5](https://github.com/yynfz/settiva/issues/5)

**Blocked by:** [#4](https://github.com/yynfz/settiva/issues/4)

**What it delivers:** A payer can submit lost transaction evidence, close the page, and resume verification without sending another payment.

**Acceptance criteria**

- [ ] Persist submitted hashes, claimed senders, invoice associations, and outcomes separately from invoice status; distinguish pending, failure, mismatch, unavailable RPC, and verified results.
- [ ] Provide hash-plus-sender recovery and guidance to retrieve a hash from wallet history if Settiva never received it.
- [ ] Retry verification while the page is open and resume retained evidence when reopened, subject to rate limits; uncertain results never automatically authorize or send a second transfer.
- [ ] Keep complete attempt history merchant-private; recovering one known transfer must not enumerate other submissions. No background monitoring or automatic discovery of unknown hashes.
- [ ] Verify durable recovery after page/process interruption and RPC restoration through HTTP/database tests and a browser recovery smoke; verify repeated recovery does not duplicate payments or alter the original receipt.

## 5. Retain duplicate full payments as overpayments

**GitHub issue:** [#6](https://github.com/yynfz/settiva/issues/6)

**Blocked by:** [#4](https://github.com/yynfz/settiva/issues/4)

**What it delivers:** When two distinct correct transfers arrive, the merchant sees one applied payment and each additional payment needing refund without losing evidence.

**Acceptance criteria**

- [ ] Accept verification of distinct matching transactions even after the invoice is paid; persist every verified transfer with applied or overpayment allocation.
- [ ] Under atomic database enforcement, the first successfully recorded matching payment is applied; every later distinct matching transfer is an overpayment with refund-needed resolution. Verification order, not earliest onchain timestamp, determines allocation.
- [ ] Show the invoice-owning merchant payment/overpayment history and return the submitted transfer's own overpayment result to the payer; public invoice/receipt responses never enumerate that history.
- [ ] Keep the original invoice paid and its receipt unchanged; same transaction rechecks return their prior result instead of creating overpayments.
- [ ] Exclude partial amounts, one double-amount transfer, and wrong-reference transfers from applied/overpayment allocation; show mismatch and direct resolution to the merchant.
- [ ] HTTP tests with actual database races retain two distinct concurrent transfers with exactly one applied payment; test same-hash retries, cross-invoice reuse, isolation, and unchanged receipt.

## 6. Verify merchant-authorized overpayment refunds

**GitHub issue:** [#7](https://github.com/yynfz/settiva/issues/7)

**Blocked by:** [#6](https://github.com/yynfz/settiva/issues/6)

**What it delivers:** A merchant manually returns an overpayment and submits proof; Settiva marks it refunded only after independently verifying the exact return.

**Acceptance criteria**

- [ ] Provide the invoice-owning merchant a refund-needed view with exact return details and a refund-hash submission flow; the merchant signs/sends separately from the original receiving account.
- [ ] Verify successful final execution on the same network/token, full extra amount, original invoice receiving account as sender, and original payer as recipient, deriving expectations from stored evidence.
- [ ] Bind refund proof to the particular overpayment; preserve proof fields, prevent reuse across overpayments, and make repeat verification idempotent.
- [ ] Pending/failed/wrong-source/wrong-recipient/wrong-amount/wrong-asset evidence leaves the refund outstanding; a submitted hash alone never marks refunded.
- [ ] Enforce owner-only refund submission, no automatic signing/refunds, and no changes to the applied payment, paid invoice, or original receipt. General or mismatched-payment refunds remain excluded.
- [ ] HTTP tests exercise successful return, all rejection cases, cross-merchant denial, proof reuse/concurrency, and unchanged receipt using real database constraints and controlled RPC; demonstrate the merchant refund status journey.

## 7. Look up one transfer's payment and refund status

**GitHub issue:** [#8](https://github.com/yynfz/settiva/issues/8)

**Blocked by:** [#5](https://github.com/yynfz/settiva/issues/5), [#7](https://github.com/yynfz/settiva/issues/7)

**What it delivers:** A payer checks a known transfer and its refund evidence without seeing the invoice's complete payment history.

**Acceptance criteria**

- [ ] Provide an invoice-scoped public hash lookup and UI for the requested transfer's attempt/payment status and relevant verified refund proof.
- [ ] Return only that transfer's approved information; never enumerate other attempts, overpayments or refunds, or expose private client labels/descriptions.
- [ ] Keep the original public receipt focused on the applied payment while the merchant retains authenticated full-history access.
- [ ] Knowledge of a publicly visible hash is not identity proof and grants no private data, merchant privileges, or refund-submission authority.
- [ ] Rate-limit lookup and use non-sensitive diagnostics; tests inspect response bodies for cross-transfer/cross-invoice leakage and authorization escalation.
- [ ] Browser smoke follows an overpayment from refund-needed through verification to refunded using the specific-transfer lookup.

## 8. Enforce mainnet checkout controls while preserving evidence

**GitHub issue:** [#9](https://github.com/yynfz/settiva/issues/9)

**Blocked by:** [#4](https://github.com/yynfz/settiva/issues/4)

**What it delivers:** Server-controlled network availability prevents new mainnet payment collection while allowing genuine existing settlement evidence to be read and verified.

**Acceptance criteria**

- [ ] Implement the configured native-USDC mainnet adapter and explicit network presentation while leaving mainnet payments disabled by default; never allow the testnet fallback on mainnet.
- [ ] Reject new mainnet invoice issuance server-side and make in-app checkout unavailable when disabled; client UI changes cannot bypass the flag. Existing invoice terms remain immutable.
- [ ] Preserve existing mainnet invoice details and receipts, and permit verification to record a matching transfer against an already-issued invoice while checkout is disabled.
- [ ] Derive client availability from the server and clearly show TESTNET DEMO, MAINNET LIMITED DEMO, or DISABLED as appropriate; distinguish implemented support from actual live proof.
- [ ] Test disabled/enabled configurations, manipulated client inputs, and existing evidence through HTTP with controlled RPC and real database records; these tests must not send real funds.
- [ ] Document separate human authorization for activation and any mainnet demonstration; completing this ticket neither enables live checkout nor authorizes wallet signing.

## 9. Deliver a reproducible testnet payment and refund demonstration

**GitHub issue:** [#10](https://github.com/yynfz/settiva/issues/10)

**Blocked by:** [#8](https://github.com/yynfz/settiva/issues/8), [#9](https://github.com/yynfz/settiva/issues/9)

**What it delivers:** A reviewer can set up and evaluate the complete application with honest network labels and genuine payment/refund evidence.

**Acceptance criteria**

- [ ] Complete the deployable landing page and working demonstration journey: merchant invoice → authorized testnet transfer → verified receipt → second matching transfer → merchant return → verified refund lookup, preserving the original receipt.
- [ ] Provide a license, environment template, setup/invitation/funding instructions, supported wallet configuration, test commands, and explicit demo limitations without committing credentials or private invoice data.
- [ ] Reproduce from a clean checkout with isolated test infrastructure and run the approved HTTP/database suite and small browser smoke suite; correct integration failures.
- [ ] Record genuine transaction evidence for the actual configured testnet asset. If using fallback, consistently say Test token — no monetary value; never use controlled RPC fixtures as live proof.
- [ ] Preserve mainnet-disabled defaults and do not claim demonstrated mainnet settlement without separate authorized genuine evidence.
- [ ] Prepare hosting/repository artifacts for the required public demonstration; deployment, visibility changes, publication, and wallet signing follow existing explicit authorization requirements. Report concrete external prerequisites if they prevent live proof rather than claiming completion.
- [ ] Keep dashboard enhancements, CSV/PDF, automatic monitoring, and broader refund/dispute work outside required release scope.
