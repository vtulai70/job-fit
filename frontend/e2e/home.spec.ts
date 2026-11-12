import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test("workspace shows the layout after sign in", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveTitle("JobFit");
  await expect(page.getByRole("heading", { name: "JobFit" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Baseline resume" })).toBeVisible();
  await expect(page.getByLabel("Job description")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "AI chat" })).toBeVisible();
});

test("health indicator reports the API is up", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText("API: ok")).toBeVisible();
});

test("API health endpoint responds", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: "ok" });
});
