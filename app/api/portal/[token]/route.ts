import { NextRequest } from "next/server";
import { getPublicInvoiceByToken } from "@/lib/server/invoices";
import { failure, respond } from "@/lib/server/merchant";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const publicInvoice = await getPublicInvoiceByToken(token);
    return respond({ invoice: publicInvoice });
  } catch (error) {
    return failure(error);
  }
}
