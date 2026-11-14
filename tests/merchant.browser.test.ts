import { test, expect } from "vitest";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { environment } from "./support/context";

test("an invited merchant signs in, confirms the destination, and sees their saved setup after reload", async () => {
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
    page.setDefaultTimeout(8000);
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
    await page.reload();
    expect(await page.getByLabel("Display name").inputValue()).toBe(
      "Bob Studio",
    );
    expect(
      await page.getByLabel("Receiving account", { exact: true }).inputValue(),
    ).toBe("bob.testnet");
    expect(
      await page.getByText("TESTNET DEMO", { exact: true }).isVisible(),
    ).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await mkdir(".test-cache", { recursive: true });
    await page.screenshot({
      path: ".test-cache/merchant-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("button", { name: "Sign in" }).waitFor();
  } finally {
    await browser.close();
  }
});
