import { NextRequest, NextResponse } from "next/server";
import { getInvoiceByIdForMerchant } from "@/lib/server/invoices";
import { failure, requireMerchant } from "@/lib/server/merchant";
import { generateInvoicePdf } from "@/lib/server/pdf";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireMerchant(request);
    const { id } = await context.params;
    const origin = request.nextUrl.origin;
    const invoice = await getInvoiceByIdForMerchant(id, userId, origin);
    const pdfBuffer = generateInvoicePdf(invoice);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.invoice_number}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
