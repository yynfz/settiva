import { test, expect } from "vitest";
import { environment } from "./support/context";
test("admin provisioning accepts metadata assigned after insertion in the same transaction", async () => {
  const response = await fetch(`${environment().supabaseUrl}/__admin-create`, {
    method: "POST",
  });
  expect(response.status).toBe(200);
});
