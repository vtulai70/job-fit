import { readFile } from "node:fs/promises";
import path from "node:path";

import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

import { BOB, signIn, signOut } from "./helpers";

const RESUME = path.join(__dirname, "..", "..", "resume.md");

test("first visit shows Clerk sign-in, not the workspace", async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(0);
});

test("signing in shows the workspace with the user menu", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "JobFit" })).toBeVisible();
  await expect(page.getByRole("button", { name: /open user menu/i })).toBeVisible();
});

test("session survives a page reload", async ({ page }) => {
  await signIn(page);
  await page.reload();
  await expect(page.getByRole("main")).toBeVisible();
});

test("signing out returns to sign-in and the API rejects the old browser", async ({ page }) => {
  await signIn(page);
  await signOut(page);
  await page.reload();
  await expect(page.getByLabel("Email address")).toBeVisible();
  expect((await page.request.get("/api/preferences")).status()).toBe(401);
});

test("protected API rejects requests without a session", async ({ request }) => {
  expect((await request.get("/api/preferences")).status()).toBe(401);
  expect((await request.get("/api/history")).status()).toBe(401);
});

test("two Clerk users do not see each other's data", async ({ page }) => {
  await signIn(page);
  await page.locator('input[type="file"]').setInputFiles(RESUME);
  await expect(page.getByLabel("Baseline resume content")).toContainText("Professional Summary");
  const created = await page.request.post("/api/history", {
    data: { company: "Alice Only Inc", job_description: "j", content_md: await readFile(RESUME, "utf-8"), style: "modern", model: "openai/gpt-oss-120b" },
  });
  expect(created.status()).toBe(201);
  await signOut(page);

  await signIn(page, BOB);
  await expect(page.getByText("No resume uploaded yet.")).toBeVisible();
  const history = page.getByRole("region", { name: "Download history" });
  await expect(history.getByText("No downloads yet.")).toBeVisible();
  const { id } = await created.json();
  expect((await page.request.get(`/api/history/${id}/pdf`)).status()).toBe(404);
});
