import { NextRequest } from "next/server";
import { failure, requireMerchant } from "@/lib/server/merchant";
import { getOverpaymentById } from "@/lib/server/payments";
import { refundPdf } from "@/lib/server/refund-pdf";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireMerchant(request);
    const { id } = await context.params;
    const overpayment = await getOverpaymentById(id, userId);
    const pdf = refundPdf(overpayment);
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="credit-note-${overpayment.invoiceNumber}.pdf"`,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
