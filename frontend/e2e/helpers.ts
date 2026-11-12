import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page } from "@playwright/test";

/** Clerk test addresses (+clerk_test): no real email is ever sent. */
export const ALICE = "jobfit-e2e-alice+clerk_test@example.com";
export const BOB = "jobfit-e2e-bob+clerk_test@example.com";

/** Sign in as a Clerk test user and wait for the workspace. */
export async function signIn(page: Page, email = ALICE) {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  await expect(page.getByRole("main")).toBeVisible();
}

/** Sign out and wait for the Clerk sign-in form. */
export async function signOut(page: Page) {
  await clerk.signOut({ page });
  await expect(page.getByLabel("Email address")).toBeVisible();
}
