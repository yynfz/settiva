import { TransferLookup } from "../../transfer-lookup";
export default async function LookupPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <TransferLookup token={(await params).token} />;
}
