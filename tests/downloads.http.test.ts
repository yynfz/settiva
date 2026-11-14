import { test, expect } from "vitest";
import { environment, request } from "./support/context";
test("merchant credentials in query strings cannot authorize requests", async () => {
  expect(
    (await request(`/api/invoices?token=${environment().aliceToken}`)).status,
  ).toBe(401);
  expect(
    (await request(`/api/merchant?token=${environment().aliceToken}`)).status,
  ).toBe(401);
});

test("untrusted forwarding headers cannot choose public portal origins", async () => {
  const { issuedInvoice } = await import("./support/payment-fixture");
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
  await issuedInvoice();
  const response = await request("/api/invoices", {
    headers: {
      authorization: `Bearer ${environment().aliceToken}`,
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "https",
    },
  });
  expect(response.status).toBe(200);
  const { invoices } = await response.json();
  expect(invoices[0].portal_url).toContain(`${environment().appUrl}/portal/`);
});
