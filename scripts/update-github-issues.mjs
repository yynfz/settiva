import { execSync } from "child_process";
import fs from "fs";

// Load original issues
const originalIssues = JSON.parse(
  fs.readFileSync("/tmp/settiva-issues.json", "utf-8"),
);

console.log(`Loaded ${originalIssues.length} issues.`);

// Helper to update an issue
function updateIssue(number, newBody) {
  const tmpFile = `/tmp/issue-${number}-body.md`;
  fs.writeFileSync(tmpFile, newBody, "utf-8");
  console.log(`Updating issue #${number}...`);
  execSync(
    `gh issue edit ${number} --repo yynfz/settiva --body-file "${tmpFile}"`,
    { stdio: "inherit" },
  );
  console.log(`✓ Updated issue #${number}`);
}

// ISSUE #1: Parent Spec
const issue1Original = originalIssues.find((i) => i.number === 1).body;

// Enhance Issue #1
const issue1Enhanced = issue1Original
  .replace(
    `## Solution`,
    `## Solution (incorporating InvoiceShelf patterns)

Build Settiva, an invite-only merchant invoicing MVP with public payment links, adopting key architectural patterns from InvoiceShelf:
1. **Core Invoicing Data Model**: Itemized line items (name/description, quantity, unit price, item total), sequential human-readable invoice numbers (\`INV-YYYY-XXXX\`), subtotal/total calculations, advisory due dates, private merchant notes, and exact atomic unit mapping for cryptocurrency settlement.
2. **PDF Generation**: Server-rendered PDF documents for invoices and verified payment receipts matching InvoiceShelf's professional document template layout, downloadable directly from the customer portal and merchant dashboard.
3. **Customer Portal**: Shareable customer portal links with secure unique hash tokens (\`/portal/[token]\` or \`/invoice/[id]\`), enabling payers to inspect itemized bills, track status (including recording the \`viewed\` reading state upon opening), download PDF invoices, authorize direct NEAR NEP-141 token transfers from their wallet, and retrieve verified settlement receipt PDFs without requiring registration.`,
  )
  .replace(
    `12. As a merchant, I want a basic list of my invoices and statuses, so that I can see which requests have been paid.`,
    `12. As a merchant, I want a basic list of my invoices and statuses (Draft, Unpaid, Viewed, Paid, Overdue), so that I can see which requests have been visited and paid.
12a. As a merchant, I want itemized line items (descriptions, quantities, unit prices) in my invoices, so that my bills reflect detailed service breakdowns like InvoiceShelf.
12b. As a merchant and payer, I want to download or view a clean, professional PDF invoice and payment receipt, so that I have portable accounting records.
12c. As a payer, I want a dedicated customer portal page accessible via a unique link, so that I can review line items, download the invoice PDF, connect my wallet, and complete payment.`,
  )
  .replace(
    `Organize around merchant access/invoice issuance, payment verification and allocation, refund verification, and public/private read projections. Keep a small application interface; avoid an indexer, bridge, custodial module, or bespoke smart contract.`,
    `Organize around merchant access/invoice issuance, payment verification and allocation, refund verification, and public/private read projections. Adopt InvoiceShelf's domain structure for:
   - Invoicing data model: itemized line items, sequential invoice numbering (\`INV-YYYY-XXXX\`), subtotal calculation, and status progression (\`unpaid\` → \`viewed\` → \`paid\`).
   - PDF generation engine: server-side HTML-to-PDF rendering for clean invoice and receipt downloads.
   - Customer portal: tokenized unique-hash access for unauthenticated payer view, reading event recording (\`viewed\` state), and direct checkout.`,
  );

// ISSUE #2: Configure an invited merchant's receiving account
const issue2Enhanced = `## Parent

https://github.com/yynfz/settiva/issues/1

## What to build

An invited merchant signs in, confirms a receiving account, configures merchant/business profile defaults (inspired by InvoiceShelf's company settings: business display name, optional contact info, and default invoice terms), and receives actionable token/network/storage checks before invoicing.

## Acceptance criteria

- [ ] Bootstrap the minimal agreed application stack and test harness as part of this working merchant journey; public merchant registration is disabled server-side.
- [ ] Persist the invited merchant's profile and selected receiving account, including business display name and default invoice configuration; isolate merchants with server authorization and RLS, including direct data-access tests.
- [ ] Allow manual account entry with explicit control and destination confirmation; do not present format/storage checks as cryptographic ownership proof.
- [ ] Validate server-owned per-network asset configuration, metadata/decimals, account format, and receiving-account storage; provide guidance for separately wallet-approved registration.
- [ ] Time-box Circle testnet USDC funding investigation to one hour; if needed, configure the explicit testnet-only fallback with accurate asset identity and no-monetary-value labeling. Verify current official contracts/SDK guidance before integration.
- [ ] Keep mainnet unavailable by default and secrets server-only; no account funding, signing, deployment, or mainnet activation is implied by this ticket.
- [ ] Exercise the journey through the approved HTTP seam with isolated real Postgres/RLS and controlled RPC, including rejected access, wrong metadata, and missing storage; add a small merchant browser smoke.

## Blocked by

None (can start immediately).
`;

