"use client";

import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { useEffect, useState, type FormEvent } from "react";
import type {
  CreateInvoiceItemInput,
  Invoice,
  MerchantSetup,
  StorageGuidance,
} from "../lib/contracts";

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
            Issue itemized invoices and settle on NEAR.
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
          <MerchantDashboard key={session.user.id} session={session} />
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

function MerchantDashboard({ session }: { session: Session }) {
  const [setup, setSetup] = useState<MerchantSetup | null>(null);
  const [activeTab, setActiveTab] = useState<"invoices" | "account">("account");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {setup?.profile && (
        <div className="nav-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === "invoices"}
            className={`tab-btn ${activeTab === "invoices" ? "active" : ""}`}
            onClick={() => setActiveTab("invoices")}
          >
            Invoices
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "account"}
            className={`tab-btn ${activeTab === "account" ? "active" : ""}`}
            onClick={() => setActiveTab("account")}
          >
            Receiving Account
          </button>
        </div>
      )}

      {/* Account Setup View */}
      <div
        style={{
          display:
            activeTab === "account" || !setup?.profile ? "block" : "none",
        }}
      >
        <AccountSetup session={session} onSetupLoaded={setSetup} />
      </div>

      {/* Invoices View */}
      {setup?.profile && (
        <div style={{ display: activeTab === "invoices" ? "block" : "none" }}>
          <InvoiceManager session={session} setup={setup} />
        </div>
      )}
    </div>
  );
}

function AccountSetup({
  session,
  onSetupLoaded,
}: {
  session: Session;
  onSetupLoaded?: (setup: MerchantSetup) => void;
}) {
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
        onSetupLoaded?.(data);
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
  }, [session.access_token, onSetupLoaded]);

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
      onSetupLoaded?.(data);
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

