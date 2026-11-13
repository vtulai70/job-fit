import path from "node:path";

import { expect, test } from "@playwright/test";

import { BOB, signIn } from "./helpers";

const RESUME = path.join(__dirname, "..", "..", "resume.md");
const PHONE_DIGITS = "6047734264";
const JOB = "Initech is hiring a Director of Engineering, Developer Productivity. Lead platform teams and AI-assisted development.";

/**
 * The one e2e test that calls the real AI: preferences saved in the UI must reach the model.
 * Phone excluded; 5 years of Professional Experience (2021+) and no Earlier Experience section.
 */
test("saved preferences shape the real generated resume", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, BOB);
  await page.locator('input[type="file"]').setInputFiles(RESUME);
  await expect(page.getByLabel("Baseline resume content")).toContainText("(604) 773-4264");

  await page.getByRole("checkbox", { name: "Include phone number in generated resume" }).uncheck();
  await page.getByLabel("Professional Experience (years)").fill("5");
  await page.getByLabel("Earlier Experience (years)").fill("0");

  await page.getByLabel("Job description").fill(JOB);
  await page.getByRole("button", { name: "Generate custom resume" }).click();
  await expect(page.getByRole("log", { name: "Conversation" }).getByText("Model: openai/gpt-oss-120b")).toBeVisible();
  const editor = page.getByLabel("Custom resume content");
  await expect(editor).toBeVisible({ timeout: 150_000 });

  const resume = await editor.inputValue();
  expect(resume).toContain("vtulai@yahoo.com");
  expect(resume.replace(/\D/g, "")).not.toContain(PHONE_DIGITS);
  expect(resume).toContain("Director, Software Engineering");
  for (const absent of ["HERE Technologies", "Nokia", "Intrinsyc", "Earlier Experience"]) {
    expect(resume, absent).not.toContain(absent);
  }
});