// ISSUE #3: Issue and share an immutable testnet invoice
const issue3Enhanced = `## Parent

https://github.com/yynfz/settiva/issues/1

## What to build

A merchant creates an invoice with InvoiceShelf-inspired itemized line items and sequential numbering, views it in their merchant dashboard, exports a server-generated PDF, and shares a public customer portal link with a unique access token that exposes only approved fields and transitions to viewed status when opened.

## Acceptance criteria

- [ ] Implement InvoiceShelf core invoicing data model: support itemized line items (name/description, quantity, unit price, total), sequential invoice number (\`INV-YYYY-XXXX\`), subtotal, private client label/description, and optional advisory due date; persist integer atomic units without floating-point rounding.
- [ ] Freeze actual asset/network, contract, receiving account, amount, decimals, and unique opaque payment reference on issuance; reject unsupported client-supplied payment configuration.
- [ ] Implement Customer Portal sharing: generate public shareable customer portal link with secure unique access token/hash (\`/portal/[token]\` or \`/invoice/[id]\`); opening the customer portal records the \`viewed\` reading state without requiring payer authentication.
- [ ] Implement PDF Generation: provide server-rendered PDF invoice export (\`/api/invoices/[id]/pdf\`) styled with InvoiceShelf-inspired document layout, including line items, subtotal, merchant display name, and payment instructions.
- [ ] Create basic merchant invoice dashboard showing invoice numbers, statuses (\`unpaid\`, \`viewed\`, \`paid\`, \`overdue\`), amounts, and actions (copy portal link, download PDF).
- [ ] Show actual asset and network explicitly, including fallback test-token labeling and separate token/NEAR cost guidance; block new mainnet issuance on the server.
- [ ] Show an unpaid invoice past its due date as overdue and keep it payable; no expiry or editable issued payment terms.
- [ ] HTTP/database tests prove merchant isolation, public customer portal projections, PDF endpoint generation, immutability, exact amounts, and advisory due dates; browser smoke demonstrates create → list → customer portal view → PDF download.

## Blocked by

https://github.com/yynfz/settiva/issues/2

## Blocking

https://github.com/yynfz/settiva/issues/4
`;

// ISSUE #4: Pay a testnet invoice and obtain a verified receipt
const issue4Enhanced = `## Parent

https://github.com/yynfz/settiva/issues/1

## What to build

Any payer authorizes a real direct transfer from the Customer Portal; Settiva verifies final settlement onchain, marks the invoice paid, and presents the customer with both an in-portal receipt and a downloadable PDF receipt.

## Acceptance criteria

- [ ] Integrate the verified current wallet interface directly within the Customer Portal: explicit authorization on the exact invoice network for one NEP-141 ft_transfer to the configured contract, matching recipient/amount/reference and required deposit; no private keys or automatic signing.
- [ ] Accept only invoice identifier, transaction hash, and claimed sender for verification; derive expected asset, network, recipient, amount, and reference strictly from the stored invoice.
- [ ] Verify final transaction execution, single NEP-141 transfer action, deposit, sender, recipient, atomic amount, and payment reference memo against NEAR testnet RPC; reject wrong assets, bridged USDC.e, wrong networks, and unfinalized/failed executions.
- [ ] Update invoice status to \`paid\` upon first successful matching verification, record applied payment details, and display stable verified receipt in the Customer Portal.
- [ ] Provide a downloadable server-generated PDF Payment Receipt (\`/api/invoices/[id]/receipt/pdf\`) containing onchain evidence: transaction hash, block timestamp, sender, receiving account, amount, and explorer link, styled cleanly after InvoiceShelf receipt documents.
- [ ] Enforce idempotency: repeated submissions of the same transaction return the existing verified result without duplicate records.
- [ ] Exercise the complete checkout and receipt generation through the approved HTTP seam with isolated real Postgres/RLS and controlled RPC; browser smoke tests the customer portal payment and PDF receipt flow.

## Blocked by

https://github.com/yynfz/settiva/issues/3

## Blocking

https://github.com/yynfz/settiva/issues/5
https://github.com/yynfz/settiva/issues/6
https://github.com/yynfz/settiva/issues/9
`;

