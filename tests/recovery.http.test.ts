import { afterEach, beforeEach, expect, test } from "vitest";
import { environment, request } from "./support/context";
import {
  issuedInvoice,
  evidence,
  hash,
  verify,
} from "./support/payment-fixture";

beforeEach(async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
});

afterEach(async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
});

test("a pending attempt is persisted and visible in GET /api/portal/[token] on page reload", async () => {
  const invoice = await issuedInvoice();
  // Seed transaction evidence but set the RPC offline so verification is deferred.
  await evidence(invoice);
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "offline" }),
  });

  // First attempt: RPC unavailable → 503, but attempt record is persisted as pending.
  const firstResponse = await verify(invoice.access_token);
  expect(firstResponse.status).toBe(503);

  // PUT the RPC back online.
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "ready" }),
  });

  // GET the portal — should expose the pending attempt so the portal can resume.
  const portal = await (
    await request(`/api/portal/${invoice.access_token}`)
  ).json();
  expect(portal.pendingAttempts).toHaveLength(1);
  expect(portal.pendingAttempts[0]).toMatchObject({
    transaction_hash: hash,
    sender_account: "payer.testnet",
    outcome: "rpc_unavailable",
  });
});

test("re-submitting the same hash on page reload resolves the pending attempt without creating a duplicate", async () => {
  const invoice = await issuedInvoice();
  await evidence(invoice);
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "offline" }),
  });
  await verify(invoice.access_token); // → 503, attempt persisted as pending.

  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "ready" }),
  });

  // Resume verification for the same hash.
  const second = await verify(invoice.access_token);
  expect(second.status).toBe(200);

  // Portal now shows no pending attempts (resolved to verified).
  const portal = await (
    await request(`/api/portal/${invoice.access_token}`)
  ).json();
  expect(portal.pendingAttempts).toHaveLength(0);

  // Invoice is paid.
  expect(portal.invoice.status).toBe("paid");
});

test("a failed attempt does not downgrade an already-paid invoice", async () => {
  const invoice = await issuedInvoice();
  // Pay the invoice successfully first.
  await evidence(invoice);
  expect((await verify(invoice.access_token)).status).toBe(200);

  // Now try to verify a mismatched hash — should fail but not touch the paid status.
  const badHash = "B".repeat(44);
  const mismatchResponse = await request(
    `/api/portal/${invoice.access_token}/verify`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transactionHash: badHash,
        senderAccount: "payer.testnet",
      }),
    },
  );
  expect(mismatchResponse.status).toBe(422);

  // Invoice status remains paid.
  const portal = await (
    await request(`/api/portal/${invoice.access_token}`)
  ).json();
  expect(portal.invoice.status).toBe("paid");
});

test("a mismatch attempt does not downgrade an unpaid invoice status", async () => {
  const invoice = await issuedInvoice();
  // Seed a valid evidence object first, then verify a bad hash.
  await evidence(invoice);
  const badHash = "C".repeat(44);
  const mismatch = await request(`/api/portal/${invoice.access_token}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transactionHash: badHash,
      senderAccount: "payer.testnet",
    }),
  });
  expect(mismatch.status).toBe(422);

  const portal = await (
    await request(`/api/portal/${invoice.access_token}`)
  ).json();
  expect(portal.invoice.status).not.toBe("paid");
});

test("verification endpoint is rate-limited after too many distinct hashes", async () => {
  const invoice = await issuedInvoice();

  // Set RPC offline so each attempt records but doesn't verify.
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "offline" }),
  });

  // Send 10 distinct hashes (the rate limit max) using valid Base58 characters.
  const chars = "123456789A";
  for (const c of chars) {
    await request(`/api/portal/${invoice.access_token}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transactionHash: c.repeat(44),
        senderAccount: "payer.testnet",
      }),
    });
  }

  // The 11th distinct hash should be rate-limited.
  const rateLimited = await request(
    `/api/portal/${invoice.access_token}/verify`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transactionHash: "B".repeat(44),
        senderAccount: "payer.testnet",
      }),
    },
  );
  expect(rateLimited.status).toBe(429);
});

test("rate limit does not apply to re-submitting the same hash", async () => {
  const invoice = await issuedInvoice();
  await evidence(invoice);

  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "offline" }),
  });

  // Submit the original hash once while offline (records attempt).
  await verify(invoice.access_token);

  // Exhaust the rate limit with 10 other hashes using valid Base58 characters.
  for (const c of "123456789B") {
    await request(`/api/portal/${invoice.access_token}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transactionHash: c.repeat(44),
        senderAccount: "payer.testnet",
      }),
    });
  }

  // Bring RPC back online.
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "ready" }),
  });

  // Re-submitting the original correct hash should still work (not rate-limited).
  const response = await verify(invoice.access_token);
  expect(response.status).toBe(200);
});
