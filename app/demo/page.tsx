import Link from "next/link";
export default function DemoPage() {
  const steps = [
    [
      "Configure your receiving account",
      "Sign in with an invited merchant account. Enter your testnet receiving account and confirm the destination. Register token storage separately in your wallet if requested.",
    ],
    [
      "Issue and share",
      "Create an itemized invoice in the Invoices tab. Download the invoice PDF and copy its Customer Portal link. Issued payment terms are fixed.",
    ],
    [
      "Open the Customer Portal",
      "Open the shared link as the payer. The invoice records VIEWED. Check the asset, network, amount, destination, and payment memo.",
    ],
    [
      "Approve and verify payment",
      "Connect a testnet wallet and authorize the exact transfer. Settiva checks finalized onchain evidence before marking PAID. Download the verified payment receipt PDF.",
    ],
    [
      "Demonstrate duplicate handling",
      "For a controlled testnet demonstration only, make a second distinct transfer with exactly the same amount, destination, asset, and memo. Use Verify payment to record its hash. The original receipt remains unchanged.",
    ],
    [
      "Return the overpayment",
      "The merchant opens Check Overpayments / Refunds, reviews the original payer and full return amount, and authorizes the return in their own wallet. Submit its hash with Verify Refund.",
    ],
    [
      "Look up refund evidence",
      "Open Look up a transfer from the portal and enter the second payment hash. Confirm REFUNDED and inspect the verified return hash. Download the receipt for that specific transfer.",
    ],
  ];
  return (
    <main className="demo-guide">
      <Link href="/">← Settiva</Link>
      <span className="network-badge">TESTNET DEMO</span>
      <h1>Demo walkthrough</h1>
      <p>
        Follow one invoice from merchant setup to a verified payment and refund.
        Testnet assets have no monetary value. Merchants need an invitation;
        payers need only the portal link and a testnet wallet.
      </p>
      <ol>
        {steps.map(([title, description]) => (
          <li key={title}>
            <h2>{title}</h2>
            <p>{description}</p>
          </li>
        ))}
      </ol>
      <aside>
        <h2>What the demonstration proves</h2>
        <p>
          Automated tests use controlled wallets and RPC responses with real
          isolated PostgreSQL and RLS. Genuine transfers require your wallet
          approval. A wallet confirmation alone is not a verified receipt. If
          verification is delayed, retry verification before sending again.
        </p>
        <p>
          Mainnet collection is disabled by default. This walkthrough authorizes
          no mainnet activity.
        </p>
      </aside>
      <Link href="/">Open merchant sign-in →</Link>
    </main>
  );
}
