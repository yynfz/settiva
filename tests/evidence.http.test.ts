import { test, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { environment } from "./support/context";
import { issuedInvoice, evidence, hash } from "./support/payment-fixture";
test("the evidence recorder writes only a complete finalized testnet payment/refund chain", async () => {
  await fetch(`${environment().supabaseUrl}/__reset`, { method: "POST" });
  const invoice = await issuedInvoice();
  const first = await evidence(invoice);
  const second = structuredClone(first);
  second.transaction.hash = "B".repeat(44);
  const refund = structuredClone(first);
  refund.transaction.hash = "C".repeat(44);
  refund.transaction.signer_id = "alice.testnet";
  refund.transaction.actions[0].FunctionCall.args = Buffer.from(
    JSON.stringify({
      receiver_id: "payer.testnet",
      amount: "12500000",
      memo: "Refund",
    }),
  ).toString("base64");
  await fetch(`${environment().supabaseUrl}/__transaction`, {
    method: "POST",
    body: JSON.stringify({
      transactions: {
        [hash]: first,
        [second.transaction.hash]: second,
        [refund.transaction.hash]: refund,
      },
    }),
  });
  const dir = await mkdtemp(join(tmpdir(), "settiva-evidence-"));
  await mkdir(join(dir, "docs"));
  const manifest = join(dir, "manifest.json");
  await writeFile(
    manifest,
    JSON.stringify({
      network: "testnet",
      receivingAccount: "alice.testnet",
      amountAtomic: "12500000",
      paymentReference: invoice.payment_reference,
      transfers: [
        { role: "applied", hash, sender: "payer.testnet" },
        {
          role: "overpayment",
          hash: second.transaction.hash,
          sender: "payer.testnet",
        },
        {
          role: "refund",
          hash: refund.transaction.hash,
          sender: "alice.testnet",
        },
      ],
    }),
  );
  const run = promisify(execFile);
  const args = [resolve("scripts/record-demo-evidence.mjs"), manifest];
  const env = {
    ...process.env,
    NEAR_TESTNET_RPC_URL: `${environment().supabaseUrl}/rpc`,
    NEAR_TESTNET_ASSET: "circle-usdc",
  };
  await run(process.execPath, args, { cwd: dir, env });
  const report = await readFile(join(dir, "docs/TESTNET_EVIDENCE.md"), "utf8");
  expect(report).toContain("Genuine testnet transaction evidence");
  expect(report).toContain(refund.transaction.hash);
  refund.final_execution_status = "EXECUTED_OPTIMISTIC";
  await fetch(`${environment().supabaseUrl}/__transaction`, {
    method: "POST",
    body: JSON.stringify({
      transactions: {
        [hash]: first,
        [second.transaction.hash]: second,
        [refund.transaction.hash]: refund,
      },
    }),
  });
  await expect(
    run(process.execPath, args, { cwd: dir, env }),
  ).rejects.toThrow();
  expect(await readFile(join(dir, "docs/TESTNET_EVIDENCE.md"), "utf8")).toBe(
    report,
  );
});
