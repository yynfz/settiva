"use client";

import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { useEffect, useState, type FormEvent } from "react";
import type { MerchantSetup, StorageGuidance } from "../lib/contracts";

export function MerchantApp({
  url,
  publishableKey,
}: {
  url: string;
  publishableKey: string;
}) {
  const [auth] = useState(() => createClient(url, publishableKey));
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const {
      data: { subscription },
    } = auth.auth.onAuthStateChange((_event, current) => {
      setSession(current);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [auth]);
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Settiva home">
          <span className="brand-mark" aria-hidden="true">
            ↗
          </span>
          Settiva<span className="brand-dot">.</span>
        </a>
        <span className="network-badge">TESTNET DEMO</span>
        {session && (
          <button
            className="text-button"
            onClick={() => void auth.auth.signOut()}
          >
            Sign out
          </button>
        )}
      </header>
      <main className="shell">
        <section className="intro">
          <span className="eyebrow">YOUR WORK. YOUR WALLET.</span>
          <h1>
            Invoice globally.
            <br />
            <em>Receive directly.</em>
          </h1>
          <p>
            A direct path from your client's wallet to yours.
            <br />
            Start with the account where you'll receive payments.
          </p>
          <div className="trust-note">
            <span aria-hidden="true">↗</span>
            <div>
              <strong>Always in your control</strong>
              <p>
                Settiva never holds your funds or asks for your private keys.
              </p>
            </div>
          </div>
        </section>
        {loading ? (
          <section className="card">
            <p role="status">Loading your session…</p>
          </section>
        ) : session ? (
          <AccountSetup key={session.user.id} session={session} />
        ) : (
          <SignIn auth={auth} />
        )}
      </main>
      <footer>
        Built for direct payments on NEAR{" "}
        <span>Testnet only · Mainnet unavailable</span>
      </footer>
    </>
  );
}
function SignIn({ auth }: { auth: SupabaseClient }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await auth.auth.signInWithPassword({
        email: String(data.get("email")).trim(),
        password: String(data.get("password")),
      });
      if (result.error)
        setError("Unable to sign in. Check your invitation and credentials.");
    } catch {
      setError("Sign-in is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <span className="eyebrow">MERCHANT ACCESS</span>
      <h2>Welcome to Settiva</h2>
      <p className="muted">Sign in with your invited merchant account.</p>
      <form onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="you@studio.com"
          autoComplete="username"
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="fine-print">
        Access is by invitation. Contact your Settiva operator if you need an
        account.
      </p>
    </section>
  );
}
function AccountSetup({ session }: { session: Session }) {
  const [setup, setSetup] = useState<MerchantSetup | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [account, setAccount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [guidance, setGuidance] = useState<StorageGuidance | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/merchant", {
      headers: { authorization: `Bearer ${session.access_token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Unable to load merchant setup.");
        setSetup(data);
        setDisplayName(data.profile?.display_name || "");
        setAccount(data.profile?.testnet_wallet_id || "");
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load merchant setup.",
          );
      });
    return () => controller.abort();
  }, [session.access_token]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setGuidance(null);
    try {
      const response = await fetch("/api/merchant", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${session.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          displayName,
          receivingAccount: account,
          network: "testnet",
          confirmsControl: confirmed,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Unable to save this account.");
        if (data.code === "storage_required") setGuidance(data.details);
        return;
      }
      setSetup(data);
      setConfirmed(false);
      setMessage(
        "Receiving account saved. Account, token metadata, and storage checks passed.",
      );
    } catch {
      setError("Unable to complete the check. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <div className="card-heading">
        <span className="eyebrow">RECEIVING ACCOUNT</span>
        <span className="step">01 / SETUP</span>
      </div>
      <h2>Where should payments arrive?</h2>
      <p className="muted">
        Confirm your destination before creating an invoice.
      </p>
      {setup && (
        <div className="asset">
          <span className="asset-symbol" aria-hidden="true">
            $
          </span>
          <div>
            <strong>{setup.asset.symbol} on NEAR</strong>
            <small>{setup.asset.label}</small>
          </div>
          <span className="tag">Testnet</span>
        </div>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice success">
          {message}
        </p>
      )}
      {!setup && !error && <p role="status">Loading your receiving account…</p>}
      {setup && (
        <form onSubmit={submit}>
          <label htmlFor="displayName">Display name</label>
          <input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            required
            placeholder="Your studio or business"
          />
          <label htmlFor="account">Receiving account</label>
          <input
            id="account"
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              setConfirmed(false);
            }}
            autoCapitalize="none"
            spellCheck={false}
            maxLength={64}
            required
            placeholder="your-studio.testnet"
            aria-describedby="account-hint"
          />
          <p id="account-hint" className="field-hint">
            Use the exact account you control on NEAR testnet.
          </p>
          <label className="confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              required
            />
            <span>I control this receiving account</span>
          </label>
          <p className="fine-print">
            You are confirming the destination. These checks do not prove wallet
            ownership.
          </p>
          <button className="primary" disabled={busy || !confirmed}>
            {busy ? "Checking account…" : "Check and save account"}
            <span aria-hidden="true">↗</span>
          </button>
        </form>
      )}
      {guidance && (
        <section className="storage-guide">
          <h3>Register to receive this token</h3>
          <ol>
            <li>
              Open your own wallet on <strong>NEAR testnet</strong>.
            </li>
            <li>
              Use its contract-call tools to call <code>{guidance.method}</code>{" "}
              on <code>{guidance.contract}</code>.
            </li>
            <li>
              Set <code>account_id</code> to{" "}
              <code>{guidance.args.account_id}</code> and{" "}
              <code>registration_only</code> to <code>true</code>.
            </li>
            <li>
              Review a minimum deposit of{" "}
              <code>{guidance.minimumDepositYocto}</code> yoctoNEAR plus gas,
              then approve in your wallet.
            </li>
            <li>Return here and check the account again.</li>
          </ol>
          <p>
            Settiva does not submit this transaction. If your wallet has no
            contract-call tools, ask your operator for assistance.
          </p>
        </section>
      )}
      {setup?.profile && (
        <div className="saved-account">
          <span className="status-dot" />
          <div>
            <strong>Saved receiving account</strong>
            <p>{setup.profile.testnet_wallet_id}</p>
            <small>
              Checked {new Date(setup.profile.checked_at).toLocaleString()}.
              Storage is checked again before invoice issuance.
            </small>
          </div>
        </div>
      )}
      <p className="fine-print bottom-note">
        Receiving this token requires storage registration. A separate wallet
        approval and NEAR deposit may be needed; transfers also require NEAR for
        gas.
      </p>
    </section>
  );
}
