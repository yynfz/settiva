# Reviewer demonstration

The public `/demo` route describes the human journey. Run `npm run test:browser` for all automated browser coverage. `tests/journey.browser.test.ts` follows a complete invoice from merchant setup through verified refund lookup; wallet/RPC events in that test are controlled fixtures.

## Live testnet prerequisites

Use an invited merchant and two testnet accounts you control: a receiving account and a payer account. Use the configured Circle testnet token if funded, or a separately verified explicitly configured fallback. Both accounts need NEAR for gas and token storage. The payer needs enough tokens for two identical full invoice payments. Register token storage through the wallet when needed. Run `npm run near:check -- <account>` for both accounts before the demonstration.

Follow `/demo`: merchant setup → itemized invoice → invoice PDF → portal view and VIEWED status → wallet-approved payment → verified receipt PDF → distinct duplicate transfer → merchant-approved full return → refund verification → hash lookup. Return transactions are authorized in the merchant's own wallet using the exact token contract and full amount shown in the overpayment ledger, with the original payer as recipient. The applied invoice payment is never refunded by this workflow.

After the invoice is paid, open **Already sent a payment? Verify it here** under **Verify an existing transfer**. Enter the second transaction hash and original payer account. This form only verifies an existing transfer. Operators can also use the public verification endpoint:

```bash
# Values come from your existing invoice and wallet activity. No signing occurs here.
curl -X POST "$SETTIVA_ORIGIN/api/portal/$PORTAL_TOKEN/verify" \
  -H 'content-type: application/json' \
  --data-binary @/path/to/second-transfer.json
```

The JSON body contains only `transactionHash` and `senderAccount`. The server derives payment terms from the invoice. Never include credentials or private client information. A repeated hash is idempotent; a distinct matching hash is an overpayment. Check the original receipt remains unchanged after the refund.

## Genuine evidence capture

After all three wallet-approved transfers finalize, create a private JSON manifest outside the repository with these fields (replace every placeholder):

```json
{
  "network": "testnet",
  "receivingAccount": "YOUR_RECEIVING_ACCOUNT.testnet",
  "amountAtomic": "12500000",
  "paymentReference": "COPY_THE_64_HEX_CHARACTER_INVOICE_REFERENCE",
  "transfers": [
    { "role": "applied", "hash": "FIRST_PAYMENT_HASH", "sender": "PAYER.testnet" },
    { "role": "overpayment", "hash": "SECOND_DISTINCT_PAYMENT_HASH", "sender": "PAYER.testnet" },
    { "role": "refund", "hash": "RETURN_HASH", "sender": "YOUR_RECEIVING_ACCOUNT.testnet" }
  ]
}
```

The amount above is an example, not a requirement: copy the invoice's actual atomic amount. With six decimals, 12.50 tokens is 12500000 atomic units. The payment reference must exactly match the issued invoice. The refund must return the full duplicate payment to its original sender. Do not include the portal token, keys, passwords, or private client labels in the manifest.

```bash
npm run demo:evidence -- /path/to/private-demo-manifest.json
```

This read-only recorder checks testnet chain identity, configured contract metadata, three distinct finalized successful `ft_transfer` transactions, exact invoice terms, deposit, successful execution receipt, and block timestamps. It writes `docs/TESTNET_EVIDENCE.md` only when every check passes. Review the report before sharing: transaction hashes and account IDs are public evidence. The recorder proves onchain matches against declared terms; use the portal to show application classification and receipt behavior as well.

Until the report contains real verified hashes, genuine testnet demonstration evidence is incomplete and issue #10 must stay open. Recording a video, publishing the repository, pushing a release, and submitting to the hackathon require the human's separate authorization. The repository's hackathon instructions describe that process.
