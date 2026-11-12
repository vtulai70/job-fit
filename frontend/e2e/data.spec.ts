import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { signIn, signOut } from "./helpers";

const RESUME = path.join(__dirname, "..", "..", "resume.md");

test("uploaded baseline survives logout and login", async ({ page }) => {
  await signIn(page);
  await page.locator('input[type="file"]').setInputFiles(RESUME);
  await expect(page.getByLabel("Baseline resume content")).toContainText("Professional Summary");

  await signOut(page);
  await signIn(page);
  await expect(page.getByLabel("Baseline resume content")).toContainText("Professional Summary");
});

test("replacing the baseline persists the new content", async ({ page }) => {
  await signIn(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "short.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Short resume\n\nOnly this"),
  });
  await expect(page.getByLabel("Baseline resume content")).toHaveText("# Short resume\n\nOnly this");
  await page.reload();
  await expect(page.getByLabel("Baseline resume content")).toHaveText("# Short resume\n\nOnly this");
});

test("preferences persist across reload", async ({ page }) => {
  await signIn(page);
  await page.getByLabel("PDF style").selectOption("classic");
  await page.getByLabel("Tone").fill("concise, metrics-driven");
  await page.getByLabel("Notes for the AI").fill("Emphasize AI adoption");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("PDF style")).toHaveValue("classic");
  await expect(page.getByLabel("Tone")).toHaveValue("concise, metrics-driven");
  await expect(page.getByLabel("Notes for the AI")).toHaveValue("Emphasize AI adoption");
});

test("history entry is listed and re-downloads as PDF", async ({ page }) => {
  await signIn(page);
  const response = await page.request.post("/api/history", {
    data: {
      company: "Globex Corporation",
      job_description: "Director of Engineering",
      content_md: await readFile(RESUME, "utf-8"),
      style: "modern",
    },
  });
  expect(response.status()).toBe(201);

  await page.reload();
  const history = page.getByRole("region", { name: "Download history" });
  await expect(history.getByText("Globex Corporation")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await history.getByRole("link", { name: "Download Globex Corporation resume" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("resume-Globex-Corporation.pdf");
  const pdf = await readFile(await download.path());
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
});
