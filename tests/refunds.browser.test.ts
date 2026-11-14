import { test, expect } from "vitest";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { environment, request } from "./support/context";
import { issuedInvoice, evidence, verify } from "./support/payment-fixture";

const secondHash = "B".repeat(44);
const refundHash = "C".repeat(44);

test("merchant views overpayment ledger and submits refund verification", async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
  const invoice = await issuedInvoice();

  // 1. Pay invoice
  await evidence(invoice);
  await verify(invoice.access_token);

  // 2. Submit overpayment
  const secondEvidence = await evidence(invoice);
  secondEvidence.transaction.hash = secondHash;
  secondEvidence.transaction.signer_id = "payer2.testnet";
  await fetch(`${environment().supabaseUrl}/__transaction`, {
    method: "POST",
    body: JSON.stringify(secondEvidence),
  });
  await request(`/api/portal/${invoice.access_token}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transactionHash: secondHash,
      senderAccount: "payer2.testnet",
    }),
  });

  // 3. Mock refund transaction on RPC
  const refundEv = {
    final_execution_status: "FINAL",
    status: { SuccessValue: "" },
    transaction: {
      hash: refundHash,
      signer_id: "alice.testnet",
      receiver_id: invoice.token_contract_id,
      actions: [
        {
          FunctionCall: {
            method_name: "ft_transfer",
            deposit: "1",
            gas: 30000000000000,
            args: Buffer.from(
              JSON.stringify({
                receiver_id: "payer2.testnet",
                amount: invoice.amount_atomic,
                memo: "Refund",
              }),
            ).toString("base64"),
          },
        },
      ],
    },
    transaction_outcome: {
      outcome: { status: { SuccessReceiptId: "refund-receipt" } },
    },
    receipts_outcome: [
      {
        id: "refund-receipt",
        block_hash: "settlement-block",
        outcome: {
          executor_id: invoice.token_contract_id,
          status: { SuccessValue: "" },
          logs: [],
        },
      },
    ],
  };
  await fetch(`${environment().supabaseUrl}/__transaction`, {
    method: "POST",
    body: JSON.stringify(refundEv),
  });

  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
      (existsSync(chrome) ? chrome : undefined),
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(12000);

    // Sign in as Alice
    await page.goto(environment().appUrl);
    await page.getByLabel("Email").fill("alice@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("test-only-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Wait for setup to load and switch to Invoices tab
    const invoicesTab = page.getByRole("tab", { name: "Invoices" });
    await invoicesTab.waitFor();
    await invoicesTab.click();

    // Wait for invoice card with paid status
    await page.locator(".status-pill.paid").waitFor();
    const refundBtn = page.getByRole("button", {
      name: "Check Overpayments / Refunds ▼",
    });
    await refundBtn.scrollIntoViewIfNeeded();
    await refundBtn.click();
    await page.locator(".status-pill.overdue").waitFor(); // REFUND NEEDED status pill

    // Fill refund hash and submit
    await page.getByPlaceholder("Return transaction hash").fill(refundHash);
    await page.getByRole("button", { name: "Verify Refund" }).click();

    // Verify success status and Credit Note link
    await page.getByText("REFUNDED").waitFor();
    await page.getByText("📄 Download Credit Note PDF").waitFor();
    expect(
      await page.getByText("📄 Download Credit Note PDF").isVisible(),
    ).toBe(true);
  } finally {
    await browser.close();
    await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
  }
});
