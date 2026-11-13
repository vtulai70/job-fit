import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { showBaseline, signIn, signOut } from "./helpers";

const RESUME = path.join(__dirname, "..", "..", "resume.md");

test("uploaded baseline survives logout and login", async ({ page }) => {
  await signIn(page);
  await page.locator('input[type="file"]').setInputFiles(RESUME);
  await showBaseline(page);
  await expect(page.getByLabel("Baseline resume content")).toContainText("Professional Summary");

  await signOut(page);
  await signIn(page);
  await showBaseline(page);
  await expect(page.getByLabel("Baseline resume content")).toContainText("Professional Summary");
});

test("replacing the baseline persists the new content", async ({ page }) => {
  await signIn(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "short.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Short resume\n\nOnly this"),
  });
  await showBaseline(page);
  await expect(page.getByLabel("Baseline resume content")).toHaveText("# Short resume\n\nOnly this");
  await page.reload();
  await showBaseline(page);
  await expect(page.getByLabel("Baseline resume content")).toHaveText("# Short resume\n\nOnly this");
});

test("baseline starts collapsed once saved; panels expand and collapse", async ({ page }) => {
  await signIn(page);
  const baseline = page.getByRole("button", { name: "Baseline resume" });
  await expect(baseline).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Baseline resume content")).toHaveCount(0);
  await expect(page.getByText("Upload resume")).toBeVisible();
  await baseline.click();
  await expect(page.getByLabel("Baseline resume content")).toBeVisible();

  const prefs = page.getByRole("button", { name: "Preferences" });
  await expect(prefs).toHaveAttribute("aria-expanded", "true");
  await prefs.click();
  await expect(page.getByLabel("Tone")).toHaveCount(0);
  await prefs.click();
  await expect(page.getByLabel("Tone")).toBeVisible();

  const history = page.getByRole("region", { name: "Download history" });
  const historyToggle = history.getByRole("button", { name: "Download history" });
  await expect(historyToggle).toHaveAttribute("aria-expanded", "true");
  await historyToggle.click();
  await expect(historyToggle).toHaveAttribute("aria-expanded", "false");
  await expect(history.getByRole("list")).toHaveCount(0);
  await expect(history.getByText("No downloads yet.")).toHaveCount(0);
});

