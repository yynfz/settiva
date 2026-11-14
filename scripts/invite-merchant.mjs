import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

// Operator-only provisioning. Never import this into the application bundle.
const email = process.argv[2];
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error("Usage: npm run merchant:invite -- merchant@example.com");
if (!process.stdin.isTTY)
  throw new Error(
    "Run interactively so the temporary password can be entered privately.",
  );
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key)
  throw new Error("Configure the Supabase URL and server secret first.");
let muted = false;
const output = new Writable({
  write(chunk, _encoding, done) {
    if (!muted) process.stdout.write(chunk);
    done();
  },
});
const prompt = createInterface({
  input: process.stdin,
  output,
  terminal: true,
});
console.log(
  `This provisions an invited merchant in the configured Supabase project: ${new URL(url).hostname}`,
);
const confirmation = await prompt.question(
  `Type the merchant email to confirm (${email}): `,
);
if (confirmation !== email) {
  prompt.close();
  throw new Error("Cancelled.");
}
process.stdout.write(
  "Temporary password (at least 12 characters; input hidden): ",
);
muted = true;
const password = await prompt.question("");
muted = false;
prompt.close();
process.stdout.write("\n");
if (password.length < 12)
  throw new Error("Password must contain at least 12 characters.");
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error } = await client.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { settiva_invited: true },
});
if (error)
  throw new Error(
    `Provisioning failed (${error.code || error.status || "unknown"}). Check that the migration is applied and the email is not already registered.`,
  );
console.log(
  "Invited merchant provisioned. Deliver the credentials through your existing private channel. No email was sent.",
);
