import { requireMerchant, failure } from "@/lib/server/merchant";
import { getInvoiceByIdForMerchant } from "@/lib/server/invoices";
import { GET as publicReceipt } from "@/app/api/portal/[token]/receipt/pdf/route";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireMerchant(request);
    const invoice = await getInvoiceByIdForMerchant(
      (await context.params).id,
      userId,
      new URL(request.url).origin,
    );
    return publicReceipt(request, {
      params: Promise.resolve({ token: invoice.access_token }),
    });
  } catch (error) {
    return failure(error);
  }
}
