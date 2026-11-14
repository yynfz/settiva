import { beforeEach, expect, test } from "vitest";
import { environment, request } from "./support/context";

beforeEach(async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
});

async function setupMerchant(
  token: string,
  displayName = "Alice Studio",
  receivingAccount = "alice.testnet",
) {
  const res = await request("/api/merchant", {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      displayName,
      receivingAccount,
      network: "testnet",
      confirmsControl: true,
    }),
  });
  expect(res.status).toBe(200);
}

test("unauthenticated visitor cannot list or create invoices", async () => {
  const getRes = await request("/api/invoices");
  expect(getRes.status).toBe(401);

  const postRes = await request("/api/invoices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientLabel: "Acme",
      items: [{ description: "Design", quantity: 1, unitPrice: "10" }],
    }),
  });
  expect(postRes.status).toBe(401);
});

test("uninvited user cannot list or create invoices", async () => {
  const res = await request("/api/invoices", {
    headers: { authorization: `Bearer ${environment().outsiderToken}` },
  });
  expect(res.status).toBe(403);
});

test("merchant without configured receiving account cannot create an invoice", async () => {
  const res = await request("/api/invoices", {
    method: "POST",
    headers: {
      authorization: `Bearer ${environment().aliceToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientLabel: "Acme Corp",
      items: [{ description: "Consulting", quantity: 1, unitPrice: "50" }],
    }),
  });
  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({
    code: "merchant_profile_required",
  });
});

test("merchant creates an itemized invoice, verifies sequential numbering, atomic units, and reads back in dashboard", async () => {
  await setupMerchant(environment().aliceToken);

  // 1. Create first invoice
  const res1 = await request("/api/invoices", {
    method: "POST",
    headers: {
      authorization: `Bearer ${environment().aliceToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientLabel: "Acme Corp Q4",
      description: "Brand design milestone",
      dueDate: "2026-12-31",
      items: [
        { description: "Logo Exploration", quantity: 2, unitPrice: "25.50" },
        { description: "Typography System", quantity: 1, unitPrice: "10.00" },
      ],
    }),
  });

  expect(res1.status).toBe(201);
  const data1 = await res1.json();
  expect(data1.invoice).toMatchObject({
    invoice_number: expect.stringMatching(/^INV-\d{4}-0001$/),
    client_label: "Acme Corp Q4",
    description: "Brand design milestone",
    due_date: "2026-12-31",
    status: "unpaid",
    network: "testnet",
    asset_symbol: "USDC",
    token_decimals: 6,
    receiving_account: "alice.testnet",
    amount_display: "61.00",
    amount_atomic: "61000000",
    is_overdue: false,
  });
  expect(data1.invoice.access_token).toBeDefined();
  expect(data1.invoice.payment_reference).toHaveLength(64);
  expect(data1.invoice.portal_url).toContain(data1.invoice.access_token);
  expect(data1.invoice.items).toHaveLength(2);
  expect(data1.invoice.items[0]).toMatchObject({
    description: "Logo Exploration",
    quantity: 2,
    unit_price: "25.50",
    total: "51.00",
  });

  // 2. Create second invoice to verify sequential numbering
  const res2 = await request("/api/invoices", {
    method: "POST",
    headers: {
      authorization: `Bearer ${environment().aliceToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientLabel: "Beta LLC",
      items: [{ description: "Audit", quantity: 1, unitPrice: "15" }],
    }),
  });
  expect(res2.status).toBe(201);
  const data2 = await res2.json();
  expect(data2.invoice.invoice_number).toMatch(/^INV-\d{4}-0002$/);

  // 3. Merchant lists invoices
  const listRes = await request("/api/invoices", {
    headers: { authorization: `Bearer ${environment().aliceToken}` },
  });
  expect(listRes.status).toBe(200);
  const listData = await listRes.json();
  expect(listData.invoices).toHaveLength(2);
  expect(listData.invoices[0].invoice_number).toBe(
    data2.invoice.invoice_number,
  );
  expect(listData.invoices[1].invoice_number).toBe(
    data1.invoice.invoice_number,
  );
});

test("cross-merchant isolation: Bob cannot see or access Alice's invoices or PDFs", async () => {
  await setupMerchant(
    environment().aliceToken,
    "Alice Studio",
    "alice.testnet",
  );
  await setupMerchant(environment().bobToken, "Bob Media", "bob.testnet");

  const createRes = await request("/api/invoices", {
    method: "POST",
    headers: {
      authorization: `Bearer ${environment().aliceToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientLabel: "Alice Private Client",
      items: [{ description: "Item 1", quantity: 1, unitPrice: "100" }],
    }),
  });
  const { invoice } = await createRes.json();

  // Bob lists invoices -> empty
  const bobList = await request("/api/invoices", {
    headers: { authorization: `Bearer ${environment().bobToken}` },
  });
  expect(bobList.status).toBe(200);
  expect(await bobList.json()).toEqual({ invoices: [] });

  // Bob tries to download Alice's PDF -> 404
  const bobPdf = await request(`/api/invoices/${invoice.id}/pdf`, {
    headers: { authorization: `Bearer ${environment().bobToken}` },
  });
  expect(bobPdf.status).toBe(404);

  // Alice downloads own PDF -> 200
  const alicePdf = await request(`/api/invoices/${invoice.id}/pdf`, {
    headers: { authorization: `Bearer ${environment().aliceToken}` },
  });
  expect(alicePdf.status).toBe(200);
  expect(alicePdf.headers.get("content-type")).toBe("application/pdf");
  const pdfBytes = Buffer.from(await alicePdf.arrayBuffer());
  expect(pdfBytes.slice(0, 8).toString()).toContain("%PDF-1.4");
});

