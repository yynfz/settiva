import { NextRequest } from "next/server";
import { z } from "zod";
import {
  createInvoiceForMerchant,
  listInvoicesForMerchant,
} from "@/lib/server/invoices";
import {
  failure,
  RequestError,
  requireMerchant,
  respond,
} from "@/lib/server/merchant";

const createInvoiceSchema = z.object({
  clientLabel: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD")
    .optional(),
  network: z.literal("testnet").optional().default("testnet"),
  items: z
    .array(
      z.object({
        description: z.string().min(1).max(200),
        quantity: z.number().positive(),
        unitPrice: z.string().regex(/^\d+(\.\d+)?$/, "Invalid unit price"),
      }),
    )
    .min(1, "At least one line item is required"),
});

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireMerchant(request);
    const origin = request.nextUrl.origin;
    const invoices = await listInvoicesForMerchant(userId, origin);
    return respond({ invoices });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireMerchant(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new RequestError(400, "invalid_json", "Invalid JSON payload");
    }

    // Check mainnet rejection server-side
    if (
      body &&
      typeof body === "object" &&
      "network" in body &&
      (body as any).network === "mainnet"
    ) {
      throw new RequestError(
        403,
        "mainnet_disabled",
        "Mainnet invoice issuance is currently disabled",
      );
    }

    const parsed = createInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      throw new RequestError(
        422,
        "validation_failed",
        parsed.error.issues[0]?.message || "Validation failed",
        parsed.error.flatten(),
      );
    }

    const origin = request.nextUrl.origin;
    const invoice = await createInvoiceForMerchant(userId, parsed.data, origin);

    return respond({ invoice }, 201);
  } catch (error) {
    return failure(error);
  }
}
