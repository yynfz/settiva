"use client";
import { useState } from "react";
import type { lookupTransfer } from "@/lib/server/payments";
export function TransferLookup({ token }: { token: string }) {
  const [hash, setHash] = useState("");
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof lookupTransfer>
  > | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Look up a transfer</h1>
      <p>Check a known payment hash for this invoice.</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          setResult(null);
          try {
            const response = await fetch(
              `/api/portal/${token}/lookup?hash=${encodeURIComponent(hash)}`,
            );
            const body = await response.json();
            if (!response.ok) throw new Error(body.error);
            setResult(body);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Lookup failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Transaction hash
          <input
            value={hash}
            onChange={(e) => setHash(e.target.value)}
            required
          />
        </label>
        <button disabled={busy}>Look up transfer</button>
      </form>
      <p role="alert">{error}</p>
      {result && (
        <section aria-label="Transfer status">
          <p>Status: {result.status}</p>
          <p className="break-all">{result.transactionHash}</p>
          {result.classification && <p>{result.classification}</p>}
          {result.refundStatus && <p>Refund: {result.refundStatus}</p>}
          {result.refund && (
            <a href={result.refund.explorerUrl}>
              {result.refund.transactionHash}
            </a>
          )}
          {result.details && (
            <p>
              {result.details.amountDisplay} {result.details.assetSymbol} from{" "}
              {result.details.senderAccount} to{" "}
              {result.details.receivingAccount} on {result.details.network}
            </p>
          )}
          {result.details && (
            <a
              className="block"
              href={`/api/portal/${token}/lookup?hash=${encodeURIComponent(result.transactionHash)}&format=pdf`}
            >
              Download transfer receipt
            </a>
          )}
        </section>
      )}
      <a href={`/portal/${token}`}>Back to invoice</a>
    </main>
  );
}
