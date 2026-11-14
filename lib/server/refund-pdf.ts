import "server-only";
import { networkPolicy } from "./network";
import type { Overpayment } from "@/lib/contracts";

export function refundPdf(overpayment: Overpayment) {
  const lines = [
    "SETTIVA - OVERPAYMENT REFUND CREDIT NOTE",
    networkPolicy(overpayment.network).badge,
    `Original Invoice: ${overpayment.invoiceNumber}`,
    `Refund Status: ${overpayment.refundStatus.toUpperCase()}`,
    `Amount Refunded: ${overpayment.amountDisplay} ${overpayment.assetSymbol}`,
    `Atomic Amount: ${overpayment.amountAtomic}`,
    `Asset Contract: ${overpayment.tokenContract}`,
    `From (Merchant): ${overpayment.receivingAccount}`,
    `To (Payer): ${overpayment.senderAccount}`,
    `Original Overpayment Tx: ${overpayment.transactionHash}`,
    `Original Received At: ${overpayment.verifiedAt}`,
    `Return Refund Tx: ${overpayment.refundHash || "N/A"}`,
    `Refund Finalized At: ${overpayment.refundTimestamp || "N/A"}`,
    "Explorer Evidence:",
    overpayment.refundExplorerUrl || overpayment.explorerUrl,
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
