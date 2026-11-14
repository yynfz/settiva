import { NextRequest } from "next/server";
import { getPublicInvoiceByToken } from "@/lib/server/invoices";
import {
  appliedReceipt,
  paymentInvoice,
  pendingAttempts,
} from "@/lib/server/payments";
import { failure, respond } from "@/lib/server/merchant";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const [publicInvoice, invoice] = await Promise.all([
      getPublicInvoiceByToken(token),
      paymentInvoice(token).catch(() => null),
    ]);
    const [receipt, pending] = invoice
      ? await Promise.all([appliedReceipt(invoice), pendingAttempts(token)])
      : [null, []];
    return respond({
      invoice: publicInvoice,
      receipt,
      pendingAttempts: pending,
    });
  } catch (error) {
    return failure(error);
  }
}
