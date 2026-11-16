import { clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";

import { ALICE, BOB, signIn } from "./helpers";

const CLERK_API = "https://api.clerk.com/v1";
const headers = () => ({
  Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
  "Content-Type": "application/json",
});

/** The Clerk user with this email, created in the dev instance if it does not exist yet. */
async function ensureUser(email: string): Promise<{ id: string }> {
  const found = await fetch(`${CLERK_API}/users?email_address=${encodeURIComponent(email)}`, { headers: headers() });
  expect(found.ok).toBe(true);
  const [user] = await found.json();
  if (user) return user;
  const created = await fetch(`${CLERK_API}/users`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email_address: [email], skip_password_requirement: true }),
  });
  expect(created.ok, await created.text()).toBe(true);
  return created.json();
}

/** The key of the user's active Clerk Billing plan, e.g. "free" or "pro". */
async function activePlan(userId: string): Promise<string> {
  const response = await fetch(`${CLERK_API}/users/${userId}/billing/subscription`, { headers: headers() });
  expect(response.ok, await response.clone().text()).toBe(true);
  const items: { status: string; plan: { slug: string } }[] = (await response.json()).subscription_items;
  return items.find((item) => item.status === "active")!.plan.slug;
}

setup.describe.configure({ mode: "serial" });

/** Alice is on Pro (paid features: PDFs, premium models, Pro mode); Bob stays on Free (the free plan's limits). */
setup("clerk testing token and test users on their plans", async ({ page }) => {
  setup.setTimeout(120_000);
  await clerkSetup();
  const alice = await ensureUser(ALICE);
  const bob = await ensureUser(BOB);
  expect(await activePlan(bob.id), "Bob must stay on the Free plan").toBe("free");
  if ((await activePlan(alice.id)) === "pro") return;
  // Subscribe Alice through the real checkout with the development gateway's test card.
  await signIn(page, ALICE);
  await page.getByRole("button", { name: "Plans" }).click();
  await page.getByRole("dialog", { name: "Plans" }).getByRole("button", { name: /Subscribe|Switch to this plan/ }).last().click();
  await page.getByRole("button", { name: "Pay with test card" }).click();
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect.poll(() => activePlan(alice.id), { timeout: 60_000 }).toBe("pro");
});
