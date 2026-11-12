import { clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";

import { ALICE, BOB } from "./helpers";

const CLERK_API = "https://api.clerk.com/v1";

/** Create a Clerk user with this email in the dev instance if it does not exist yet. */
async function ensureUser(email: string) {
  const headers = {
    Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
  const found = await fetch(`${CLERK_API}/users?email_address=${encodeURIComponent(email)}`, { headers });
  expect(found.ok).toBe(true);
  if ((await found.json()).length > 0) return;
  const created = await fetch(`${CLERK_API}/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email_address: [email], skip_password_requirement: true }),
  });
  expect(created.ok, await created.text()).toBe(true);
}

setup.describe.configure({ mode: "serial" });

setup("clerk testing token and test users", async () => {
  await clerkSetup();
  await ensureUser(ALICE);
  await ensureUser(BOB);
});
