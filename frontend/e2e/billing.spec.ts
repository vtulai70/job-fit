import { execFileSync } from "node:child_process";
import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { BOB, signIn } from "./helpers";

const RESUME = path.join(__dirname, "..", "..", "resume.md");
const TAILORED = "# Voicu Tulai\n\n## Summary\n\nTailored.";

/** Run Python against the e2e container's database (the container is throwaway). */
function inDatabase(code: string): string {
  const script = `import sqlite3; db = sqlite3.connect('data/jobfit.db')\n${code}\ndb.commit()`;
  return execFileSync("docker", ["exec", "jobfit-e2e", "python3", "-c", script], { encoding: "utf-8" });
}

async function clerkUserId(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { Clerk: { user: { id: string } } }).Clerk.user.id);
}

/** Bob is on the Free plan (checked in global.setup.ts). */
test.describe("Free plan", () => {
  test("shows usage, locks Pro mode and premium models, and offers the pricing table", async ({ page }) => {
    await signIn(page, BOB);
    await expect(page.getByText(/^\d+ of 5 resumes this month · Free plan$/)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Pro mode" })).toBeDisabled();
    await expect(page.getByText("Pro plan", { exact: true })).toBeVisible();
    await expect(page.getByLabel("AI model").locator("option[disabled]")).toHaveText([
      "anthropic/claude-opus-5.5 (Pro plan)",
      "anthropic/claude-sonnet-5.5 (Pro plan)",
      "openai/gpt-6-sol (Pro plan)",
      "google/gemini-4-argon (Pro plan)",
    ]);
    await page.getByRole("button", { name: "Plans" }).click();
    const dialog = page.getByRole("dialog", { name: "Plans" });
    await expect(dialog.getByText("Basic", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Subscribe" })).toBeVisible();
    const reloaded = page.waitForResponse((r) => r.url().endsWith("/api/plan"));
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
    expect((await reloaded).ok()).toBe(true);
  });

  test("has no PDF download, in the app or through the API", async ({ page }) => {
    await page.route("**/api/generate", (route) =>
      route.fulfill({
        json: {
          reply: "Done.", company: "Umbrella Corp", resume_md: TAILORED, pro: null, experience_plan: [],
          model: "openai/gpt-oss-120b", optimization: "smart", professional_years: 15, earlier_years: 10,
          max_pages: 2, tone: "", notes: "",
        },
      }),
    );
    await signIn(page, BOB);
    await page.locator('input[type="file"]').setInputFiles(RESUME);
    await page.getByLabel("Job description").fill("Umbrella Corp is hiring.");
    await page.getByRole("button", { name: "Generate custom resume" }).click();
    await expect(page.getByLabel("Custom resume content")).toHaveValue(TAILORED);
    await expect(page.getByRole("button", { name: "Download PDF" })).toBeDisabled();
    await expect(page.getByText("PDF download is available on the Basic and Pro plans.")).toBeVisible();
    const saved = await page.request.post("/api/history", {
      data: {
        company: "Umbrella Corp", job_description: "j", content_md: TAILORED, style: "modern", model: "openai/gpt-oss-120b",
        optimization: "smart", professional_years: 15, earlier_years: 10, max_pages: 2, tone: "", notes: "",
      },
    });
    expect(saved.status()).toBe(403);
  });

  test("the 6th resume in a month is blocked before any AI call", async ({ page }) => {
    await signIn(page, BOB);
    const clerkId = await clerkUserId(page);
    const seed = `uid = db.execute("SELECT id FROM users WHERE username = ?", ("${clerkId}",)).fetchone()[0]`;
    inDatabase(
      `${seed}\nimport datetime\nnow = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")\n` +
        `db.executemany("INSERT INTO generations (user_id, generated_at, model, pro) VALUES (?, ?, 'e2e-seed', 0)", [(uid, now)] * 5)`,
    );
    try {
      await page.reload();
      await expect(page.getByText("5 of 5 resumes this month · Free plan")).toBeVisible();
      await page.locator('input[type="file"]').setInputFiles(RESUME);
      await page.getByLabel("Job description").fill("Umbrella Corp is hiring.");
      const generated = page.waitForResponse((r) => r.url().endsWith("/api/generate"));
      await page.getByRole("button", { name: "Generate custom resume" }).click();
      expect((await generated).status()).toBe(429);
      await expect(page.getByRole("log", { name: "Conversation" })).toContainText(
        "You have used all 5 resumes of the Free plan this month.",
      );
    } finally {
      inDatabase(`${seed}\ndb.execute("DELETE FROM generations WHERE user_id = ? AND model = 'e2e-seed'", (uid,))`);
    }
  });
});
