import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { showBaseline, signIn } from "./helpers";

const RESUME = path.join(__dirname, "..", "..", "resume.md");
const TAILORED = "# Voicu Tulai\n\n## Professional Summary\n\nEngineering leader for Umbrella Corp.";

/** The settings the mocked /api/generate says it used (the real route returns the saved ones). */
const GENERATED_BY = "anthropic/claude-haiku-5.5";
const GENERATED_WITH = {
  model: GENERATED_BY,
  optimization: "full",
  professional_years: 7,
  earlier_years: 2,
  max_pages: 1,
  tone: "crisp",
  notes: "Mention Kubernetes",
};
const GENERATED_DETAILS = [
  GENERATED_BY,
  "Full tailoring",
  "Professional: 7 yrs",
  "Earlier: 2 yrs",
  "Max pages: 1",
  "Tone: crisp",
  "Notes: Mention Kubernetes",
];

/** Answer /api/generate with the given replies in order, recording request bodies. */
async function mockGenerate(page: Page, replies: object[]) {
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/generate", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ json: { ...GENERATED_WITH, ...replies.shift() } });
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
  const newest = history.getByRole("listitem").first();
  await expect(newest).toContainText("Umbrella Corp");
  for (const detail of GENERATED_DETAILS) await expect(newest.getByText(detail, { exact: true })).toBeVisible();
  await page.reload();
  await expect(newest).toContainText("Umbrella Corp");
  for (const detail of GENERATED_DETAILS) await expect(newest.getByText(detail, { exact: true })).toBeVisible();
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
  await page.getByLabel("Optimization level").selectOption("light");
  await page.getByLabel("Professional Experience (years)").fill("9");
  await page.getByLabel("Earlier Experience (years)").fill("3");
  await page.getByLabel("Tone").fill("warm");
  await page.getByLabel("Notes for the AI").fill("");

  await page.getByRole("button", { name: "Generate custom resume" }).click();
  const chat = page.getByRole("log", { name: "Conversation" });
  await expect(chat.getByText("Which focus?")).toBeVisible();
  await page.getByLabel("AI model").selectOption("openai/gpt-oss-120b");
  await page.getByLabel("Optimization level").selectOption("smart");
  await page.getByLabel("Tone").fill("");
  await page.getByLabel("Notes for the AI").fill("Stress mentoring");
  await page.getByLabel("Message").fill("Platform");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(chat.getByText("Done.")).toBeVisible();

  await expect(chat.locator(":scope > *")).toHaveText([
    "Model: openai/gpt-5.4-nano\nOptimization level: Light polish\nTone: warm",
    "You: Please generate my custom resume for this job description.",
    "AI: Which focus?",
    "Model: openai/gpt-oss-120b\nOptimization level: Smart integration\nTone: no preference\nNotes: Stress mentoring",
    "You: Platform",
    "AI: Done.",
  ]);
  const firstNote = await chat.locator(":scope > *").first().evaluate((el) => (el as HTMLElement).innerText);
  expect(firstNote.split("\n")).toEqual([
    "Model: openai/gpt-5.4-nano",
    "Optimization level: Light polish",
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

const REVIEW = { strengths: "", weaknesses: "", rule_violations: [] };
const PRO_REPLY = {
  reply: "anthropic/claude-sonnet-5.5 scored best (8.5/10). Strongest fit.",
  company: "Umbrella Corp",
  resume_md: TAILORED,
  pro: {
    candidates: [
      { model: "anthropic/claude-sonnet-5.5", company: "Umbrella Corp", resume_md: TAILORED, score: 8.5, ...REVIEW },
      { model: "openai/gpt-6-sol", company: "Umbrella Corp", resume_md: "# Voicu Tulai\n\n## Summary\n\nSol version.", score: 6, ...REVIEW, rule_violations: ["Adds Azure"] },
    ],
    rationale: "Strongest fit.",
    judge_model: "openai/gpt-oss-120b",
    failed: [{ model: "openai/gpt-5.4-nano", reason: "timed out after 300 s" }],
  },
};

test("Pro mode: pick a candidate, download it, and see its judge and rank in history", async ({ page }) => {
  await mockGenerate(page, [PRO_REPLY]);
  await prepare(page);
  await page.getByLabel("AI model").selectOption("openai/gpt-oss-120b");
  await page.getByRole("checkbox", { name: "Pro mode" }).check();
  const proModels = page.getByRole("group", { name: "Pro models (2-4)" });
  await expect(proModels.getByRole("checkbox", { name: "openai/gpt-oss-120b (AI model, judges)" })).toBeDisabled();
  await expect(page.getByLabel(/judge model/i)).toHaveCount(0);
  await proModels.getByRole("checkbox", { name: "anthropic/claude-sonnet-5.5" }).check();
  await proModels.getByRole("checkbox", { name: "openai/gpt-6-sol" }).check();
  for (const other of ["anthropic/claude-opus-5.5", "anthropic/claude-haiku-5.5", "openai/gpt-5.4-nano", "google/gemini-4-argon"]) {
    await proModels.getByRole("checkbox", { name: other }).uncheck();
  }
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/preferences") && r.request().method() === "PUT");
  await page.getByLabel("Tone").fill("crisp");
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Pro mode" })).toBeChecked();
  const checked = await proModels.getByRole("checkbox", { checked: true }).evaluateAll((els) =>
    els.map((el) => el.parentElement!.textContent),
  );
  expect(checked).toEqual(["anthropic/claude-sonnet-5.5", "openai/gpt-6-sol"]);

  await page.getByLabel("Job description").fill("Umbrella Corp is hiring a Director of Engineering.");
  await page.getByRole("button", { name: "Generate custom resume" }).click();
  const chat = page.getByRole("log", { name: "Conversation" });
  await expect(chat.getByText("Model: openai/gpt-oss-120b (chat and judge)")).toBeVisible();
  await expect(chat.getByText("Pro models: anthropic/claude-sonnet-5.5, openai/gpt-6-sol")).toBeVisible();
  await expect(chat.getByText(PRO_REPLY.reply)).toBeVisible();
  await expect(
    chat.getByText("openai/gpt-5.4-nano did not return a valid resume (timed out after 300 s), so it was left out."),
  ).toBeVisible();
  await expect(page.getByRole("tab")).toHaveText([
    "anthropic/claude-sonnet-5.5 · 8.5/10 · best",
    "openai/gpt-6-sol · 6/10 · 1 issue",
  ]);
  await expect(page.getByText("Why it won (judged by openai/gpt-oss-120b)")).toBeVisible();

  await page.getByRole("tab", { name: /^openai\/gpt-6-sol/ }).click();
  await expect(page.getByLabel("Custom resume content")).toHaveValue(PRO_REPLY.pro.candidates[1].resume_md);
  await expect(page.getByRole("list", { name: "Rule violations" })).toHaveText("Adds Azure");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  await downloadPromise;

  const newest = page.getByRole("region", { name: "Download history" }).getByRole("listitem").first();
  await expect(newest.getByText("openai/gpt-6-sol", { exact: true })).toBeVisible();
  await expect(newest.getByText("Pro: judged by openai/gpt-oss-120b, rank 2", { exact: true })).toBeVisible();
  await page.reload();
  await expect(newest.getByText("Pro: judged by openai/gpt-oss-120b, rank 2", { exact: true })).toBeVisible();

  const off = page.waitForResponse((r) => r.url().endsWith("/api/preferences") && r.request().method() === "PUT");
  await page.getByRole("checkbox", { name: "Pro mode" }).uncheck();
  expect((await off).status()).toBe(200);
});

test("PDF style is chosen in the Custom resume header, persists, and styles the preview", async ({ page }) => {
  const reply = { reply: "Done.", company: "Umbrella Corp", resume_md: TAILORED };
  await mockGenerate(page, [reply, reply]);
  await prepare(page);
  await page.getByRole("button", { name: "Generate custom resume" }).click();
  const header = page.getByRole("heading", { name: "Custom resume for Umbrella Corp" }).locator("..");
  const style = header.getByLabel("PDF style");
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/preferences") && r.request().postDataJSON()?.style === "modern",
  );
  await style.selectOption("modern");
  expect((await saved).ok()).toBe(true);
  const styleBox = (await style.boundingBox())!;
  const toggleBox = (await header.getByRole("button", { name: "Markdown" }).boundingBox())!;
  expect(styleBox.x + styleBox.width).toBeLessThanOrEqual(toggleBox.x);

  const previewed = page.waitForRequest((r) => r.url().endsWith("/api/preview"));
  await header.getByRole("button", { name: "Preview" }).click();
  expect((await previewed).postDataJSON()).toMatchObject({ style: "modern" });

  await page.reload();
  await page.getByLabel("Job description").fill("Umbrella Corp is hiring a Director of Engineering.");
  await page.getByRole("button", { name: "Generate custom resume" }).click();
  await expect(page.getByLabel("PDF style")).toHaveValue("modern");
  const reset = page.waitForResponse((r) => r.url().endsWith("/api/preferences") && r.request().method() === "PUT");
  await page.getByLabel("PDF style").selectOption("professional");
  expect((await reset).ok()).toBe(true);
});

test("Clear conversation empties the chat and keeps the generated resume", async ({ page }) => {
  const bodies = await mockGenerate(page, [
    { reply: "Here you go.", company: "Umbrella Corp", resume_md: TAILORED },
    { reply: "Fresh start.", company: "Umbrella Corp", resume_md: null },
  ]);
  await prepare(page);
  await page.getByRole("button", { name: "Generate custom resume" }).click();
  const chat = page.getByRole("log", { name: "Conversation" });
  await expect(chat.getByText("Here you go.")).toBeVisible();
  const sidebar = page.getByRole("complementary", { name: "AI chat" });
  await sidebar.getByRole("button", { name: "Clear conversation" }).click();
  await expect(chat).toHaveText("Ask anything about tailoring your resume.");
  await expect(sidebar.getByRole("button", { name: "Clear conversation" })).toHaveCount(0);
  await expect(page.getByLabel("Custom resume content")).toHaveValue(TAILORED);

  await page.getByLabel("Message").fill("Start over");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(chat.getByText("Fresh start.")).toBeVisible();
  expect(bodies[1].history).toEqual([]);
});
