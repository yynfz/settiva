import "server-only";
import { createClient } from "@supabase/supabase-js";

export class RequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
function setting(name: string) {
  const value = process.env[name];
  if (!value)
    throw new RequestError(
      503,
      "configuration",
      "Merchant setup is not configured yet.",
    );
  return value;
}
export function database(token?: string) {
  return createClient(
    setting("NEXT_PUBLIC_SUPABASE_URL"),
    setting(
      token ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" : "SUPABASE_SECRET_KEY",
    ),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      ...(token
        ? { global: { headers: { Authorization: `Bearer ${token}` } } }
        : {}),
    },
  );
}
export async function requireMerchant(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    throw new RequestError(
      401,
      "unauthenticated",
      "Sign in with an invited merchant account.",
    );
  const token = authorization.slice(7);
  const client = database(token);
  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);
  if (error || !user)
    throw new RequestError(
      401,
      "unauthenticated",
      "Your session has expired. Please sign in again.",
    );
  const access = await client
    .from("merchant_access")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (access.error)
    throw new RequestError(
      503,
      "unavailable",
      "Merchant access is temporarily unavailable.",
    );
  if (!access.data)
    throw new RequestError(
      403,
      "invitation_required",
      "This account has not been invited to Settiva.",
    );
  return { client, userId: user.id };
}
export function respond(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function failure(error: unknown) {
  if (error instanceof RequestError)
    return respond(
      { error: error.message, code: error.code, details: error.details },
      error.status,
    );
  return respond(
    {
      error: "Merchant setup is temporarily unavailable. Please try again.",
      code: "unavailable",
    },
    503,
  );
}
