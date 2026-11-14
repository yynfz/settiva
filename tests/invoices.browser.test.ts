import { test, expect } from "vitest";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { environment } from "./support/context";

test("merchant creates an itemized invoice, lists it, and customer opens customer portal", async () => {
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
      (existsSync(chrome) ? chrome : undefined),
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);

    // 1. Sign in as Bob and ensure account is configured
    await page.goto(environment().appUrl);
    await page.getByLabel("Email").fill("bob@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("test-only-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.getByLabel("Display name").fill("Bob Studio");
    await page
      .getByLabel("Receiving account", { exact: true })
      .fill("bob.testnet");
    await page.getByLabel("I control this receiving account").check();
    await page.getByRole("button", { name: "Check and save account" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Receiving account saved" })
      .waitFor();

    // 2. Switch to Invoices tab
    await page.getByRole("tab", { name: "Invoices" }).click();

    // 3. Click Create Invoice
    await page.getByRole("button", { name: "+ Create Invoice" }).click();

    // 4. Fill invoice form
    await page.getByLabel("Client Label (Private)").fill("Acme Corporation");
    await page
      .getByPlaceholder("Service or item description")
      .fill("Frontend Engineering");
    await page.getByPlaceholder("10.00").fill("50.00");

    // 5. Submit invoice
    await page.getByRole("button", { name: /create and freeze/i }).click();

    // 6. Verify invoice card appears in list
    const card = page.locator(".invoice-card").first();
    await card.waitFor();
    expect(await card.getByText("Acme Corporation").isVisible()).toBe(true);
    expect(await card.getByText("50.00 USDC").isVisible()).toBe(true);
    expect(await card.getByText("UNPAID").isVisible()).toBe(true);

    // 7. Get Customer Portal URL from Portal link
    const portalLink = card.getByRole("link", { name: /Portal/i });
    const portalHref = await portalLink.getAttribute("href");
    expect(portalHref).toContain("/portal/");

    // 8. Open Customer Portal in a new page as unauthenticated payer
    const customerPage = await context.newPage();
    await customerPage.goto(portalHref!);

    // Verify Customer Portal layout
    expect(
      await customerPage.getByText("Customer Portal").first().isVisible(),
    ).toBe(true);
    expect(
      await customerPage.getByText("Frontend Engineering").isVisible(),
    ).toBe(true);
    expect(
      await customerPage
        .getByText("50.00", { exact: true })
        .first()
        .isVisible(),
    ).toBe(true);
    expect(await customerPage.getByText("Bob Studio").first().isVisible()).toBe(
      true,
    );
    expect(
      await customerPage
        .getByRole("link", { name: "Download PDF" })
        .isVisible(),
    ).toBe(true);

    // Verify status transitioned to VIEWED
    expect(
      await customerPage.getByText("VIEWED", { exact: true }).isVisible(),
    ).toBe(true);

    await customerPage.close();
  } finally {
    await browser.close();
  }
});
