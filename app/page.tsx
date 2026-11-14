import { MerchantApp } from "./merchant-setup";
export const dynamic = "force-dynamic";
export default function Page() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey)
    return (
      <main className="shell">
        <section className="card">
          <h1>Settiva</h1>
          <p>Merchant access is being configured. Please check back shortly.</p>
        </section>
      </main>
    );
  return <MerchantApp url={url} publishableKey={publishableKey} />;
}
