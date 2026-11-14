import "server-only";
import crypto from "node:crypto";
import { configuredAsset } from "@/lib/asset";
import type {
  CreateInvoiceInput,
  Invoice,
  InvoiceItem,
  MerchantProfile,
  PublicInvoice,
} from "@/lib/contracts";
import { database, RequestError } from "@/lib/server/merchant";

export function parseExactAmountToAtomic(
  amountStr: string,
  decimals: number,
): { atomic: string; display: string } {
  const trimmed = amountStr.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new RequestError(
      422,
      "invalid_amount",
      "Amount must be a positive decimal number",
    );
  }

  const [integerPart, fractionalPart = ""] = trimmed.split(".");
  if (fractionalPart.length > decimals) {
    throw new RequestError(
      422,
      "invalid_decimals",
      `Amount cannot have more than ${decimals} decimal places`,
    );
  }

  const paddedFraction = fractionalPart.padEnd(decimals, "0");
  const fullAtomicStr = integerPart + paddedFraction;
  const atomicBigInt = BigInt(fullAtomicStr.replace(/^0+/, "") || "0");

  if (atomicBigInt <= 0n) {
    throw new RequestError(
      422,
      "invalid_amount",
      "Amount must be strictly greater than zero",
    );
  }

  // Normalized display format
  const normalizedDisplay = fractionalPart
    ? `${integerPart}.${fractionalPart}`
    : `${integerPart}.00`;

  return {
    atomic: atomicBigInt.toString(),
    display: normalizedDisplay,
  };
}

export function computeItemTotal(
  quantity: number,
  unitPriceStr: string,
  decimals: number,
): { totalDisplay: string; totalAtomic: string } {
  if (quantity <= 0 || !Number.isFinite(quantity)) {
    throw new RequestError(
      422,
      "invalid_quantity",
      "Quantity must be greater than zero",
    );
  }

  const { atomic: unitAtomic } = parseExactAmountToAtomic(
    unitPriceStr,
    decimals,
  );
  // Integer arithmetic: (unitAtomic * quantity)
  // For fractional quantity up to 4 decimal places:
  const qtyDecimals = 4;
  const qtyScaled = BigInt(Math.round(quantity * 10 ** qtyDecimals));
  const totalAtomicBigInt =
    (BigInt(unitAtomic) * qtyScaled) / BigInt(10 ** qtyDecimals);

  if (totalAtomicBigInt <= 0n) {
    throw new RequestError(
      422,
      "invalid_total",
      "Item total must be greater than zero",
    );
  }

  const atomicStr = totalAtomicBigInt.toString();
  const len = atomicStr.length;
  let display: string;
  if (len <= decimals) {
    const frac = atomicStr.padStart(decimals, "0");
    display = `0.${frac}`.replace(/0+$/, "").replace(/\.$/, ".00");
  } else {
    const intPart = atomicStr.slice(0, len - decimals);
    const fracPart = atomicStr.slice(len - decimals).replace(/0+$/, "");
    display = fracPart ? `${intPart}.${fracPart}` : `${intPart}.00`;
  }

  return {
    totalDisplay: display,
    totalAtomic: atomicStr,
  };
}

export function isInvoiceOverdue(
  status: string,
  dueDate: string | null,
): boolean {
  if (status === "paid" || !dueDate) {
    return false;
  }
  const due = new Date(`${dueDate}T23:59:59Z`).getTime();
  return Date.now() > due;
}

