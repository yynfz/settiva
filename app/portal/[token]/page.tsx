import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicInvoiceByToken } from "@/lib/server/invoices";

export const dynamic = "force-dynamic";

export default async function CustomerPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let invoice;
  try {
    invoice = await getPublicInvoiceByToken(token);
  } catch (err: any) {
    if (err?.status === 404 || err?.code === "invoice_not_found") {
      notFound();
    }
    throw err;
  }

  const isOverdue = invoice.isOverdue;
  const statusDisplay =
    isOverdue && invoice.status !== "paid"
      ? "OVERDUE"
      : invoice.status.toUpperCase();

  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#1c2420] font-sans pb-16">
      {/* Top Navigation */}
      <header className="bg-white border-b border-[#e2e7e3] px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#227149] text-white flex items-center justify-center font-bold text-lg">
            S
          </div>
          <div>
            <span className="font-semibold tracking-tight text-lg text-[#1c2420]">
              Settiva
            </span>
            <span className="text-xs text-[#637267] ml-2 hidden sm:inline">
              Customer Portal
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-[#eef5f0] text-[#227149] border border-[#d2e4d7]">
            TESTNET DEMO
          </span>
          <a
            href={`/api/portal/${token}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs bg-[#227149] hover:bg-[#1a5b3a] text-white font-medium px-3.5 py-1.5 rounded-md transition-colors shadow-xs"
          >
            Download PDF
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-8">
        {/* Status Notice */}
        {isOverdue && invoice.status !== "paid" && (
          <div className="mb-6 p-4 rounded-lg bg-[#fff4e5] border border-[#ffe0b2] text-[#8c4d00] text-sm flex items-center gap-2">
            <span className="font-semibold">Notice:</span> This invoice is past
            its advisory due date ({invoice.dueDate}), but remains payable.
          </div>
        )}

        {/* Invoice Card */}
        <div className="bg-white rounded-xl border border-[#e2e7e3] shadow-xs overflow-hidden">
          {/* Card Header */}
          <div className="p-6 sm:p-8 border-b border-[#e2e7e3]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-[#637267] uppercase tracking-wider">
                  Invoice
                </span>
                <h1 className="text-2xl sm:text-3xl font-bold text-[#1c2420] tracking-tight mt-0.5">
                  {invoice.invoiceNumber}
                </h1>
                <p className="text-sm text-[#637267] mt-1">
                  Issued on {invoice.createdAt.slice(0, 10)}
                  {invoice.dueDate && ` • Due by ${invoice.dueDate}`}
                </p>
              </div>

              <div className="flex sm:flex-col items-start sm:items-end justify-between">
                <span
                  className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider ${
                    invoice.status === "paid"
                      ? "bg-[#eef5f0] text-[#227149] border border-[#d2e4d7]"
                      : isOverdue
                        ? "bg-[#ffebe8] text-[#c93b2b] border border-[#f5c6cb]"
                        : "bg-[#fff8e1] text-[#b78103] border border-[#ffe082]"
                  }`}
                >
                  {statusDisplay}
                </span>
                <div className="text-right mt-2">
                  <span className="text-xs text-[#637267] block">
                    Total Amount
                  </span>
                  <span className="text-2xl font-bold text-[#1c2420]">
                    {invoice.amountDisplay}{" "}
                    <span className="text-sm font-semibold text-[#227149]">
                      {invoice.asset.symbol}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Parties: Billed By */}
          <div className="px-6 sm:px-8 py-5 bg-[#fafbfa] border-b border-[#e2e7e3] grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#637267]">
                Billed By
              </span>
              <p className="text-base font-semibold text-[#1c2420] mt-0.5">
                {invoice.merchantDisplayName}
              </p>
              <p className="text-xs text-[#637267] font-mono mt-0.5">
                NEAR Destination: {invoice.receivingAccount}
              </p>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#637267]">
                Payment Currency
              </span>
              <p className="text-base font-semibold text-[#1c2420] mt-0.5">
                {invoice.asset.name} ({invoice.asset.symbol})
              </p>
              <p className="text-xs text-[#637267] mt-0.5">
                {invoice.asset.label}
              </p>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="p-6 sm:p-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#637267] mb-4">
              Itemized Breakdown
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#e2e7e3] text-xs font-semibold text-[#637267] uppercase">
                    <th className="pb-3 pr-4">Description</th>
                    <th className="pb-3 px-4 text-center">Qty</th>
                    <th className="pb-3 px-4 text-right">Unit Price</th>
                    <th className="pb-3 pl-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f3f1] text-sm">
                  {invoice.items.map((item: any, index: number) => (
                    <tr key={index}>
                      <td className="py-3.5 pr-4 text-[#1c2420] font-medium">
                        {item.description}
                      </td>
                      <td className="py-3.5 px-4 text-center text-[#637267]">
                        {item.quantity}
                      </td>
                      <td className="py-3.5 px-4 text-right text-[#637267]">
                        {item.unitPrice}
                      </td>
                      <td className="py-3.5 pl-4 text-right font-semibold text-[#1c2420]">
                        {item.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#1c2420]">
                    <td
                      colSpan={3}
                      className="pt-4 text-right font-bold text-sm text-[#1c2420]"
                    >
                      Total ({invoice.asset.symbol})
                    </td>
                    <td className="pt-4 pl-4 text-right font-bold text-lg text-[#227149]">
                      {invoice.amountDisplay}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Payment Instructions Card */}
          <div className="p-6 sm:p-8 bg-[#f4f7f4] border-t border-[#e2e7e3]">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#227149] mb-3">
              Payment Instructions
            </h2>
            <div className="space-y-2.5 text-xs text-[#2c3830]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between py-1 border-b border-[#e2e8e3]">
                <span className="text-[#637267]">Network:</span>
                <span className="font-semibold text-[#1c2420]">
                  NEAR Testnet
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between py-1 border-b border-[#e2e8e3]">
                <span className="text-[#637267]">Asset Contract:</span>
                <span className="font-mono text-[#1c2420] break-all">
                  {invoice.asset.contract}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between py-1 border-b border-[#e2e8e3]">
                <span className="text-[#637267]">Receiving Account:</span>
                <span className="font-mono font-semibold text-[#1c2420]">
                  {invoice.receivingAccount}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between py-1 border-b border-[#e2e8e3]">
                <span className="text-[#637267]">
                  Payment Reference (Memo):
                </span>
                <span className="font-mono text-[#227149] font-bold break-all select-all">
                  {invoice.paymentReference}
                </span>
              </div>
            </div>

            <div className="mt-4 p-3 bg-white rounded-lg border border-[#d2e0d5] text-xs text-[#48564c]">
              <p className="font-semibold text-[#227149]">How to pay:</p>
              <p className="mt-1">
                Authorize a direct{" "}
                <code className="bg-[#eef2ef] px-1 py-0.5 rounded text-[#1c2420]">
                  ft_transfer
                </code>{" "}
                to the receiving account with exactly{" "}
                <strong>
                  {invoice.amountDisplay} {invoice.asset.symbol}
                </strong>{" "}
                and paste the payment reference above as the memo.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-[#8c9c90] mt-8">
          Settiva • Powered by InvoiceShelf architecture & NEAR Protocol
        </footer>
      </main>
    </div>
  );
}
