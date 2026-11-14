import { beforeEach, expect, test } from "vitest";
import { environment, request } from "./support/context";

beforeEach(async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
});

export async function issuedInvoice() {
  const headers = { authorization: `Bearer ${environment().aliceToken}`, "content-type": "application/json" };
  expect((await request("/api/merchant", { method: "PUT", headers, body: JSON.stringify({ displayName: "Alice Studio", receivingAccount: "alice.testnet", network: "testnet", confirmsControl: true }) })).status).toBe(200);
  const result = await request("/api/invoices", { method: "POST", headers, body: JSON.stringify({ clientLabel: "Private client", items: [{ description: "Design", quantity: 1, unitPrice: "12.50" }] }) });
  expect(result.status).toBe(201);
  return (await result.json()).invoice;
}

test("verification accepts only a transaction hash and claimed sender, never client payment terms", async () => {
  const invoice = await issuedInvoice();
  const response = await request(`/api/portal/${invoice.access_token}/verify`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ transactionHash: "A".repeat(44), senderAccount: "payer.testnet", amount: "1" }),
  });
  expect(response.status).toBe(400);
});