// ISSUE #5: Recover payment verification after interruption
const issue5Enhanced = `## Parent

https://github.com/yynfz/settiva/issues/1

## What to build

A payer can submit lost transaction evidence in the Customer Portal, close the page, and resume verification without sending another payment or losing progress.

## Acceptance criteria

- [ ] Persist submitted hashes, claimed senders, invoice associations, and verification outcomes separately from invoice status; distinguish pending confirmation, execution failure, mismatch, temporary RPC unavailability, and verified results.
- [ ] Customer Portal displays persistent attempt recovery UI: guidance to retrieve missing hash from wallet history, input for manual hash re-submission, and clear non-sensitive diagnostics.
- [ ] Reopening the Customer Portal link resumes verification polling for pending submissions without creating duplicate attempt records.
- [ ] Rate-limit verification endpoints; ensure invalid or failed attempts cannot downgrade an already-paid invoice or block subsequent valid payments.
- [ ] HTTP/database tests verify retry recovery, interruption handling, and page-reopening persistence; browser smoke exercises the recovery banner and hash submission in the Customer Portal.

## Blocked by

https://github.com/yynfz/settiva/issues/4

## Blocking

https://github.com/yynfz/settiva/issues/8
`;

// ISSUE #6: Retain duplicate full payments as overpayments
const issue6Enhanced = `## Parent

https://github.com/yynfz/settiva/issues/1

## What to build

When two distinct correct transfers arrive for an invoice, Settiva retains both under an InvoiceShelf-inspired payment allocation ledger: one applied payment satisfying the invoice, and subsequent matching transfers recorded as overpayments needing refund.

## Acceptance criteria

- [ ] Accept verification of distinct matching transactions even after the invoice is paid; persist every verified transfer with an explicit allocation state (\`applied\` vs \`overpayment\`).
- [ ] Under atomic database enforcement (Postgres row locking / constraints), the first successfully recorded matching payment marks the invoice \`paid\` and stabilizes the original receipt; later matching transfers are classified as \`overpayment\` with \`refund_needed\` resolution status.
- [ ] Customer Portal retains the original applied payment receipt unchanged while acknowledging any overpayment without disclosing other payers' sensitive transaction data.
- [ ] Merchant dashboard displays the overpayments ledger with payer account, amount, transaction hash, and refund status (\`refund_needed\` or \`refunded\`).
- [ ] HTTP/database tests prove concurrent duplicate payments, first-recorded allocation, immutable original receipt, and overpayment persistence under race conditions.

## Blocked by

https://github.com/yynfz/settiva/issues/4

## Blocking

https://github.com/yynfz/settiva/issues/7
`;

// ISSUE #7: Verify merchant-authorized overpayment refunds
const issue7Enhanced = `## Parent

https://github.com/yynfz/settiva/issues/1

## What to build

A merchant manually returns an overpayment from their wallet and submits proof; Settiva verifies the return transfer onchain, marks it refunded, and provides a downloadable Refund / Credit Note PDF.

## Acceptance criteria

- [ ] Provide the invoice-owning merchant a dedicated overpayments refund panel showing exact return instructions: recipient (original payer), token contract, exact amount, and receiving account as sender.
- [ ] Authenticated merchant submits the return transaction hash; Settiva independently queries NEAR RPC to verify final execution, correct recipient, sender, amount, and asset before marking status as \`refunded\`.
- [ ] Generate a downloadable server-rendered Refund / Credit Note PDF (\`/api/payments/[id]/refund/pdf\`) documenting original invoice reference, overpayment hash, return transaction hash, and onchain timestamp.
- [ ] Enforce refund idempotency: one return transfer can resolve only one overpayment, and failed or pending verification leaves the overpayment outstanding without modifying the original invoice receipt.
- [ ] HTTP/database tests verify authorized refund submission, RPC verification of returns, invalid return rejection, and PDF generation; browser smoke covers merchant refund submission.

## Blocked by

https://github.com/yynfz/settiva/issues/6

## Blocking

https://github.com/yynfz/settiva/issues/8
`;

