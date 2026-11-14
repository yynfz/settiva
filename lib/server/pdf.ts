import "server-only";
import type { Invoice, PublicInvoice } from "@/lib/contracts";

function escapePdf(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function generateInvoicePdf(
  invoice:
    | Invoice
    | (PublicInvoice & { client_label?: string; invoice_number?: string }),
): Buffer {
  const invoiceNumber =
    ("invoice_number" in invoice
      ? invoice.invoice_number
      : invoice.invoiceNumber) || "INVOICE";
  const status = invoice.status.toUpperCase();
  const network = invoice.network.toUpperCase();
  const assetSymbol =
    "asset_symbol" in invoice ? invoice.asset_symbol : invoice.asset.symbol;
  const assetName =
    "asset" in invoice ? invoice.asset.name : invoice.asset_symbol;
  const contract =
    "token_contract_id" in invoice
      ? invoice.token_contract_id
      : invoice.asset.contract;
  const receivingAccount =
    "receiving_account" in invoice
      ? invoice.receiving_account
      : invoice.receivingAccount;
  const paymentRef =
    "payment_reference" in invoice
      ? invoice.payment_reference
      : invoice.paymentReference;
  const amountDisplay =
    "amount_display" in invoice
      ? invoice.amount_display
      : invoice.amountDisplay;
  const dueDate = "due_date" in invoice ? invoice.due_date : invoice.dueDate;
  const createdAt = (
    "created_at" in invoice ? invoice.created_at : invoice.createdAt
  ).slice(0, 10);
  const merchantName =
    "merchant_display_name" in invoice
      ? (invoice as { merchant_display_name?: string }).merchant_display_name ||
        "Merchant"
      : "merchantDisplayName" in invoice
        ? invoice.merchantDisplayName
        : "Merchant";

  const items: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    total: string;
  }> = (
    "items" in invoice && Array.isArray(invoice.items) ? invoice.items : []
  ).map((item: any) => ({
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: "unit_price" in item ? item.unit_price : item.unitPrice,
    total: item.total,
  }));

  const commands: string[] = [];

  // Colors:
  // Green accent: 0.133 0.443 0.286 (rgb 34, 113, 73)
  // Dark text: 0.1 0.1 0.1
  // Muted: 0.4 0.4 0.4
  // Light bg: 0.95 0.97 0.95
  // Border: 0.85 0.85 0.85

  // Header background banner
  commands.push("0.133 0.443 0.286 rg");
  commands.push("40 730 532 36 re f");

  // Header Title
  commands.push("1 1 1 rg");
  commands.push("BT /F2 16 Tf 55 742 Td (SETTIVA INVOICE) Tj ET");

  // Header Badge (Network)
  commands.push("BT /F2 10 Tf 460 744 Td (TESTNET DEMO) Tj ET");

  // Document Info
  commands.push("0.1 0.1 0.1 rg");
  commands.push(`BT /F2 18 Tf 50 690 Td (${escapePdf(invoiceNumber)}) Tj ET`);

  commands.push("0.4 0.4 0.4 rg");
  commands.push(
    `BT /F1 10 Tf 50 672 Td (Issue Date: ${escapePdf(createdAt)}) Tj ET`,
  );
  if (dueDate) {
    commands.push(
      `BT /F1 10 Tf 200 672 Td (Due Date: ${escapePdf(dueDate)}) Tj ET`,
    );
  }
  commands.push(`BT /F2 10 Tf 450 672 Td (Status: ${escapePdf(status)}) Tj ET`);

  // Divider line
  commands.push("0.85 0.85 0.85 RG 1 w");
  commands.push("50 655 m 562 655 l S");

  // Merchant info box
  commands.push("0.96 0.97 0.96 rg");
  commands.push("50 590 512 55 re f");
  commands.push("0.85 0.85 0.85 RG 1 w");
  commands.push("50 590 512 55 re S");

  commands.push("0.4 0.4 0.4 rg");
  commands.push("BT /F2 9 Tf 65 630 Td (BILLED BY) Tj ET");
  commands.push("0.1 0.1 0.1 rg");
  commands.push(`BT /F2 12 Tf 65 614 Td (${escapePdf(merchantName)}) Tj ET`);
  commands.push("0.3 0.3 0.3 rg");
  commands.push(
    `BT /F1 9 Tf 65 600 Td (NEAR Receiving Account: ${escapePdf(receivingAccount)}) Tj ET`,
  );

  // Items Table Header
  commands.push("0.2 0.25 0.22 rg");
  commands.push("50 550 512 24 re f");
  commands.push("1 1 1 rg");
  commands.push("BT /F2 10 Tf 60 558 Td (Description) Tj ET");
  commands.push("BT /F2 10 Tf 330 558 Td (Qty) Tj ET");
  commands.push("BT /F2 10 Tf 390 558 Td (Unit Price) Tj ET");
  commands.push("BT /F2 10 Tf 490 558 Td (Total) Tj ET");

  // Items rows
  let y = 525;
  for (const item of items) {
    // Alternating background
    commands.push("0.1 0.1 0.1 rg");
    commands.push(
      `BT /F1 10 Tf 60 ${y} Td (${escapePdf(item.description.slice(0, 45))}) Tj ET`,
    );
    commands.push(
      `BT /F1 10 Tf 335 ${y} Td (${escapePdf(String(item.quantity))}) Tj ET`,
    );
    commands.push(
      `BT /F1 10 Tf 390 ${y} Td (${escapePdf(item.unitPrice)}) Tj ET`,
    );
    commands.push(`BT /F2 10 Tf 490 ${y} Td (${escapePdf(item.total)}) Tj ET`);

    // row line
    commands.push("0.9 0.9 0.9 RG 0.5 w");
    commands.push(`50 ${y - 6} m 562 ${y - 6} l S`);
    y -= 24;
  }

  // Subtotal & Total
  y -= 10;
  commands.push("0.133 0.443 0.286 rg");
  commands.push(
    `BT /F2 14 Tf 420 ${y} Td (Total: ${escapePdf(amountDisplay)} ${escapePdf(assetSymbol)}) Tj ET`,
  );

  // Payment Instructions Box
  y -= 45;
  commands.push("0.94 0.96 0.94 rg");
  commands.push(`50 ${y - 95} 512 110 re f`);
  commands.push("0.133 0.443 0.286 RG 1.5 w");
  commands.push(`50 ${y - 95} 512 110 re S`);

  commands.push("0.133 0.443 0.286 rg");
  commands.push(`BT /F2 11 Tf 65 ${y} Td (PAYMENT INSTRUCTIONS) Tj ET`);

  commands.push("0.2 0.2 0.2 rg");
  commands.push(
    `BT /F1 9 Tf 65 ${y - 18} Td (Network: NEAR ${escapePdf(network)}) Tj ET`,
  );
  commands.push(
    `BT /F1 9 Tf 65 ${y - 32} Td (Asset: ${escapePdf(assetName)} (${escapePdf(assetSymbol)})) Tj ET`,
  );
  commands.push(
    `BT /F1 9 Tf 65 ${y - 46} Td (Token Contract: ${escapePdf(contract)}) Tj ET`,
  );
  commands.push(
    `BT /F1 9 Tf 65 ${y - 60} Td (Destination: ${escapePdf(receivingAccount)}) Tj ET`,
  );

  commands.push("0.1 0.1 0.1 rg");
  commands.push(
    `BT /F2 9 Tf 65 ${y - 78} Td (Payment Reference (Memo): ${escapePdf(paymentRef)}) Tj ET`,
  );
  commands.push("0.4 0.4 0.4 rg");
  commands.push(
    `BT /F1 8 Tf 65 ${y - 90} Td (* Authorize direct NEP-141 ft_transfer. Memo must match the reference above.) Tj ET`,
  );

  // Footer
  commands.push("0.5 0.5 0.5 rg");
  commands.push(
    "BT /F1 8 Tf 180 40 Td (Settiva - Non-custodial invoicing on NEAR. Powered by InvoiceShelf architecture.) Tj ET",
  );

  const streamContent = commands.join("\n");
  const streamBuf = Buffer.from(streamContent, "latin1");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj",
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj",
    `6 0 obj\n<< /Length ${streamBuf.length} >>\nstream\n${streamContent}\nendstream\nendobj`,
  ];

  let offset = 9; // "%PDF-1.4\n"
  const xref = ["0000000000 65535 f \n"];
  const body = objects
    .map((obj) => {
      xref.push(String(offset).padStart(10, "0") + " 00000 n \n");
      const str = obj + "\n";
      offset += Buffer.byteLength(str, "latin1");
      return str;
    })
    .join("");

  const startxref = offset;
  const pdfString = `%PDF-1.4\n${body}xref\n0 ${objects.length + 1}\n${xref.join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  return Buffer.from(pdfString, "latin1");
}
