import { paymentInvoice } from "@/lib/server/payments";
import { networkPolicy } from "@/lib/server/network";
import { failure, respond, RequestError } from "@/lib/server/merchant";
export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const invoice = await paymentInvoice((await context.params).token);
    const policy = networkPolicy(invoice.network);
    if (!policy.checkoutEnabled)
      throw new RequestError(
        403,
        "mainnet_disabled",
        "Checkout is disabled for this network.",
      );
    return respond({
      ...policy,
      receiverId: invoice.token_contract_id,
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "ft_transfer",
            args: {
              receiver_id: invoice.receiving_account,
              amount: invoice.amount_atomic,
              memo: invoice.payment_reference,
            },
            gas: "30000000000000",
            deposit: "1",
          },
        },
      ],
    });
  } catch (error) {
    return failure(error);
  }
}
