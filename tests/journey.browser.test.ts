import { test, expect } from "vitest";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { environment, request } from "./support/context";
import { evidence, hash, verify } from "./support/payment-fixture";

test("complete reviewer journey: issue, PDFs, wallet payment, duplicate, merchant refund, and lookup", async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
      (existsSync(chrome) ? chrome : undefined),
  });
  try {
    const merchant = await browser.newPage();
    merchant.setDefaultTimeout(10000);
    await merchant.goto(environment().appUrl);
    await merchant.getByLabel("Email").fill("alice@example.test");
    await merchant
      .getByLabel("Password", { exact: true })
      .fill("test-only-password");
    await merchant.getByRole("button", { name: "Sign in" }).click();
    await merchant.getByLabel("Display name").fill("Demo Studio");
    await merchant
      .getByLabel("Receiving account", { exact: true })
      .fill("alice.testnet");
    await merchant.getByLabel("I control this receiving account").check();
    await merchant
      .getByRole("button", { name: "Check and save account" })
      .click();
    await merchant
      .getByRole("status")
      .filter({ hasText: "Receiving account saved" })
      .waitFor();
    await merchant.getByRole("tab", { name: "Invoices" }).click();
    await merchant.getByRole("button", { name: "+ Create Invoice" }).click();
    await merchant
      .getByLabel("Client Label (Private)")
      .fill("Private demo client");
    await merchant
      .getByPlaceholder("Service or item description")
      .fill("Design review");
    await merchant.getByPlaceholder("10.00").fill("12.50");
    await merchant.getByRole("button", { name: /create and freeze/i }).click();
    const card = merchant.locator(".invoice-card").first();
    await card.waitFor();
    const portalHref = await card
      .getByRole("link", { name: /Portal/ })
      .getAttribute("href");
    const token = new URL(portalHref!).pathname.split("/").pop()!;
    const listed = await request("/api/invoices", {
      headers: { authorization: `Bearer ${environment().aliceToken}` },
    });
    const invoice = (await listed.json()).invoices[0];
    const invoiceDownload = merchant.waitForEvent("download");
    await card.getByRole("button", { name: "PDF", exact: true }).click();
    await (await invoiceDownload).saveAs(".test-cache/journey-invoice.pdf");
    const payer = await browser.newPage();

    payer.setDefaultTimeout(10000);
    await payer.addInitScript(
      ({ hash }) => {
        window.addEventListener("near-selector-ready", () => {
          window.dispatchEvent(
            new CustomEvent("near-wallet-injected", {
              detail: {
                manifest: {
                  id: "test-wallet",
                  name: "Test Wallet",
                  type: "injected",
                  icon: "",
                  description: "Controlled wallet",
                  version: "1",
                  website: "https://example.test",
                  permissions: {},
                  features: {
                    testnet: true,
                    signAndSendTransaction: true,
                    signInWithoutAddKey: true,
                  },
                },
                signIn: async () => [{ accountId: "payer.testnet" }],
                getAccounts: async () => [{ accountId: "payer.testnet" }],
                signAndSendTransaction: async () => ({ transaction: { hash } }),
              },
            }),
          );
        });
      },
      { hash },
    );
    await payer.route("https://raw.githubusercontent.com/**", (route) =>
      route.fulfill({ json: { wallets: [], version: "1" } }),
    );
    await payer.goto(portalHref!);
    expect(await payer.getByText("VIEWED", { exact: true }).isVisible()).toBe(
      true,
    );
    const pdfResponse = await payer.request.get(
      `${environment().appUrl}/api/portal/${token}/pdf`,
    );
    expect(pdfResponse.status()).toBe(200);
    expect((await pdfResponse.body()).subarray(0, 8).toString()).toContain(
      "%PDF",
    );
    await evidence(invoice);
    await payer.getByText("Already sent a payment? Verify it here").click();
    await payer.getByLabel("Sender account").fill("payer.testnet");
    await payer.getByRole("button", { name: "Connect testnet wallet" }).click();
    await payer.getByText("Test Wallet", { exact: true }).click();
    await payer.getByRole("button", { name: "Authorize payment" }).click();
    await payer
      .getByRole("heading", { name: "Verified payment receipt" })
      .waitFor();
    const download = payer.waitForEvent("download");
    await payer
      .getByRole("link", { name: "Download payment receipt PDF" })
      .click({ noWaitAfter: true });
    await (await download).saveAs(".test-cache/journey-payment.pdf");
    const second = "B".repeat(44),
      returned = "C".repeat(44);
    const ev = await evidence(invoice);
    ev.transaction.hash = second;
    await fetch(`${environment().supabaseUrl}/__transaction`, {
      method: "POST",
      body: JSON.stringify(ev),
    });
    await payer.getByText("Already sent a payment? Verify it here").click();
    await payer.getByLabel("Sender account").fill("payer.testnet");
    await payer.getByLabel("Transaction hash").fill(second);
    await payer
      .getByRole("button", { name: "Verify payment", exact: true })
      .click();
    await payer
      .getByRole("status")
      .filter({ hasText: "additional matching payment" })
      .waitFor();
    await merchant.reload();
    await merchant.getByRole("tab", { name: "Invoices" }).click();
    await merchant
      .getByRole("button", { name: "Check Overpayments / Refunds ▼" })
      .click();
    await merchant.getByText("REFUND NEEDED", { exact: true }).waitFor();
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
    await merchant.getByPlaceholder("Return transaction hash").fill(returned);
    await merchant.getByRole("button", { name: "Verify Refund" }).click();
    await merchant.getByText("REFUNDED", { exact: true }).waitFor();
    await payer.goto(`${environment().appUrl}/portal/${token}/lookup`);
    await payer.getByLabel("Transaction hash").fill(second);
    await payer.getByRole("button", { name: "Look up transfer" }).click();
    await payer.getByText("Refund: refunded", { exact: true }).waitFor();
    expect(await payer.getByRole("link", { name: returned }).isVisible()).toBe(
      true,
    );
    expect(await payer.locator("body").innerText()).not.toContain(
      "Private demo client",
    );
  } finally {
    await browser.close();
    await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
  }
}, 60000);
