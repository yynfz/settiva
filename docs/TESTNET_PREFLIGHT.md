# Testnet receiving-account preflight

Read-only check performed on 2026-11-13 at 23:24:35 UTC (14 November WIB) using the configured testnet RPC. No transaction was signed or submitted.

- RPC reported chain ID `testnet`.
- Circle-listed contract: `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`.
- Live metadata: spec `ft-1.0.0`, name `USDC`, symbol `USDC`, decimals `6`.
- Live storage bounds: minimum and maximum `1250000000000000000000` yoctoNEAR (`0.00125 NEAR`). Gas is separate.
- Circle's public faucet lists NEAR Testnet as an available network. This is a candidate funding path, not evidence that any wallet was funded.
- No receiving account was supplied for the check. Account existence, its storage registration, and funded-wallet proof remain unverified.

The native Circle token can therefore remain the configured default. The application also supports an explicitly configured fallback test token. No fallback contract was invented, deployed, or funded. The funding investigation found a documented faucet path within the one-hour limit; completing it still requires a supplied account and human faucet interaction. If that path is unusable within the time box for the chosen accounts, use the approved explicitly labeled fallback.

Repeat `npm run near:check -- <account>` to verify current read-only account facts. Check both development accounts before a payment demonstration; a positive token balance alone does not establish a successful transfer.

Sources: [Circle addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses), [Circle faucet](https://faucet.circle.com/), [NEAR storage standard](https://docs.near.org/primitives/ft/standard). Live query evidence above came from the configured RPC, not from mocked tests.