test("preferences persist across reload", async ({ page }) => {
  await signIn(page);
  await page.getByLabel("PDF style").selectOption("classic");
  await page.getByLabel("Tone").fill("concise, metrics-driven");
  await page.getByLabel("Notes for the AI").fill("Emphasize AI adoption");
  const phone = page.getByRole("checkbox", { name: "Include phone number in generated resume" });
  await expect(phone).toBeChecked();
  await phone.uncheck();
  const graduation = page.getByRole("checkbox", { name: "Include university graduation year in generated resume" });
  await expect(graduation).not.toBeChecked();
  await graduation.check();
  await expect(page.getByLabel("Professional Experience (years)")).toHaveValue("15");
  await expect(page.getByLabel("Earlier Experience (years)")).toHaveValue("10");
  await page.getByLabel("Professional Experience (years)").fill("12");
  await page.getByLabel("Earlier Experience (years)").fill("6");
  await expect(page.getByLabel("AI model")).toHaveValue("openai/gpt-oss-120b");
  const lastSave = page.waitForResponse(
    (r) => r.url().endsWith("/api/preferences") && r.request().postDataJSON()?.model === "anthropic/claude-sonnet-5.5",
  );
  await page.getByLabel("AI model").selectOption("anthropic/claude-sonnet-5.5");
  expect((await lastSave).ok()).toBe(true);

  await page.reload();
  await expect(page.getByLabel("PDF style")).toHaveValue("classic");
  await expect(page.getByLabel("Tone")).toHaveValue("concise, metrics-driven");
  await expect(page.getByLabel("Notes for the AI")).toHaveValue("Emphasize AI adoption");
  await expect(page.getByRole("checkbox", { name: "Include phone number in generated resume" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Include university graduation year in generated resume" })).toBeChecked();
  await expect(page.getByLabel("Professional Experience (years)")).toHaveValue("12");
  await expect(page.getByLabel("Earlier Experience (years)")).toHaveValue("6");
  await expect(page.getByLabel("AI model")).toHaveValue("anthropic/claude-sonnet-5.5");
});

test("history entry is listed and re-downloads as PDF", async ({ page }) => {
  await signIn(page);
  const response = await page.request.post("/api/history", {
    data: {
      company: "Globex Corporation",
      job_description: "Director of Engineering",
      content_md: await readFile(RESUME, "utf-8"),
      style: "modern",
      model: "openai/gpt-6-sol",
    },
  });
  expect(response.status()).toBe(201);

  await page.reload();
  const history = page.getByRole("region", { name: "Download history" });
  await expect(history.getByText("Globex Corporation")).toBeVisible();
  await expect(history.getByRole("listitem").filter({ hasText: "Globex Corporation" })).toContainText("openai/gpt-6-sol");

  const downloadPromise = page.waitForEvent("download");
  await history.getByRole("link", { name: "Download Globex Corporation resume" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Resume - Voicu Tulai - Globex Corporation.pdf");
  const pdf = await readFile(await download.path());
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
});

test("clear history asks first, then deletes every entry", async ({ page }) => {
  await signIn(page);
  const entry = { job_description: "j", content_md: "# Me", style: "modern", model: "openai/gpt-oss-120b" };
  for (const company of ["Clear Co One", "Clear Co Two"]) {
    expect((await page.request.post("/api/history", { data: { ...entry, company } })).status()).toBe(201);
  }
  await page.reload();
  const history = page.getByRole("region", { name: "Download history" });
  await expect(history.getByText("Clear Co Two")).toBeVisible();

  page.once("dialog", (dialog) => dialog.dismiss());
  await history.getByRole("button", { name: "Clear history" }).click();
  await expect(history.getByText("Clear Co Two")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await history.getByRole("button", { name: "Clear history" }).click();
  await expect(history.getByText("No downloads yet.")).toBeVisible();
  await expect(history.getByRole("button", { name: "Clear history" })).toHaveCount(0);
  expect(await (await page.request.get("/api/history")).json()).toEqual([]);
  await page.reload();
  await expect(history.getByText("No downloads yet.")).toBeVisible();
});

test("history shows at most 10 entries and scrolls for more", async ({ page }) => {
  await signIn(page);
  expect((await page.request.delete("/api/history")).status()).toBe(204);
  const entry = { job_description: "j", content_md: "# Me", style: "modern", model: "openai/gpt-oss-120b" };
  const add = async (n: number) =>
    expect((await page.request.post("/api/history", { data: { ...entry, company: `Scroll Co ${n}` } })).status()).toBe(201);
  for (let n = 1; n <= 10; n++) await add(n);

  await page.reload();
  const list = page.getByRole("region", { name: "Download history" }).getByRole("list");
  await expect(list.getByRole("listitem")).toHaveCount(10);
  const overflow = () => list.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(await overflow()).toBe(0);

  await add(11);
  await add(12);
  await page.reload();
  const rows = list.getByRole("listitem");
  await expect(rows).toHaveCount(12);
  expect(await overflow()).toBeGreaterThan(0);
  expect(await list.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
  const box = (await list.boundingBox())!;
  const bottom = async (i: number) => {
    const row = (await rows.nth(i).boundingBox())!;
    return row.y + row.height;
  };
  expect(await bottom(9)).toBeLessThanOrEqual(box.y + box.height + 1);
  expect((await rows.nth(10).boundingBox())!.y).toBeGreaterThanOrEqual(box.y + box.height - 1);

  await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const last = (await rows.nth(11).boundingBox())!;
  expect(last.y).toBeGreaterThanOrEqual(box.y - 1);
  expect(last.y + last.height).toBeLessThanOrEqual(box.y + box.height + 1);
});
