import { test, expect } from "vitest";
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { environment } from "./support/context";

test("reviewers can discover the complete testnet demonstration", async () => {
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
      (existsSync(chrome) ? chrome : undefined),
  });
  try {
    const page = await browser.newPage();
    await page.goto(environment().appUrl);
    await page
      .getByRole("heading", { name: "From invoice to verified receipt" })
      .waitFor();
    expect(
      await page
        .getByRole("heading", { name: "From invoice to verified receipt" })
        .isVisible(),
    ).toBe(true);
    expect(
      await page.getByRole("link", { name: "Demo walkthrough" }).isVisible(),
    ).toBe(true);
  } finally {
    await browser.close();
  }
});
