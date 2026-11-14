export type Asset = {
  kind: "circle-usdc" | "test-token";
  contract: string;
  name: string;
  symbol: string;
  decimals: number;
  label: string;
};

export type MerchantProfile = {
  display_name: string;
  testnet_wallet_id: string;
  token_contract_id: string;
  asset_symbol: string;
  token_decimals: number;
  asset_kind: Asset["kind"];
  checked_at: string;
};

export type MerchantSetup = {
  profile: MerchantProfile | null;
  network: "testnet";
  mainnetEnabled: false;
  asset: Asset;
};

export type StorageGuidance = {
  network: string;
  contract: string;
  method: string;
  args: { account_id: string; registration_only: boolean };
  minimumDepositYocto: string;
};

export type InvoiceItem = {
  id?: string;
  invoice_id?: string;
  description: string;
  quantity: number;
  unit_price: string;
  total: string;
  sort_order?: number;
};

export type Invoice = {
  id: string;
  merchant_id: string;
  invoice_number: string;
  access_token: string;
  payment_reference: string;
  network: "testnet" | "mainnet";
  token_contract_id: string;
  asset_symbol: string;
  token_decimals: number;
  asset_kind: Asset["kind"];
  receiving_account: string;
  amount_atomic: string;
  amount_display: string;
  status: "unpaid" | "viewed" | "paid";
  is_overdue: boolean;
  due_date: string | null;
  client_label: string;
  description: string | null;
  created_at: string;
  viewed_at: string | null;
  paid_at: string | null;
  items: InvoiceItem[];
  portal_url: string;
};

export type PublicInvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: string;
  total: string;
};

export type PublicInvoice = {
  invoiceNumber: string;
  merchantDisplayName: string;
  network: "testnet" | "mainnet";
  asset: Asset;
  receivingAccount: string;
  paymentReference: string;
  amountDisplay: string;
  amountAtomic: string;
  status: "unpaid" | "viewed" | "paid";
  isOverdue: boolean;
  dueDate: string | null;
  items: PublicInvoiceItem[];
  createdAt: string;
  viewedAt: string | null;
  paidAt: string | null;
};

export type CreateInvoiceItemInput = {
  description: string;
  quantity: number;
  unitPrice: string;
};

export type CreateInvoiceInput = {
  clientLabel: string;
  description?: string;
  dueDate?: string;
  items: CreateInvoiceItemInput[];
};