export async function createInvoiceForMerchant(
  userId: string,
  input: CreateInvoiceInput,
  origin: string,
): Promise<Invoice> {
  const db = database();

  // 1. Get merchant profile
  const { data: profile, error: profileError } = await db
    .from("merchant_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    throw new RequestError(
      409,
      "merchant_profile_required",
      "You must configure your receiving account before creating an invoice",
    );
  }

  const merchant = profile as unknown as MerchantProfile;
  const decimals = merchant.token_decimals;

  // 2. Validate items
  if (!input.items || input.items.length === 0) {
    throw new RequestError(
      422,
      "items_required",
      "Invoice must contain at least one line item",
    );
  }

  if (!input.clientLabel || input.clientLabel.trim().length === 0) {
    throw new RequestError(
      422,
      "client_label_required",
      "Client label is required for merchant records",
    );
  }

  let totalAtomicSum = 0n;
  const processedItems: {
    description: string;
    quantity: number;
    unit_price: string;
    total: string;
    sort_order: number;
  }[] = [];

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    if (!item.description || item.description.trim().length === 0) {
      throw new RequestError(
        422,
        "item_description_required",
        `Item ${i + 1} must have a description`,
      );
    }

    const { totalDisplay, totalAtomic } = computeItemTotal(
      item.quantity,
      item.unitPrice,
      decimals,
    );

    totalAtomicSum += BigInt(totalAtomic);
    processedItems.push({
      description: item.description.trim(),
      quantity: item.quantity,
      unit_price: item.unitPrice.trim(),
      total: totalDisplay,
      sort_order: i,
    });
  }

  // Calculate invoice display amount from atomic total
  const atomicStr = totalAtomicSum.toString();
  const len = atomicStr.length;
  let amountDisplay: string;
  if (len <= decimals) {
    const frac = atomicStr.padStart(decimals, "0");
    amountDisplay = `0.${frac}`.replace(/0+$/, "").replace(/\.$/, ".00");
  } else {
    const intPart = atomicStr.slice(0, len - decimals);
    const fracPart = atomicStr.slice(len - decimals).replace(/0+$/, "");
    amountDisplay = fracPart ? `${intPart}.${fracPart}` : `${intPart}.00`;
  }

  // 3. Sequential invoice numbering
  const { data: existingInvoices } = await db
    .from("invoices")
    .select("id")
    .eq("merchant_id", userId);

  const nextSeq = (existingInvoices?.length ?? 0) + 1;
  const currentYear = new Date().getUTCFullYear();
  const invoiceNumber = `INV-${currentYear}-${String(nextSeq).padStart(4, "0")}`;

  // 4. Crypto-secure payment reference & access token
  const paymentReference = crypto.randomBytes(32).toString("hex");
  const accessToken = crypto.randomBytes(24).toString("base64url");

  // Validate due date if provided
  let dueDate: string | null = null;
  if (input.dueDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
      throw new RequestError(
        422,
        "invalid_due_date",
        "Due date must be formatted as YYYY-MM-DD",
      );
    }
    dueDate = input.dueDate;
  }

  // 5. Insert invoice
  const { data: invoiceData, error: invoiceError } = await db
    .from("invoices")
    .insert({
      merchant_id: userId,
      invoice_number: invoiceNumber,
      access_token: accessToken,
      payment_reference: paymentReference,
      network: "testnet",
      token_contract_id: merchant.token_contract_id,
      asset_symbol: merchant.asset_symbol,
      token_decimals: merchant.token_decimals,
      asset_kind: merchant.asset_kind,
      receiving_account: merchant.testnet_wallet_id,
      amount_atomic: atomicStr,
      amount_display: amountDisplay,
      status: "unpaid",
      due_date: dueDate,
      client_label: input.clientLabel.trim(),
      description: input.description?.trim() || null,
    })
    .select()
    .single();

  if (invoiceError || !invoiceData) {
    throw new RequestError(
      500,
      "invoice_creation_failed",
      "Failed to record invoice",
      invoiceError?.message,
    );
  }

  // 6. Insert items
  const itemsToInsert = processedItems.map((item) => ({
    invoice_id: invoiceData.id,
    ...item,
  }));

  const { data: itemsData, error: itemsError } = await db
    .from("invoice_items")
    .insert(itemsToInsert)
    .select();

  if (itemsError) {
    throw new RequestError(
      500,
      "items_creation_failed",
      "Failed to record invoice items",
      itemsError.message,
    );
  }

  const portalUrl = `${origin}/portal/${accessToken}`;
  const isOverdue = isInvoiceOverdue(invoiceData.status, invoiceData.due_date);

  return {
    ...invoiceData,
    is_overdue: isOverdue,
    items: (itemsData ?? []) as InvoiceItem[],
    portal_url: portalUrl,
  } as Invoice;
}

