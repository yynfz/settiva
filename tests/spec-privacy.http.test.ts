import { test, expect } from "vitest";
import { environment, request } from "./support/context";
import {
  issuedInvoice,
  evidence,
  hash,
  verify,
} from "./support/payment-fixture";
test("public portal does not enumerate another payer's pending attempts; merchant history retains them", async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
  const invoice = await issuedInvoice();
  await evidence(invoice);
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "offline" }),
  });
  await verify(invoice.access_token);
  const portal = await request(`/api/portal/${invoice.access_token}`);
  expect(JSON.stringify(await portal.json())).not.toContain(hash);
  const page = await request(`/portal/${invoice.access_token}`);
  expect(await page.text()).not.toContain(hash);
  const history = await request(`/api/invoices/${invoice.id}/history`, {
    headers: { authorization: `Bearer ${environment().aliceToken}` },
  });
  expect(history.status).toBe(200);
  expect((await history.json()).attempts[0].transaction_hash).toBe(hash);
  const other = await request(`/api/invoices/${invoice.id}/history`, {
    headers: { authorization: `Bearer ${environment().bobToken}` },
  });
  expect(other.status).toBe(404);
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "ready" }),
  });
});
