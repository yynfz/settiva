# Genuine testnet transaction evidence

Status: **not recorded**. No genuine applied-payment, duplicate-payment, and refund transaction hashes have been supplied for this demonstration. Automated test fixtures are not blockchain evidence.

Before marking issue #10 complete, follow [the demonstration guide](DEMO.md), approve the three transfers in the relevant wallets, and run `npm run demo:evidence -- /path/to/private-demo-manifest.json`. The read-only recorder verifies finalized RPC evidence and replaces this file only after every transfer matches. Do not put private keys, passwords, Supabase credentials, or portal access tokens in the evidence report.
