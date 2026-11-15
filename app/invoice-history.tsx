"use client";
import { useState } from "react";
type History = {
  attempts: {
    transaction_hash: string;
    sender_account: string;
    outcome: string;
    error_code: string | null;
  }[];
  payments: {
    transaction_hash: string;
    applied: boolean;
    refund_status: string | null;
    refund_hash: string | null;
  }[];
};
export function InvoiceHistory({
  invoiceId,
  token,
}: {
  invoiceId: string;
  token: string;
}) {
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details className="invoice-history">
      <summary
        onClick={() => {
          setBusy(true);
          setError("");
          fetch(`/api/invoices/${invoiceId}/history`, {
            headers: { authorization: `Bearer ${token}` },
          })
            .then(async (response) => {
              if (!response.ok)
                throw new Error("History is temporarily unavailable.");
              setHistory(await response.json());
            })
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        Private payment history
      </summary>
      {busy && <p role="status">Loading history…</p>}
      {error && <p role="alert">{error}</p>}
      {history && (
        <>
          <ul>
            {history.attempts.map((a) => (
              <li key={a.transaction_hash}>
                <code>{a.transaction_hash}</code> from {a.sender_account}:{" "}
                {a.outcome}
                {a.error_code && ` (${a.error_code})`}
              </li>
            ))}
          </ul>
          <ul>
            {history.payments.map((p) => (
              <li key={p.transaction_hash}>
                <code>{p.transaction_hash}</code>:{" "}
                {p.applied ? "Applied payment" : "Overpayment"}
                {p.refund_status && ` · ${p.refund_status}`}
                {p.refund_hash && (
                  <>
                    {" "}
                    · Return: <code>{p.refund_hash}</code>
                  </>
                )}
              </li>
            ))}
          </ul>
          {history.attempts.length === 0 && history.payments.length === 0 && (
            <p>No submitted payment evidence yet.</p>
          )}
        </>
      )}
    </details>
  );
}