// ISSUE #8: Look up one transfer's payment and refund status
const issue8Enhanced = `## Parent

https://github.com/yynfz/settiva/issues/1

## What to build

A payer checks a known transfer and its refund evidence via a dedicated Customer Portal lookup without seeing the invoice's complete payment history or other payers' transactions.

## Acceptance criteria

- [ ] Provide an invoice-scoped public hash lookup tool in the Customer Portal (\`/portal/[token]/lookup\` or \`/lookup\`) for checking a specific transfer's attempt/payment status and verified refund proof.
- [ ] Return strictly that transfer's verified details (status, applied vs overpayment, refund status, return hash); never enumerate other payment attempts, overpayments, or merchant-private client descriptions.
- [ ] Provide downloadable PDF receipt or refund confirmation specifically for the looked-up transfer.
- [ ] Rate-limit lookup queries and ensure knowledge of a public transaction hash confers no merchant privileges or refund-submission rights.
- [ ] HTTP/database tests assert strict cross-transfer privacy, error handling, and rate limits; browser smoke verifies lookup from refund-needed through verified refund.

## Blocked by

https://github.com/yynfz/settiva/issues/5
https://github.com/yynfz/settiva/issues/7

## Blocking

https://github.com/yynfz/settiva/issues/10
`;

// ISSUE #9: Enforce mainnet checkout controls while preserving evidence
const issue9Enhanced = `## Parent

https://github.com/yynfz/settiva/issues/1

## What to build

Server-controlled network availability prevents new mainnet payment collection while allowing genuine existing settlement evidence, Customer Portal views, and PDF documents to be read and verified.

## Acceptance criteria

- [ ] Implement the configured native-USDC mainnet adapter with explicit network badges (\`TESTNET DEMO\`, \`MAINNET LIMITED DEMO\`, or \`DISABLED\`) rendered on Customer Portal UI, merchant views, and generated PDF documents; testnet fallback is forbidden on mainnet.
- [ ] Reject new mainnet invoice issuance server-side and make Customer Portal checkout unavailable when disabled; client manipulation cannot bypass this server check.
- [ ] Preserve existing mainnet invoice details, customer portal views, and PDF receipts, permitting verification of genuine transfers against already-issued invoices while checkout is disabled.
- [ ] HTTP tests with controlled RPC fixtures verify disabled vs enabled state, rejected client manipulation, and preserved historical proof without sending real mainnet funds.
- [ ] Document explicit human authorization requirement before any live mainnet activation.

## Blocked by

https://github.com/yynfz/settiva/issues/4

## Blocking

https://github.com/yynfz/settiva/issues/10
`;

// ISSUE #10: Deliver a reproducible testnet payment and refund demonstration
const issue10Enhanced = `## Parent

https://github.com/yynfz/settiva/issues/1

## What to build

A reviewer can set up and evaluate the complete Settiva application incorporating InvoiceShelf features: merchant setup → itemized invoice creation → PDF invoice export → customer portal link sharing → viewed state tracking → wallet checkout → verified PDF receipt → duplicate payment retention → merchant refund → verified refund lookup.

## Acceptance criteria

- [ ] Complete the deployable landing page and full end-to-end demonstration journey incorporating InvoiceShelf features: itemized invoice issuance → PDF download → customer portal view (\`viewed\` status) → testnet payment → verified receipt PDF → second matching transfer → merchant return → verified refund lookup.
- [ ] Provide complete documentation: README, environment template, license, merchant invitation guide, test execution instructions, and clear demo boundaries.
- [ ] Reproduce cleanly from a fresh checkout with automated test harness (\`npm test\` and \`npm run test:browser\`) passing 100%.
- [ ] Record genuine testnet transaction evidence with explicit asset identity (\`Test token — no monetary value\` if using fallback; native USDC on testnet if funded).
- [ ] Preserve server-enforced mainnet-disabled defaults and truthful network status indicators across portal UI and PDF exports.
- [ ] Deliver a clean, production-ready codebase ready for hackathon review.

## Blocked by

https://github.com/yynfz/settiva/issues/8
https://github.com/yynfz/settiva/issues/9
`;

// Execute all updates
updateIssue(1, issue1Enhanced);
updateIssue(2, issue2Enhanced);
updateIssue(3, issue3Enhanced);
updateIssue(4, issue4Enhanced);
updateIssue(5, issue5Enhanced);
updateIssue(6, issue6Enhanced);
updateIssue(7, issue7Enhanced);
updateIssue(8, issue8Enhanced);
updateIssue(9, issue9Enhanced);
updateIssue(10, issue10Enhanced);

console.log(
  "All 10 GitHub issues successfully modified and aligned with InvoiceShelf!",
);