function InvoiceManager({
  session,
  setup,
}: {
  session: Session;
  setup: MerchantSetup;
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form state
  const [clientLabel, setClientLabel] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<CreateInvoiceItemInput[]>([
    { description: "", quantity: 1, unitPrice: "" },
  ]);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");

  async function loadInvoices() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/invoices", {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load invoices");
      setInvoices(data.invoices || []);
    } catch (err: any) {
      setError(err.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInvoices();
  }, [session.access_token]);

  function addItem() {
    setItems([...items, { description: "", quantity: 1, unitPrice: "" }]);
  }

  function removeItem(index: number) {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  }

  function updateItem(
    index: number,
    field: keyof CreateInvoiceItemInput,
    value: string | number,
  ) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  }

  const calculatedTotal = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    return sum + qty * price;
  }, 0);

  async function handleCreateInvoice(e: FormEvent) {
    e.preventDefault();
    setFormBusy(true);
    setFormError("");

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          clientLabel,
          description: description || undefined,
          dueDate: dueDate || undefined,
          items: items.map((it) => ({
            description: it.description,
            quantity: Number(it.quantity),
            unitPrice: it.unitPrice,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create invoice");
      }

      setCreating(false);
      setClientLabel("");
      setDescription("");
      setDueDate("");
      setItems([{ description: "", quantity: 1, unitPrice: "" }]);
      await loadInvoices();
    } catch (err: any) {
      setFormError(err.message || "Failed to create invoice");
    } finally {
      setFormBusy(false);
    }
  }

  async function copyPortalLink(invoice: Invoice) {
    try {
      await navigator.clipboard.writeText(invoice.portal_url);
      setCopiedId(invoice.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
      prompt("Copy Customer Portal link:", invoice.portal_url);
    }
  }

  return (
    <section className="card">
      <div className="invoice-toolbar">
        <div>
          <span className="eyebrow">INVOICE MANAGEMENT</span>
          <h2>{creating ? "New Invoice" : "Your Invoices"}</h2>
        </div>
        <button
          className="btn-sm btn-primary"
          onClick={() => {
            setCreating(!creating);
            setFormError("");
          }}
        >
          {creating ? "← Back to List" : "+ Create Invoice"}
        </button>
      </div>

      {creating ? (
        <form onSubmit={handleCreateInvoice}>
          <p className="muted" style={{ marginBottom: "16px" }}>
            Create an itemized invoice. Terms are immutable once issued.
          </p>

          <label htmlFor="clientLabel">Client Label (Private)</label>
          <input
            id="clientLabel"
            value={clientLabel}
            onChange={(e) => setClientLabel(e.target.value)}
            placeholder="e.g. Acme Studio - Q4 Design"
            required
            maxLength={100}
          />
          <p className="field-hint">Visible only to you for organization.</p>

          <label htmlFor="invDescription">Internal Notes (Optional)</label>
          <input
            id="invDescription"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Project milestone 1 delivery"
            maxLength={1000}
          />

          <label htmlFor="dueDate">Advisory Due Date (Optional)</label>
          <input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />

          <div style={{ marginTop: "24px" }}>
            <span className="eyebrow">LINE ITEMS</span>
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ width: "50%" }}>Description</th>
                  <th style={{ width: "15%" }}>Qty</th>
                  <th style={{ width: "20%" }}>Price ({setup.asset.symbol})</th>
                  <th style={{ width: "15%" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td>
                      <input
                        placeholder="Service or item description"
                        value={item.description}
                        onChange={(e) =>
                          updateItem(idx, "description", e.target.value)
                        }
                        required
                        maxLength={200}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0.0001"
                        step="any"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(
                            idx,
                            "quantity",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        required
                      />
                    </td>
                    <td>
                      <input
                        placeholder="10.00"
                        value={item.unitPrice}
                        onChange={(e) =>
                          updateItem(idx, "unitPrice", e.target.value)
                        }
                        required
                      />
                    </td>
                    <td>
                      {items.length > 1 && (
                        <button
                          type="button"
                          className="btn-sm"
                          onClick={() => removeItem(idx)}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button
              type="button"
              className="btn-sm"
              onClick={addItem}
              style={{ marginTop: "8px" }}
            >
              + Add Line Item
            </button>
          </div>

          <div
            style={{
              marginTop: "20px",
              padding: "16px",
              background: "#f4f7f2",
              borderRadius: "8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <strong>Total Amount:</strong>
            <span style={{ fontSize: "18px", fontWeight: "700" }}>
              {calculatedTotal.toFixed(2)} {setup.asset.symbol}
            </span>
          </div>

          {formError && (
            <p
              role="alert"
              className="notice error"
              style={{ marginTop: "16px" }}
            >
              {formError}
            </p>
          )}

          <button
            className="primary"
            disabled={formBusy}
            style={{ marginTop: "20px" }}
          >
            {formBusy ? "Creating invoice…" : "Create and freeze invoice ↗"}
          </button>
        </form>
      ) : (
        <div>
          {loading && <p role="status">Loading your invoices…</p>}
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}

          {!loading && invoices.length === 0 && (
            <div className="empty-state">
              <h3>No invoices yet</h3>
              <p>
                Create your first itemized invoice to start receiving payments.
              </p>
              <button
                className="btn-sm btn-primary"
                onClick={() => setCreating(true)}
              >
                Create Invoice
              </button>
            </div>
          )}

          <div className="invoice-list">
            {invoices.map((inv) => (
              <div key={inv.id} className="invoice-card">
                <div className="invoice-card-main">
                  <div className="invoice-card-header">
                    <span className="invoice-num">{inv.invoice_number}</span>
                    <span
                      className={`status-pill ${
                        inv.status === "paid"
                          ? "paid"
                          : inv.is_overdue
                            ? "overdue"
                            : inv.status === "viewed"
                              ? "viewed"
                              : "unpaid"
                      }`}
                    >
                      {inv.is_overdue && inv.status !== "paid"
                        ? "OVERDUE"
                        : inv.status}
                    </span>
                  </div>
                  <span className="invoice-client">{inv.client_label}</span>
                  {inv.due_date && (
                    <small style={{ color: "var(--muted)", fontSize: "11px" }}>
                      Due: {inv.due_date}
                    </small>
                  )}
                </div>

                <div className="invoice-card-meta">
                  <div className="invoice-amount">
                    {inv.amount_display} {inv.asset_symbol}
                  </div>
                  <div className="invoice-actions">
                    <button
                      className="btn-sm"
                      onClick={() => copyPortalLink(inv)}
                      title="Copy Customer Portal link"
                    >
                      {copiedId === inv.id ? "✓ Copied!" : "Copy Link"}
                    </button>
                    <a
                      href={`/api/invoices/${inv.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-sm"
                      title="Download PDF"
                    >
                      PDF
                    </a>
                    <a
                      href={inv.portal_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-sm"
                      title="Open Customer Portal"
                    >
                      Portal ↗
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
