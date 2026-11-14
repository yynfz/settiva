import { appliedReceipt, paymentInvoice } from "@/lib/server/payments";
import { failure, RequestError } from "@/lib/server/merchant";
import { receiptPdf } from "@/lib/server/receipt-pdf";
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const invoice = await paymentInvoice((await context.params).token);
    const receipt = await appliedReceipt(invoice);
    if (!receipt)
      throw new RequestError(
        409,
        "not_paid",
        "No verified payment receipt yet.",
      );
    return new Response(receiptPdf(receipt), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'attachment; filename="settiva-payment-receipt.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
