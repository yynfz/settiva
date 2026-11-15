import {
  database,
  requireMerchant,
  respond,
  failure,
} from "@/lib/server/merchant";
import { getInvoiceByIdForMerchant } from "@/lib/server/invoices";
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
    const db = database();
    const [attempts, payments] = await Promise.all([
      db
        .from("payment_attempts")
        .select(
          "transaction_hash,sender_account,outcome,error_code,created_at,resolved_at",
        )
        .eq("invoice_id", invoice.id)
        .order("created_at"),
      db
        .from("verified_payments")
        .select("*")
        .eq("invoice_id", invoice.id)
        .order("verified_at"),
    ]);
    if (attempts.error || payments.error)
      throw attempts.error || payments.error;
    return respond({ attempts: attempts.data, payments: payments.data });
  } catch (error) {
    return failure(error);
  }
}
