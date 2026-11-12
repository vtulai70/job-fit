import { expect, type Locator, test } from "@playwright/test";

import { signIn } from "./helpers";

/** Computed text color, and the first non-transparent background behind the element. */
async function colors(item: Locator) {
  return item.evaluate((el) => {
    const fg = getComputedStyle(el).color;
    let node: Element | null = el;
    let bg = "rgba(0, 0, 0, 0)";
    while (node && (bg === "rgba(0, 0, 0, 0)" || bg === "transparent")) {
      bg = getComputedStyle(node).backgroundColor;
      node = node.parentElement;
    }
    return { fg, bg };
  });
}

/** Parse rgb()/rgba() (0-255) or color(srgb ...) (0-1) into [r, g, b] 0-255 and alpha. */
function parse(c: string): [number[], number] {
  const n = c.match(/[\d.]+/g)!.map(Number);
  const scale = c.startsWith("color(srgb") ? 255 : 1;
  return [n.slice(0, 3).map((v) => v * scale), n[3] ?? 1];
}

/** WCAG contrast ratio of text color fg (alpha-blended over bg) against opaque bg. */
function contrast(fg: string, bg: string) {
  const [f, alpha] = parse(fg);
  const [b] = parse(bg);
  const blended = f.map((v, i) => v * alpha + b[i] * (1 - alpha));
  const luminance = (rgb: number[]) => {
    const [r, g, bl] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [luminance(blended), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

test("account menu items are legible on the dark background", async ({ page }, testInfo) => {
  await signIn(page);
  await page.getByRole("button", { name: /open user menu/i }).click();

  const panel = page.getByRole("dialog", { name: "Account panel" });
  for (const name of ["Manage account", "Sign out"]) {
    const item = panel.getByRole("button", { name }).getByText(name, { exact: true });
    await expect(item).toBeVisible();
    const { fg, bg } = await colors(item);
    console.log(`${name}: color ${fg} on ${bg}, contrast ${contrast(fg, bg).toFixed(2)}`);
    expect(contrast(fg, bg), `${name}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  }
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  await page.screenshot({ path: testInfo.outputPath("account-menu.png") });
});
