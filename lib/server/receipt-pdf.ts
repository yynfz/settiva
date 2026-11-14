import "server-only";
import type { PaymentReceipt } from "./payments";
export function receiptPdf(receipt: PaymentReceipt) {
  const lines = [
    "SETTIVA - VERIFIED PAYMENT RECEIPT",
    "TESTNET - NO MONETARY VALUE",
    `Invoice: ${receipt.invoiceNumber}`,
    `Amount: ${receipt.amountDisplay} ${receipt.assetSymbol}`,
    `Atomic amount: ${receipt.amountAtomic}`,
    `Asset: ${receipt.assetKind}`,
    `Contract: ${receipt.tokenContract}`,
    `Sender: ${receipt.senderAccount}`,
    `Receiving account: ${receipt.receivingAccount}`,
    `Transaction: ${receipt.transactionHash}`,
    `Block: ${receipt.blockHash}`,
    `Block timestamp: ${receipt.blockTimestamp}`,
    `Reference: ${receipt.paymentReference}`,
    "Explorer:",
    receipt.explorerUrl,
  ];
  const escape = (value: string) =>
    value.replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, "\\$&");
  const stream = [
    "0.13 0.44 0.28 rg",
    ...lines.map(
      (line, i) =>
        `BT /F1 ${i === 0 ? 15 : 9} Tf 40 ${750 - i * 32} Td (${escape(line)}) Tj ET`,
    ),
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let result = "%PDF-1.4\n";
  const offsets = ["0000000000 65535 f \n"];
  objects.forEach((object, i) => {
    offsets.push(
      `${String(Buffer.byteLength(result)).padStart(10, "0")} 00000 n \n`,
    );
    result += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(result);
  result += `xref\n0 6\n${offsets.join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(result));
}
