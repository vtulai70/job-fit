import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { showBaseline, signIn } from "./helpers";

const RESUME = path.join(__dirname, "..", "..", "resume.md");
const TAILORED = "# Voicu Tulai\n\n## Professional Summary\n\nEngineering leader for Umbrella Corp.";

/** The model the mocked /api/generate says it used (the real route returns the saved model). */
const GENERATED_BY = "anthropic/claude-haiku-5.5";

/** Answer /api/generate with the given replies in order, recording request bodies. */
async function mockGenerate(page: Page, replies: object[]) {
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/generate", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ json: { model: GENERATED_BY, ...replies.shift() } });
  });
  return bodies;
}

async function prepare(page: Page) {
  await signIn(page);
  await page.locator('input[type="file"]').setInputFiles(RESUME);
  await showBaseline(page);
  await expect(page.getByLabel("Baseline resume content")).toContainText("Professional Summary");
  await page.getByLabel("Job description").fill("Umbrella Corp is hiring a Director of Engineering.");
}

test("generate, download PDF, and see it in history", async ({ page }) => {
  const bodies = await mockGenerate(page, [
    { reply: "Tailored for Umbrella's data-driven culture.", company: "Umbrella Corp", resume_md: TAILORED },
  ]);
  await prepare(page);

  await page.getByRole("button", { name: "Generate custom resume" }).click();
  const chat = page.getByRole("log", { name: "Conversation" });
  await expect(chat.getByText("Tailored for Umbrella's data-driven culture.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Custom resume for Umbrella Corp" })).toBeVisible();
  await expect(page.getByLabel("Custom resume content")).toHaveValue(TAILORED);
  expect(bodies[0]).toMatchObject({
    job_description: "Umbrella Corp is hiring a Director of Engineering.",
    history: [],
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Resume - Voicu Tulai - Umbrella Corp.pdf");
  expect((await readFile(await download.path())).subarray(0, 4).toString()).toBe("%PDF");

  const history = page.getByRole("region", { name: "Download history" });
  await expect(history.getByText("Umbrella Corp")).toBeVisible();
  await expect(history.getByText(GENERATED_BY)).toBeVisible();
  await page.reload();
  await expect(history.getByText("Umbrella Corp")).toBeVisible();
  await expect(history.getByText(GENERATED_BY)).toBeVisible();
});

test("clarifying question is answered in chat before the resume", async ({ page }) => {
  const bodies = await mockGenerate(page, [
    { reply: "Should I emphasize platform or product leadership?", company: "Umbrella Corp", resume_md: null },
    { reply: "Done, focused on platform.", company: "Umbrella Corp", resume_md: TAILORED },
  ]);
  await prepare(page);

  await page.getByRole("button", { name: "Generate custom resume" }).click();
  const chat = page.getByRole("log", { name: "Conversation" });
  await expect(chat.getByText("Should I emphasize platform or product leadership?")).toBeVisible();
  await expect(page.getByLabel("Custom resume content")).toHaveCount(0);

  await page.getByLabel("Message").fill("Platform leadership");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(chat.getByText("Done, focused on platform.")).toBeVisible();
  await expect(page.getByLabel("Custom resume content")).toHaveValue(TAILORED);
  expect(bodies[1]).toMatchObject({ message: "Platform leadership" });
  expect((bodies[1].history as unknown[]).length).toBe(2);
});

test("chat shows the model and settings before each prompt it sends", async ({ page }) => {
  await mockGenerate(page, [
    { reply: "Which focus?", company: "Umbrella Corp", resume_md: null },
    { reply: "Done.", company: "Umbrella Corp", resume_md: TAILORED },
  ]);
  await prepare(page);
  await page.getByLabel("AI model").selectOption("openai/gpt-5.4-nano");
  await page.getByLabel("Professional Experience (years)").fill("9");
  await page.getByLabel("Earlier Experience (years)").fill("3");
  await page.getByLabel("Tone").fill("warm");
  await page.getByLabel("Notes for the AI").fill("");

  await page.getByRole("button", { name: "Generate custom resume" }).click();
  const chat = page.getByRole("log", { name: "Conversation" });
  await expect(chat.getByText("Which focus?")).toBeVisible();
  await page.getByLabel("AI model").selectOption("openai/gpt-oss-120b");
  await page.getByLabel("Tone").fill("");
  await page.getByLabel("Notes for the AI").fill("Stress mentoring");
  await page.getByLabel("Message").fill("Platform");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(chat.getByText("Done.")).toBeVisible();

  await expect(chat.locator(":scope > *")).toHaveText([
    "Model: openai/gpt-5.4-nano\nProfessional Experience: 9 years\nEarlier Experience: 3 years\nTone: warm",
    "You: Please generate my custom resume for this job description.",
    "AI: Which focus?",
    "Model: openai/gpt-oss-120b\nProfessional Experience: 9 years\nEarlier Experience: 3 years\nTone: no preference\nNotes: Stress mentoring",
    "You: Platform",
    "AI: Done.",
  ]);
  const firstNote = await chat.locator(":scope > *").first().evaluate((el) => (el as HTMLElement).innerText);
  expect(firstNote.split("\n")).toEqual([
    "Model: openai/gpt-5.4-nano",
    "Professional Experience: 9 years",
    "Earlier Experience: 3 years",
    "Tone: warm",
  ]);
});

test("generate button is disabled until a job description is pasted", async ({ page }) => {
  await signIn(page);
  await page.locator('input[type="file"]').setInputFiles(RESUME);
  const button = page.getByRole("button", { name: "Generate custom resume" });
  await expect(button).toBeDisabled();
  await page.getByLabel("Job description").fill("Some job");
  await expect(button).toBeEnabled();
});

/** Read the newest stored custom resume straight from the e2e container's database. */
function latestStoredResume(): string {
  const script =
    "import sqlite3; print(sqlite3.connect('data/jobfit.db')" +
    ".execute('SELECT content_md FROM custom_resumes ORDER BY id DESC LIMIT 1').fetchone()[0], end='')";
  return execFileSync("docker", ["exec", "jobfit-e2e", "python3", "-c", script], { encoding: "utf-8" });
}

test("edited resume is what gets downloaded and stored", async ({ page }) => {
  await mockGenerate(page, [
    { reply: "Here you go.", company: "Umbrella Corp", resume_md: TAILORED },
  ]);
  await prepare(page);
  await page.getByRole("button", { name: "Generate custom resume" }).click();
  const editor = page.getByLabel("Custom resume content");
  await expect(editor).toHaveValue(TAILORED);

  const edited = "# Voicu Tulai\n\n## Summary\n\nHand-edited for Umbrella: led 40-person platform org.";
  await editor.fill(edited);

  const posted = page.waitForRequest((r) => r.url().endsWith("/api/history") && r.method() === "POST");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  expect((await posted).postDataJSON()).toMatchObject({ company: "Umbrella Corp", content_md: edited });
  const download = await downloadPromise;
  expect((await readFile(await download.path())).subarray(0, 4).toString()).toBe("%PDF");

  expect(latestStoredResume()).toBe(edited);
  await expect(page.getByRole("region", { name: "Download history" }).getByText("Umbrella Corp").first()).toBeVisible();
});

test("clearing the resume disables download", async ({ page }) => {
  await mockGenerate(page, [{ reply: "Done.", company: "Umbrella Corp", resume_md: TAILORED }]);
  await prepare(page);
  await page.getByRole("button", { name: "Generate custom resume" }).click();
  await page.getByLabel("Custom resume content").fill("");
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeDisabled();
});

test("preview shows the resume as the PDF renders it and toggles back to Markdown", async ({ page }) => {
  await mockGenerate(page, [{ reply: "Here you go.", company: "Umbrella Corp", resume_md: TAILORED }]);
  await prepare(page);
  await page.getByRole("button", { name: "Generate custom resume" }).click();
  const editor = page.getByLabel("Custom resume content");
  await expect(editor).toHaveValue(TAILORED);
  await editor.fill(`${TAILORED}\n\n## Hand-edited section`);

  await page.getByRole("button", { name: "Preview" }).click();
  await expect(editor).toHaveCount(0);
  const preview = page.frameLocator('iframe[title="Custom resume preview"]');
  await expect(preview.getByRole("heading", { level: 1, name: "Voicu Tulai" })).toBeVisible();
  await expect(preview.getByRole("heading", { level: 2, name: "Hand-edited section" })).toBeVisible();

  await page.getByRole("button", { name: "Markdown" }).click();
  await expect(editor).toHaveValue(`${TAILORED}\n\n## Hand-edited section`);
});
