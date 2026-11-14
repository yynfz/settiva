import { NextRequest } from "next/server";
import { failure, requireMerchant, respond } from "@/lib/server/merchant";
import { listOverpaymentsForInvoice } from "@/lib/server/payments";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireMerchant(request);
    const { id } = await context.params;
    const overpayments = await listOverpaymentsForInvoice(id, userId);
    return respond({ overpayments });
  } catch (error) {
    return failure(error);
  }
}