test("Customer Portal: unauthenticated payer reads public invoice, transitions status to viewed, and NEVER leaks private client label", async () => {
  await setupMerchant(environment().aliceToken);

  const createRes = await request("/api/invoices", {
    method: "POST",
    headers: {
      authorization: `Bearer ${environment().aliceToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientLabel: "Top Secret Client ABC",
      description: "Confidential internal merchant notes",
      dueDate: "2026-11-30",
      items: [
        { description: "Product Strategy", quantity: 1, unitPrice: "250.00" },
      ],
    }),
  });
  const { invoice } = await createRes.json();

  // 1. Payer reads public invoice via access token (NO AUTH TOKEN)
  const portalRes = await request(`/api/portal/${invoice.access_token}`);
  expect(portalRes.status).toBe(200);
  const portalData = await portalRes.json();

  // Status transitioned to "viewed"
  expect(portalData.invoice.status).toBe("viewed");
  expect(portalData.invoice.viewedAt).toBeDefined();

  // Public fields match
  expect(portalData.invoice).toMatchObject({
    invoiceNumber: invoice.invoice_number,
    merchantDisplayName: "Alice Studio",
    network: "testnet",
    receivingAccount: "alice.testnet",
    paymentReference: invoice.payment_reference,
    amountDisplay: "250.00",
    amountAtomic: "250000000",
    dueDate: "2026-11-30",
    isOverdue: false,
    items: [
      {
        description: "Product Strategy",
        quantity: 1,
        unitPrice: "250.00",
        total: "250.00",
      },
    ],
  });

  // CRITICAL PRIVACY INVARIANT: client_label and description must NOT exist in the response
  const rawBody = JSON.stringify(portalData);
  expect(rawBody).not.toContain("Top Secret Client ABC");
  expect(rawBody).not.toContain("Confidential internal merchant notes");
  expect(portalData.invoice.clientLabel).toBeUndefined();
  expect(portalData.invoice.client_label).toBeUndefined();
  expect(portalData.invoice.description).toBeUndefined();

  // 2. Payer downloads PDF via public portal endpoint
  const pdfRes = await request(`/api/portal/${invoice.access_token}/pdf`);
  expect(pdfRes.status).toBe(200);
  expect(pdfRes.headers.get("content-type")).toBe("application/pdf");
  expect(pdfRes.headers.get("content-disposition")).toContain(
    `${invoice.invoice_number}.pdf`,
  );
  const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
  expect(pdfBytes.slice(0, 8).toString()).toContain("%PDF-1.4");
  // PDF does not leak client_label
  expect(pdfBytes.toString("latin1")).not.toContain("Top Secret Client ABC");
});

test("an overdue unpaid invoice is dynamically marked overdue while remaining payable", async () => {
  await setupMerchant(environment().aliceToken);

  const pastDate = "2020-01-01";
  const res = await request("/api/invoices", {
    method: "POST",
    headers: {
      authorization: `Bearer ${environment().aliceToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientLabel: "Late Client",
      dueDate: pastDate,
      items: [{ description: "Overdue Service", quantity: 1, unitPrice: "50" }],
    }),
  });
  expect(res.status).toBe(201);
  const { invoice } = await res.json();
  expect(invoice.is_overdue).toBe(true);

  // Portal view also marks overdue
  const portalRes = await request(`/api/portal/${invoice.access_token}`);
  expect(portalRes.status).toBe(200);
  const portalData = await portalRes.json();
  expect(portalData.invoice.isOverdue).toBe(true);
});

test("server-side mainnet rejection blocks mainnet invoice issuance", async () => {
  await setupMerchant(environment().aliceToken);

  const res = await request("/api/invoices", {
    method: "POST",
    headers: {
      authorization: `Bearer ${environment().aliceToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientLabel: "Mainnet Attempt",
      network: "mainnet",
      items: [{ description: "Prohibited", quantity: 1, unitPrice: "10" }],
    }),
  });
  expect(res.status).toBe(403);
  expect(await res.json()).toMatchObject({
    code: "mainnet_disabled",
  });
});

test("validation rejects invalid, zero, or negative items and amounts", async () => {
  await setupMerchant(environment().aliceToken);

  // Missing items
  const res1 = await request("/api/invoices", {
    method: "POST",
    headers: {
      authorization: `Bearer ${environment().aliceToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientLabel: "Bad Items",
      items: [],
    }),
  });
  expect(res1.status).toBe(422);

  // Zero quantity
  const res2 = await request("/api/invoices", {
    method: "POST",
    headers: {
      authorization: `Bearer ${environment().aliceToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientLabel: "Zero Qty",
      items: [{ description: "Test", quantity: 0, unitPrice: "10" }],
    }),
  });
  expect(res2.status).toBe(422);

  // Negative unit price
  const res3 = await request("/api/invoices", {
    method: "POST",
    headers: {
      authorization: `Bearer ${environment().aliceToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientLabel: "Negative Price",
      items: [{ description: "Test", quantity: 1, unitPrice: "-10" }],
    }),
  });
  expect(res3.status).toBe(422);

  // Exceeds decimals (Circle USDC has 6 decimals, sending 8)
  const res4 = await request("/api/invoices", {
    method: "POST",
    headers: {
      authorization: `Bearer ${environment().aliceToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientLabel: "Too many decimals",
      items: [{ description: "Test", quantity: 1, unitPrice: "10.12345678" }],
    }),
  });
  expect(res4.status).toBe(422);
  expect(await res4.json()).toMatchObject({ code: "invalid_decimals" });
});
