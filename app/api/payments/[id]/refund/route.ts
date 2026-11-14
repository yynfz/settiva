import { NextRequest } from "next/server";
import { z } from "zod";
import {
  failure,
  RequestError,
  requireMerchant,
  respond,
} from "@/lib/server/merchant";
import { verifyRefund } from "@/lib/server/payments";

const refundInput = z
  .object({
    refundHash: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/),
  })
  .strict();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireMerchant(request);
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = refundInput.safeParse(body);
    if (!parsed.success) {
      throw new RequestError(
        400,
        "invalid_refund_input",
        "Supply a valid NEAR transaction hash for the refund.",
      );
    }
    const result = await verifyRefund(id, userId, parsed.data.refundHash);
    return respond({ overpayment: result });
  } catch (error) {
    return failure(error);
  }
}
