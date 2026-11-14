"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { NearConnector } from "@hot-labs/near-connect";
import type { PublicInvoice } from "@/lib/contracts";

export function PaymentCheckout({
  token,
  invoice,
}: {
  token: string;
  invoice: PublicInvoice;
}) {
  const router = useRouter();
  const connector = useRef<NearConnector | null>(null);
  const [sender, setSender] = useState("");
  const [connectedAccount, setConnectedAccount] = useState("");
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  async function connect() {
    setBusy(true);
    setMessage("");
    try {
      if (!connector.current) {
        const { NearConnector } = await import("@hot-labs/near-connect");
        connector.current = new NearConnector({
          network: "testnet",
          autoConnect: false,
          features: { signAndSendTransaction: true, signInWithoutAddKey: true },
        });
      }
      const wallet = await connector.current.connect();
      const accounts = await wallet.getAccounts({ network: "testnet" });
      if (!accounts[0]) throw new Error("No testnet account was selected.");
      setConnectedAccount(accounts[0].accountId);
      setSender(accounts[0].accountId);
    } catch {
      setMessage(
        "Wallet connection was cancelled or unavailable. You can try connecting again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function verify(transactionHash = hash, senderAccount = sender) {
    setBusy(true);
    setMessage("Checking final settlement…");
    try {
      const response = await fetch(`/api/portal/${token}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionHash, senderAccount }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Verification unavailable.");
      setMessage(
        result.classification === "overpayment"
          ? "An additional matching payment was received. The original receipt remains unchanged; contact the merchant about a refund."
          : "Payment verified.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        `${error instanceof Error ? error.message : "Verification unavailable."} Retry verification rather than sending another payment.`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    if (!connector.current || invoice.network !== "testnet" || busy) return;
    setBusy(true);
    setMessage("Review and authorize this transfer in your wallet.");
    try {
      const wallet = await connector.current.wallet();
      const accounts = await wallet.getAccounts({ network: "testnet" });
      if (!accounts.some((account) => account.accountId === connectedAccount))
        throw new Error("Reconnect the selected payer account.");
      const outcome = await wallet.signAndSendTransaction({
        network: "testnet",
        signerId: connectedAccount,
        receiverId: invoice.asset.contract,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "ft_transfer",
              args: {
                receiver_id: invoice.receivingAccount,
                amount: invoice.amountAtomic,
                memo: invoice.paymentReference,
              },
              gas: "30000000000000",
              deposit: "1",
            },
          },
        ],
      });
      setSubmitted(true);
      const transactionHash = outcome?.transaction?.hash;
      if (!transactionHash)
        throw new Error(
          "The wallet did not return a transaction hash. Check its activity before attempting another payment.",
        );
      setHash(transactionHash);
      await verify(transactionHash, connectedAccount);
    } catch (error) {
      setMessage(
        `${error instanceof Error ? error.message : "Wallet approval was cancelled or unavailable."} Check wallet activity before trying another transfer.`,
      );
    } finally {
      setBusy(false);
    }
  }
  if (invoice.network !== "testnet")
    return <p>Mainnet payments are unavailable.</p>;
  return (
    <section
      className="bg-white rounded-xl border p-6 mt-6 space-y-3"
      aria-label="Pay invoice"
    >
      <h2 className="text-xl font-bold">Pay this invoice</h2>
      <p>
        {invoice.amountDisplay} {invoice.asset.symbol} directly to{" "}
        <strong>{invoice.receivingAccount}</strong> on NEAR testnet.
      </p>
      <p className="text-sm">
        {invoice.asset.label}. The transfer attaches 1 yoctoNEAR; gas costs NEAR
        separately. Token storage registration may require a separate wallet
        approval.
      </p>
      {!connectedAccount ? (
        <button disabled={busy} onClick={connect} className="primary-button">
          Connect testnet wallet
        </button>
      ) : (
        <>
          <p>Payer: {connectedAccount}</p>
          <button
            disabled={busy || submitted}
            onClick={pay}
            className="primary-button"
          >
            Authorize payment
          </button>
        </>
      )}
      <details>
        <summary>Already sent a payment? Verify it here</summary>
        <label className="block">
          Sender account
          <input
            value={sender}
            onChange={(event) => setSender(event.target.value)}
          />
        </label>
        <label className="block">
          Transaction hash
          <input
            value={hash}
            onChange={(event) => setHash(event.target.value)}
          />
        </label>
        <button
          disabled={busy || !hash || !sender}
          onClick={() => void verify()}
          className="primary-button"
        >
          Verify payment
        </button>
      </details>
      <p role="status">{message}</p>
    </section>
  );
}
