import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Settiva — Direct invoices. Verified payments.",
  description:
    "Itemized invoices, direct NEAR payments, and independently verified payment and refund evidence.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
