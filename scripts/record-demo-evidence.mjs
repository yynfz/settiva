// Read-only evidence capture: never signs, broadcasts, funds, or activates mainnet.
import { readFile, writeFile } from "node:fs/promises";
import { configuredAsset, accountId } from "../lib/asset.ts";
const path = process.argv[2];
if (!path)
  throw new Error(
    "Usage: npm run demo:evidence -- /path/to/private-demo-manifest.json",
  );
const input = JSON.parse(await readFile(path, "utf8"));
const asset = configuredAsset();
const endpoint = process.env.NEAR_TESTNET_RPC_URL;
if (!endpoint) throw new Error("Set NEAR_TESTNET_RPC_URL.");
const hashPattern = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;
if (
  input.network !== "testnet" ||
  !accountId.safeParse(input.receivingAccount).success ||
  !/^[1-9]\d*$/.test(input.amountAtomic) ||
  typeof input.paymentReference !== "string" ||
  !/^[a-f0-9]{64}$/.test(input.paymentReference)
)
  throw new Error(
    "Supply frozen testnet invoice terms: receivingAccount, positive amountAtomic, and 64-character paymentReference.",
  );
if (
  !Array.isArray(input.transfers) ||
  input.transfers.length !== 3 ||
  input.transfers.map((t) => t.role).join(",") !==
    "applied,overpayment,refund" ||
  new Set(input.transfers.map((t) => t.hash)).size !== 3 ||
  input.transfers.some(
    (t) => !hashPattern.test(t.hash) || !accountId.safeParse(t.sender).success,
  )
)
  throw new Error(
    "Supply three distinct transfers in order: applied, overpayment, refund, each with hash and sender.",
  );
async function rpc(method, params) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "demo-evidence",
      method,
      params,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  if (!response.ok || body.error || !body.result)
    throw new Error(`Read-only RPC ${method} failed; no evidence recorded.`);
  return body.result;
}
if ((await rpc("status", [])).chain_id !== "testnet")
  throw new Error("Evidence must come from NEAR testnet.");
const metadataResponse = await rpc("query", {
  request_type: "call_function",
  finality: "final",
  account_id: asset.contract,
  method_name: "ft_metadata",
  args_base64: "e30=",
});
const metadata = JSON.parse(Buffer.from(metadataResponse.result).toString());
if (
  metadata.spec !== "ft-1.0.0" ||
  metadata.name !== asset.name ||
  metadata.symbol !== asset.symbol ||
  metadata.decimals !== asset.decimals
)
  throw new Error("Live token metadata differs from configured asset.");
const records = [];
for (const transfer of input.transfers) {
  const result = await rpc("tx", {
    tx_hash: transfer.hash,
    sender_account_id: transfer.sender,
    wait_until: "FINAL",
  });
  const tx = result.transaction;
  if (
    result.final_execution_status !== "FINAL" ||
    !Object.hasOwn(result.status || {}, "SuccessValue") ||
    tx?.hash !== transfer.hash ||
    tx.signer_id !== transfer.sender ||
    tx.receiver_id !== asset.contract ||
    tx.actions?.length !== 1
  )
    throw new Error(
      `${transfer.role}: final successful single transfer required.`,
    );
  const call = tx.actions[0].FunctionCall;
  if (!call || call.method_name !== "ft_transfer" || call.deposit !== "1")
    throw new Error(`${transfer.role}: expected ft_transfer with 1 yoctoNEAR.`);
  const args = JSON.parse(Buffer.from(call.args, "base64").toString());
  const isRefund = transfer.role === "refund";
  if (
    args.amount !== input.amountAtomic ||
    args.receiver_id !==
      (isRefund ? input.transfers[1].sender : input.receivingAccount) ||
    (!isRefund && args.memo !== input.paymentReference) ||
    (isRefund && transfer.sender !== input.receivingAccount)
  )
    throw new Error(
      `${transfer.role}: transfer terms do not match the demonstration.`,
    );
  const receiptId =
    result.transaction_outcome?.outcome?.status?.SuccessReceiptId;
  const execution = result.receipts_outcome?.find(
    (item) => item.id === receiptId,
  );
  if (
    !execution ||
    execution.outcome.executor_id !== asset.contract ||
    !Object.hasOwn(execution.outcome.status || {}, "SuccessValue") ||
    result.receipts_outcome.some((item) =>
      Object.hasOwn(item.outcome.status || {}, "Failure"),
    )
  )
    throw new Error(
      `${transfer.role}: unsuccessful or missing execution receipt.`,
    );
  const block = await rpc("block", { block_id: execution.block_hash });
  if (block.header.hash !== execution.block_hash)
    throw new Error("Block hash mismatch.");
  const timestamp = new Date(
    Number(BigInt(block.header.timestamp_nanosec) / 1000000n),
  ).toISOString();
  records.push({
    role: transfer.role,
    hash: transfer.hash,
    sender: transfer.sender,
    recipient: args.receiver_id,
    timestamp,
  });
}
const document = `# Genuine testnet transaction evidence\n\nRecorded: ${new Date().toISOString()}\n\nNetwork: NEAR testnet. Asset: ${asset.name} (${asset.symbol}), ${asset.label}.\nContract: \`${asset.contract}\`. Decimals: ${asset.decimals}. Atomic amount per transfer: \`${input.amountAtomic}\`.\n\nAll three distinct transfers were read from testnet RPC with FINAL execution and checked against the declared invoice terms. This is blockchain evidence; automated fixture tests are separate.\n\n| Role | Sender | Recipient | Finalized block time | Transaction |\n| --- | --- | --- | --- | --- |\n${records.map((r) => `| ${r.role} | ${r.sender} | ${r.recipient} | ${r.timestamp} | [${r.hash}](https://testnet.nearblocks.io/txns/${r.hash}) |`).join("\n")}\n\nThe refund returns the full overpayment to its original sender. No transaction was signed or submitted by this recorder. Application classification and PDF demonstrations should be checked in the portal using the corresponding invoice.\n`;
await writeFile("docs/TESTNET_EVIDENCE.md", document);
console.log(
  "Verified genuine testnet evidence recorded in docs/TESTNET_EVIDENCE.md.",
);
