import "server-only";
import { networkPolicy } from "./network";
import crypto from "node:crypto";
import { checkReceivingAccount } from "./near";
import type {
  CreateInvoiceInput,
  Invoice,
  InvoiceItem,
  MerchantProfile,
  PublicInvoice,
} from "@/lib/contracts";
import { database, RequestError } from "@/lib/server/merchant";

import { computeItemTotal } from "../amounts";

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
  const checked = await checkReceivingAccount(merchant.testnet_wallet_id);
  if (
    checked.asset.contract !== merchant.token_contract_id ||
    checked.asset.decimals !== merchant.token_decimals ||
    checked.asset.kind !== merchant.asset_kind ||
    checked.asset.symbol !== merchant.asset_symbol
  )
    throw new RequestError(
      409,
      "asset_configuration_changed",
      "Reconfirm your receiving account before issuing invoices with the current asset.",
    );

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
    quantity: string;
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
  if (decimals === 0) {
    amountDisplay = atomicStr;
  } else if (len <= decimals) {
    const frac = atomicStr.padStart(decimals, "0");
    amountDisplay = `0.${frac}`.replace(/0+$/, "").replace(/\.$/, ".00");
  } else {
    const intPart = atomicStr.slice(0, len - decimals);
    const fracPart = atomicStr.slice(len - decimals).replace(/0+$/, "");
    amountDisplay = fracPart ? `${intPart}.${fracPart}` : `${intPart}.00`;
  }

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

  const { data: invoiceData, error: invoiceError } = await db.rpc(
    "issue_invoice",
    {
      p_merchant: userId,
      p_terms: {
        access_token: accessToken,
        payment_reference: paymentReference,
        network: "testnet",
        token_contract_id: merchant.token_contract_id,
        asset_symbol: merchant.asset_symbol,
        token_decimals: decimals,
        asset_kind: merchant.asset_kind,
        receiving_account: merchant.testnet_wallet_id,
        amount_atomic: atomicStr,
        amount_display: amountDisplay,
        due_date: dueDate,
        client_label: input.clientLabel.trim(),
        description: input.description?.trim() || null,
      },
      p_items: processedItems,
    },
  );
  if (invoiceError || !invoiceData)
    throw new RequestError(
      503,
      "invoice_creation_failed",
      "Invoice could not be issued. Check the details and try again.",
    );
  const portalUrl = `${origin}/portal/${accessToken}`;
  const isOverdue = isInvoiceOverdue(invoiceData.status, invoiceData.due_date);

  return {
    ...invoiceData,
    is_overdue: isOverdue,
    items: invoiceData.items as InvoiceItem[],
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
      badge: networkPolicy(inv.network).badge,
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
      .eq("id", invoiceData.id)
      .eq("status", "unpaid");
    invoiceData.status = "viewed";
  }

  const asset = {
    kind: invoiceData.asset_kind,
    contract: invoiceData.token_contract_id,
    name:
      invoiceData.asset_kind === "circle-usdc"
        ? "USDC"
        : invoiceData.asset_symbol,
    symbol: invoiceData.asset_symbol,
    decimals: invoiceData.token_decimals,
    label:
      invoiceData.asset_kind === "circle-usdc"
        ? invoiceData.network === "mainnet"
          ? "Circle native USDC · Mainnet"
          : "Circle testnet USDC — no monetary value"
        : "Test token — no monetary value",
  };
  const isOverdue = isInvoiceOverdue(invoiceData.status, invoiceData.due_date);
  const items = (invoiceData.invoice_items || [])
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((item: any) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      total: item.total,
    }));

  const merchantDisplayName =
    invoiceData.merchant_profiles?.display_name || "Merchant";

  // Strict public projection: NEVER expose client_label or description!
  return {
    ...networkPolicy(invoiceData.network),
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
    badge: networkPolicy(inv.network).badge,
    ...inv,
    is_overdue: isOverdue,
    items,
    portal_url: `${origin}/portal/${inv.access_token}`,
  };
}

export function resolveOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const origin = new URL(configured || request.url);
  if (!["http:", "https:"].includes(origin.protocol))
    throw new Error("Set an HTTP(S) NEXT_PUBLIC_APP_URL.");
  return origin.origin;
}
