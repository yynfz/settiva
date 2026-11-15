import { test, expect } from "vitest";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { environment } from "./support/context";
import { issuedInvoice, evidence, hash } from "./support/payment-fixture";

test("reopening the portal resumes a pending attempt and shows the recovery banner", async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
  const invoice = await issuedInvoice();
  await evidence(invoice);

  // Put RPC offline so the first attempt stays pending.
  await fetch(`${environment().supabaseUrl}/__scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario: "offline" }),
  });

  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
      (existsSync(chrome) ? chrome : undefined),
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(12000);

    // Intercept wallet registry so the wallet selector doesn't fail.
    await page.route("https://raw.githubusercontent.com/**", (route) =>
      route.fulfill({ json: { wallets: [], version: "1" } }),
    );

    await page.goto(`${environment().appUrl}/portal/${invoice.access_token}`);

    await page.getByText("Already sent a payment? Verify it here").click();
    await page.getByLabel("Sender account").fill("payer.testnet");
    await page.getByLabel("Transaction hash").fill(hash);
    await page
      .getByRole("button", { name: "Verify payment", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Retry verification" })
      .waitFor();
    await fetch(`${environment().supabaseUrl}/__scenario`, {
      method: "POST",
      body: JSON.stringify({ scenario: "ready" }),
    });
    await page.reload();
    // Recovery banner should appear immediately.
    await page
      .getByRole("alert", { name: "Pending payment recovery" })
      .waitFor();
    expect(
      await page
        .getByRole("alert", { name: "Pending payment recovery" })
        .isVisible(),
    ).toBe(true);

    // The page auto-retries and should resolve to the verified receipt.
    await page
      .getByRole("heading", { name: "Verified payment receipt" })
      .waitFor({ timeout: 12000 });
  } finally {
    await browser.close();
    await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
  }
});

test("temporary rate limits retain a known hash for recovery after reload", async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
  const invoice = await issuedInvoice();
  await evidence(invoice);
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
      (existsSync(chrome) ? chrome : undefined),
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(12000);
    await page.route(`**/api/portal/${invoice.access_token}/verify`, (route) =>
      route.fulfill({
        status: 429,
        json: { code: "rate_limit", error: "Retry verification later." },
      }),
    );
    await page.goto(`${environment().appUrl}/portal/${invoice.access_token}`);
    await page.getByText("Already sent a payment? Verify it here").click();
    await page.getByLabel("Sender account").fill("payer.testnet");
    await page.getByLabel("Transaction hash").fill(hash);
    await page
      .getByRole("button", { name: "Verify payment", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Retry verification later" })
      .waitFor();
    await page.unroute(`**/api/portal/${invoice.access_token}/verify`);
    await page.reload();
    await page
      .getByRole("heading", { name: "Verified payment receipt" })
      .waitFor();
  } finally {
    await browser.close();
    await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
  }
});
