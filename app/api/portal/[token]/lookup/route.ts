import { z } from "zod";
import { lookupTransfer } from "@/lib/server/payments";
import { failure, RequestError, respond } from "@/lib/server/merchant";
import { receiptPdf } from "@/lib/server/receipt-pdf";
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const url = new URL(request.url);
    const hash = z
      .string()
      .regex(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/)
      .safeParse(url.searchParams.get("hash"));
    if (!hash.success)
      throw new RequestError(
        400,
        "invalid_hash",
        "Enter a valid transaction hash.",
      );
    const result = await lookupTransfer(
      (await context.params).token,
      hash.data,
    );
    if (url.searchParams.get("format") === "pdf") {
      if (!result.details)
        throw new RequestError(
          409,
          "unverified",
          "Only verified transfers have a receipt.",
        );
      return new Response(receiptPdf(result.details), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="transfer-receipt.pdf"',
          "Cache-Control": "no-store",
        },
      });
    }
    return respond(result);
  } catch (error) {
    return failure(error);
  }
}