export async function listInvoicesForMerchant(
  userId: string,
  origin: string,
): Promise<Invoice[]> {
  const db = database();

  const { data: invoicesData, error: invoicesError } = await db
    .from("invoices")
    .select("*, invoice_items(*)")
    .eq("merchant_id", userId)
    .order("created_at", { ascending: false });

  if (invoicesError) {
    throw new RequestError(
      500,
      "invoices_fetch_failed",
      "Failed to fetch invoices",
      invoicesError.message,
    );
  }

  return (invoicesData || []).map((inv: any) => {
    const items = (inv.invoice_items || []).sort(
      (a: any, b: any) => a.sort_order - b.sort_order,
    );
    const isOverdue = isInvoiceOverdue(inv.status, inv.due_date);
    return {
      id: inv.id,
      merchant_id: inv.merchant_id,
      invoice_number: inv.invoice_number,
      access_token: inv.access_token,
      payment_reference: inv.payment_reference,
      network: inv.network,
      token_contract_id: inv.token_contract_id,
      asset_symbol: inv.asset_symbol,
      token_decimals: inv.token_decimals,
      asset_kind: inv.asset_kind,
      receiving_account: inv.receiving_account,
      amount_atomic: inv.amount_atomic,
      amount_display: inv.amount_display,
      status: inv.status,
      is_overdue: isOverdue,
      due_date: inv.due_date,
      client_label: inv.client_label,
      description: inv.description,
      created_at: inv.created_at,
      viewed_at: inv.viewed_at,
      paid_at: inv.paid_at,
      items,
      portal_url: `${origin}/portal/${inv.access_token}`,
    };
  });
}

export async function getPublicInvoiceByToken(
  accessToken: string,
): Promise<PublicInvoice> {
  const db = database();

  const { data: invoiceData, error: invoiceError } = await db
    .from("invoices")
    .select("*, merchant_profiles(display_name), invoice_items(*)")
    .eq("access_token", accessToken)
    .maybeSingle();

  if (invoiceError || !invoiceData) {
    throw new RequestError(404, "invoice_not_found", "Invoice not found");
  }

  // Record reading event if status was unpaid (InvoiceShelf recordReading pattern)
  if (invoiceData.status === "unpaid") {
    await db
      .from("invoices")
      .update({
        status: "viewed",
        viewed_at: new Date().toISOString(),
      })
      .eq("id", invoiceData.id);
    invoiceData.status = "viewed";
  }

  const asset = configuredAsset();
  const isOverdue = isInvoiceOverdue(invoiceData.status, invoiceData.due_date);
  const items = (invoiceData.invoice_items || [])
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((item: any) => ({
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: item.unit_price,
      total: item.total,
    }));

  const merchantDisplayName =
    invoiceData.merchant_profiles?.display_name || "Merchant";

  // Strict public projection: NEVER expose client_label or description!
  return {
    invoiceNumber: invoiceData.invoice_number,
    merchantDisplayName,
    network: invoiceData.network,
    asset,
    receivingAccount: invoiceData.receiving_account,
    paymentReference: invoiceData.payment_reference,
    amountDisplay: invoiceData.amount_display,
    amountAtomic: invoiceData.amount_atomic,
    status: invoiceData.status,
    isOverdue,
    dueDate: invoiceData.due_date,
    items,
    createdAt: invoiceData.created_at,
    viewedAt: invoiceData.viewed_at,
    paidAt: invoiceData.paid_at,
  };
}

export async function getInvoiceByIdForMerchant(
  invoiceId: string,
  userId: string,
  origin: string,
): Promise<Invoice> {
  const db = database();

  const { data: inv, error } = await db
    .from("invoices")
    .select("*, invoice_items(*)")
    .eq("id", invoiceId)
    .eq("merchant_id", userId)
    .maybeSingle();

  if (error || !inv) {
    throw new RequestError(404, "invoice_not_found", "Invoice not found");
  }

  const items = (inv.invoice_items || []).sort(
    (a: any, b: any) => a.sort_order - b.sort_order,
  );
  const isOverdue = isInvoiceOverdue(inv.status, inv.due_date);

  return {
    ...inv,
    is_overdue: isOverdue,
    items,
    portal_url: `${origin}/portal/${inv.access_token}`,
  };
}
