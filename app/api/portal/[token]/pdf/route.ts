import { NextRequest, NextResponse } from "next/server";
import { getPublicInvoiceByToken } from "@/lib/server/invoices";
import { failure } from "@/lib/server/merchant";
import { generateInvoicePdf } from "@/lib/server/pdf";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const publicInvoice = await getPublicInvoiceByToken(token);
    const pdfBuffer = generateInvoicePdf(publicInvoice);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${publicInvoice.invoiceNumber}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
