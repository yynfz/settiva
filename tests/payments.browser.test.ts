import { test, expect } from "vitest";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { environment } from "./support/context";
import { issuedInvoice, evidence, hash } from "./support/payment-fixture";

test("a payer explicitly approves the exact wallet transfer and downloads the verified receipt", async () => {
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
    const page = await browser.newPage({ acceptDownloads: true });
    page.setDefaultTimeout(8000);
    let submitted: unknown;
    await page.exposeFunction("walletApproval", (input: unknown) => {
      submitted = input;
    });
    await page.addInitScript(
      ({ hash }) => {
        window.addEventListener("near-selector-ready", () => {
          const wallet = {
            manifest: {
              id: "test-wallet",
              name: "Test Wallet",
              type: "injected",
              icon: "",
              description: "Controlled external wallet",
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
            signAndSendTransaction: async (input: unknown) => {
              await (
                window as unknown as {
                  walletApproval: (input: unknown) => Promise<void>;
                }
              ).walletApproval(input);
              return { transaction: { hash } };
            },
          };
          window.dispatchEvent(
            new CustomEvent("near-wallet-injected", { detail: wallet }),
          );
        });
      },
      { hash },
    );
    await page.route("https://raw.githubusercontent.com/**", (route) =>
      route.fulfill({ json: { wallets: [], version: "1" } }),
    );
    await page.goto(`${environment().appUrl}/portal/${invoice.access_token}`);
    await page.getByText("Already sent a payment? Verify it here").click();
    await page.getByLabel("Sender account").fill("recovery.testnet");
    await page.getByRole("button", { name: "Connect testnet wallet" }).click();
    await page.getByText("Test Wallet", { exact: true }).click();
    await page.getByRole("button", { name: "Authorize payment" }).click();
    await page
      .getByRole("heading", { name: "Verified payment receipt" })
      .waitFor();
    expect(submitted).toEqual({
      network: "testnet",
      signerId: "payer.testnet",
      receiverId: invoice.token_contract_id,
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "ft_transfer",
            args: {
              receiver_id: "alice.testnet",
              amount: "12500000",
              memo: invoice.payment_reference,
            },
            gas: "30000000000000",
            deposit: "1",
          },
        },
      ],
    });
    const download = page.waitForEvent("download", { timeout: 8000 });
    await page
      .getByRole("link", { name: "Download payment receipt PDF" })
      .click({ noWaitAfter: true });
    const file = await download;
    expect(file.suggestedFilename()).toContain("receipt.pdf");
    await file.saveAs(".test-cache/payment-receipt.pdf");
  } finally {
    await browser.close();
  }
});
