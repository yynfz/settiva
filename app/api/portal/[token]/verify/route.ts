import { z } from "zod";
import { accountId } from "@/lib/asset";
import { failure, RequestError, respond } from "@/lib/server/merchant";
import { verifyPayment } from "@/lib/server/payments";
const submission = z
  .object({
    transactionHash: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/),
    senderAccount: accountId,
  })
  .strict();
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const input = submission.safeParse(await request.json().catch(() => null));
    if (!input.success)
      throw new RequestError(
        400,
        "invalid_submission",
        "Supply only the transaction hash and sender account.",
      );
    const { token } = await context.params;
    return respond(
      await verifyPayment(
        token,
        input.data.transactionHash,
        input.data.senderAccount,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
