import { NextRequest } from "next/server";
import { z } from "zod";
import { parse, isLosslessNumber } from "lossless-json";
import {
  createInvoiceForMerchant,
  listInvoicesForMerchant,
  resolveOrigin,
} from "@/lib/server/invoices";
import {
  failure,
  RequestError,
  requireMerchant,
  respond,
} from "@/lib/server/merchant";

const createInvoiceSchema = z
  .object({
    clientLabel: z.string().min(1).max(100),
    description: z.string().max(1000).optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD")
      .optional(),
    network: z.literal("testnet").optional().default("testnet"),
    items: z
      .array(
        z
          .object({
            description: z.string().min(1).max(200),
            quantity: z
              .string()
              .regex(/^\d{1,16}(\.\d{1,4})?$/)
              .refine((value) => BigInt(value.replace(".", "")) > 0n),
            unitPrice: z.string().regex(/^\d+(\.\d+)?$/, "Invalid unit price"),
          })
          .strict(),
      )
      .min(1, "At least one line item is required")
      .max(100),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireMerchant(request);
    const origin = resolveOrigin(request);
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
      body = parse(await request.text(), (key, value) =>
        isLosslessNumber(value)
          ? key === "quantity"
            ? value.toString()
            : value.valueOf()
          : value,
      );
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

    const origin = resolveOrigin(request);
    const invoice = await createInvoiceForMerchant(userId, parsed.data, origin);

    return respond({ invoice }, 201);
  } catch (error) {
    return failure(error);
  }
}
