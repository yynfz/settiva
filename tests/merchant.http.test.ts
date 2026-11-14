import { beforeEach, expect, test } from "vitest";
import { environment, request } from "./support/context";

beforeEach(async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
});

test("an unauthenticated visitor cannot read merchant configuration", async () => {
  const response = await request("/api/merchant");
  expect(response.status).toBe(401);
});

test("an invited merchant can read their empty receiving-account configuration", async () => {
  const response = await request("/api/merchant", {
    headers: { authorization: `Bearer ${environment().aliceToken}` },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    profile: null,
    network: "testnet",
    mainnetEnabled: false,
  });
});

test("a confirmed and registered receiving account survives a fresh request and remains merchant-private", async () => {
  const response = await request("/api/merchant", {
    method: "PUT",
    headers: {
      authorization: `Bearer ${environment().aliceToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      displayName: "Alice Studio",
      receivingAccount: "alice.testnet",
      network: "testnet",
      confirmsControl: true,
    }),
  });
  expect(response.status).toBe(200);
  const own = await request("/api/merchant", {
    headers: { authorization: `Bearer ${environment().aliceToken}` },
  });
  expect(await own.json()).toMatchObject({
    profile: {
      display_name: "Alice Studio",
      testnet_wallet_id: "alice.testnet",
      asset_symbol: "USDC",
      token_decimals: 6,
    },
  });
  const other = await request("/api/merchant", {
    headers: { authorization: `Bearer ${environment().bobToken}` },
  });
  expect(await other.json()).toMatchObject({ profile: null });
});

test("a signed-in but uninvited identity cannot read or save merchant setup", async () => {
  const headers = {
    authorization: `Bearer ${environment().outsiderToken}`,
    "content-type": "application/json",
  };
  expect((await request("/api/merchant", { headers })).status).toBe(403);
  expect(
    (
      await request("/api/merchant", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          displayName: "Outsider",
          receivingAccount: "outsider.testnet",
          network: "testnet",
          confirmsControl: true,
        }),
      })
    ).status,
  ).toBe(403);
});

test("a forged access token cannot read a merchant profile", async () => {
  expect(
    (
      await request("/api/merchant", {
        headers: { authorization: "Bearer not-a-valid-token" },
      })
    ).status,
  ).toBe(401);
});

test("public registration is rejected by the database invitation guard", async () => {
  const response = await fetch(`${environment().supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: environment().anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: "uninvited@example.test",
      password: "test-only-password",
      data: { settiva_invited: true },
    }),
  });
  expect(response.status).toBe(403);
});

test("direct data access cannot expose another merchant or bypass preflight writes", async () => {
  await save(validSetup);
  const { supabaseUrl, anonKey, aliceToken, bobToken } = environment();
  const aliceHeaders = {
    apikey: anonKey,
    authorization: `Bearer ${aliceToken}`,
    "content-type": "application/json",
  };
  const own = await fetch(`${supabaseUrl}/rest/v1/merchant_profiles?select=*`, {
    headers: aliceHeaders,
  });
  expect(await own.json()).toMatchObject([{ display_name: "Alice Studio" }]);
  const others = await fetch(
    `${supabaseUrl}/rest/v1/merchant_profiles?select=*`,
    { headers: { apikey: anonKey, authorization: `Bearer ${bobToken}` } },
  );
  expect(await others.json()).toEqual([]);
  const overwrite = await fetch(
    `${supabaseUrl}/rest/v1/merchant_profiles?user_id=eq.11111111-1111-4111-8111-111111111111`,
    {
      method: "PATCH",
      headers: aliceHeaders,
      body: JSON.stringify({ testnet_wallet_id: "unchecked.testnet" }),
    },
  );
  expect(overwrite.status).toBe(403);
  const selfInvite = await fetch(`${supabaseUrl}/rest/v1/merchant_access`, {
    method: "POST",
    headers: {
      ...aliceHeaders,
      authorization: `Bearer ${environment().outsiderToken}`,
    },
    body: JSON.stringify({ user_id: "33333333-3333-4333-8333-333333333333" }),
  });
  expect(selfInvite.status).toBe(403);
  const anonymous = await fetch(
    `${supabaseUrl}/rest/v1/merchant_profiles?select=*`,
    { headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` } },
  );
  expect(anonymous.status).toBe(401);
});

const validSetup = {
  displayName: "Alice Studio",
  receivingAccount: "alice.testnet",
  network: "testnet",
  confirmsControl: true,
};
async function save(input: unknown) {
  return request("/api/merchant", {
    method: "PUT",
    headers: {
      authorization: `Bearer ${environment().aliceToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

test.each([
  { ...validSetup, confirmsControl: false },
  { ...validSetup, receivingAccount: "Alice..testnet" },
  { ...validSetup, receivingAccount: "a" },
  { ...validSetup, network: "mainnet" },
  { ...validSetup, token_contract_id: "attacker.testnet" },
  { ...validSetup, user_id: "22222222-2222-4222-8222-222222222222" },
])(
  "rejects invalid, unconfirmed, or client-overridden setup: %j",
  async (input) => {
    expect((await save(input)).status).toBe(400);
  },
);

test.each([
  ["wrong-metadata", 422, "token_metadata_mismatch"],
  ["wrong-decimals", 422, "token_metadata_mismatch"],
  ["wrong-network", 503, "wrong_network"],
  ["missing-account", 422, "account_missing"],
  ["offline", 503, "rpc_unavailable"],
] as const)(
  "does not save an account when the external check reports %s",
  async (scenario, status, code) => {
    await save(validSetup);
    await fetch(`${environment().supabaseUrl}/__scenario`, {
      method: "POST",
      body: JSON.stringify({ scenario }),
    });
    try {
      const response = await save({
        ...validSetup,
        receivingAccount: "replacement.testnet",
      });
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ code });
      const persisted = await request("/api/merchant", {
        headers: { authorization: `Bearer ${environment().aliceToken}` },
      });
      expect(await persisted.json()).toMatchObject({
        profile: { testnet_wallet_id: "alice.testnet" },
      });
    } finally {
      await fetch(`${environment().supabaseUrl}/__scenario`, {
        method: "POST",
        body: JSON.stringify({ scenario: "ready" }),
      });
    }
  },
);

test("an unregistered account gets wallet-approved storage guidance instead of being saved", async () => {
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "unregistered" }),
  });
  try {
    const response = await save({
      ...validSetup,
      receivingAccount: "unregistered.testnet",
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "storage_required",
      details: {
        network: "testnet",
        method: "storage_deposit",
        args: { account_id: "unregistered.testnet", registration_only: true },
        minimumDepositYocto: "1250000000000000000000",
      },
    });
  } finally {
    await fetch(`${environment().supabaseUrl}/__scenario`, {
      method: "POST",
      body: JSON.stringify({ scenario: "ready" }),
    });
  }
});
