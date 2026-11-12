import path from "node:path";

import { expect, test } from "@playwright/test";

import { BOB, signIn } from "./helpers";

const RESUME = path.join(__dirname, "..", "..", "resume.md");
const PHONE_DIGITS = "6047734264";
const JOB = "Initech is hiring a Director of Engineering, Developer Productivity. Lead platform teams and AI-assisted development.";

/** Real OpenRouter call through the UI: the saved phone preference must reach the model. */
test("excluding the phone number removes it from the real generated resume", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, BOB);
  await page.locator('input[type="file"]').setInputFiles(RESUME);
  await expect(page.getByLabel("Baseline resume content")).toContainText("(604) 773-4264");

  await page.getByRole("checkbox", { name: "Include phone number in generated resume" }).uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  await page.getByLabel("Job description").fill(JOB);
  await page.getByRole("button", { name: "Generate custom resume" }).click();
  const editor = page.getByLabel("Custom resume content");
  await expect(editor).toBeVisible({ timeout: 150_000 });

  const resume = await editor.inputValue();
  expect(resume).toContain("vtulai@yahoo.com");
  expect(resume.replace(/\D/g, "")).not.toContain(PHONE_DIGITS);
});
