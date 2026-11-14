import { test, expect } from "vitest";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { environment, request } from "./support/context";
import {
  issuedInvoice,
  evidence,
  verify,
  hash,
} from "./support/payment-fixture";
test("payer looks up an overpayment before and after its verified refund", async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
  const invoice = await issuedInvoice();
  await evidence(invoice);
  await verify(invoice.access_token);
  const second = "B".repeat(44),
    returned = "C".repeat(44);
  const ev = await evidence(invoice);
  ev.transaction.hash = second;
  await fetch(`${environment().supabaseUrl}/__transaction`, {
    method: "POST",
    body: JSON.stringify(ev),
  });
  await verify(invoice.access_token, second);
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
      (existsSync(chrome) ? chrome : undefined),
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(8000);
    await page.goto(
      `${environment().appUrl}/portal/${invoice.access_token}/lookup`,
    );
    await page.getByLabel("Transaction hash").fill(second);
    await page.getByRole("button", { name: "Look up transfer" }).click();
    await page.getByText("Refund: refund_needed", { exact: true }).waitFor();
    expect(await page.locator("body").innerText()).not.toContain(hash);
    const ledger = await request(`/api/invoices/${invoice.id}/overpayments`, {
      headers: { authorization: `Bearer ${environment().aliceToken}` },
    });
    const { overpayments } = await ledger.json();
    ev.transaction.hash = returned;
    ev.transaction.signer_id = "alice.testnet";
    ev.transaction.actions[0].FunctionCall.args = Buffer.from(
      JSON.stringify({
        receiver_id: "payer.testnet",
        amount: "12500000",
        memo: "Refund",
      }),
    ).toString("base64");
    await fetch(`${environment().supabaseUrl}/__transaction`, {
      method: "POST",
      body: JSON.stringify(ev),
    });
    const refund = await request(`/api/payments/${overpayments[0].id}/refund`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${environment().aliceToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ refundHash: returned }),
    });
    expect(refund.status).toBe(200);
    await page.getByRole("button", { name: "Look up transfer" }).click();
    await page.getByText("Refund: refunded", { exact: true }).waitFor();
    expect(await page.getByRole("link", { name: returned }).isVisible()).toBe(
      true,
    );
    const download = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Download transfer receipt" })
      .click({ noWaitAfter: true });
    await (await download).saveAs(".test-cache/lookup-receipt.pdf");
  } finally {
    await browser.close();
  }
});
