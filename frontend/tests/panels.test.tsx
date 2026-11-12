import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import HistoryPanel from "@/components/HistoryPanel";
import PreferencesPanel from "@/components/PreferencesPanel";
import type { Preferences } from "@/lib/api";

const PREFS: Preferences = {
  style: "professional",
  tone: "",
  max_pages: 2,
  notes: "",
  include_phone: true,
  professional_years: 15,
  earlier_years: 10,
};

test("history shows empty state", () => {
  render(<HistoryPanel entries={[]} />);
  expect(screen.getByText("No downloads yet.")).toBeInTheDocument();
});

test("history lists entries with re-download links", () => {
  render(
    <HistoryPanel
      entries={[
        { id: 2, company: "Beta", style: "modern", downloaded_at: "2026-11-11T10:00:00Z" },
        { id: 1, company: "Acme", style: "classic", downloaded_at: "2026-11-10T10:00:00Z" },
      ]}
    />,
  );
  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(within(items[0]).getByText("Beta")).toBeInTheDocument();
  expect(within(items[0]).getByText(new Date("2026-11-11T10:00:00Z").toLocaleString())).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Download Beta resume" })).toHaveAttribute("href", "/api/history/2/pdf");
  expect(screen.getByRole("link", { name: "Download Acme resume" })).toHaveAttribute("href", "/api/history/1/pdf");
});

test("preferences form shows initial values", () => {
  render(<PreferencesPanel initial={{ ...PREFS, tone: "bold" }} onSave={vi.fn()} />);
  expect(screen.getByLabelText("PDF style")).toHaveValue("professional");
  expect(screen.getByLabelText("Max pages")).toHaveValue(2);
  expect(screen.getByLabelText("Tone")).toHaveValue("bold");
});

test("preferences form saves edited values and confirms", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<PreferencesPanel initial={PREFS} onSave={onSave} />);
  await userEvent.selectOptions(screen.getByLabelText("PDF style"), "classic");
  await userEvent.clear(screen.getByLabelText("Max pages"));
  await userEvent.type(screen.getByLabelText("Max pages"), "3");
  await userEvent.type(screen.getByLabelText("Tone"), "concise");
  await userEvent.type(screen.getByLabelText("Notes for the AI"), "Lead with AI");
  await userEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  expect(onSave).toHaveBeenCalledWith({
    style: "classic",
    max_pages: 3,
    tone: "concise",
    notes: "Lead with AI",
    include_phone: true,
    professional_years: 15,
    earlier_years: 10,
  });
  expect(await screen.findByText("Saved")).toBeInTheDocument();
});

test("editing after save clears the confirmation", async () => {
  render(<PreferencesPanel initial={PREFS} onSave={vi.fn().mockResolvedValue(undefined)} />);
  await userEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  expect(await screen.findByText("Saved")).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Tone"), "x");
  expect(screen.queryByText("Saved")).not.toBeInTheDocument();
});

test("phone checkbox reflects the saved preference", () => {
  const { unmount } = render(<PreferencesPanel initial={PREFS} onSave={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: "Include phone number in generated resume" })).toBeChecked();
  unmount();
  render(<PreferencesPanel initial={{ ...PREFS, include_phone: false }} onSave={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: "Include phone number in generated resume" })).not.toBeChecked();
});

test("unchecking the phone option saves include_phone false", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<PreferencesPanel initial={PREFS} onSave={onSave} />);
  await userEvent.click(screen.getByRole("checkbox", { name: "Include phone number in generated resume" }));
  await userEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  expect(onSave).toHaveBeenCalledWith({ ...PREFS, include_phone: false });
});

test("toggling the phone option clears the saved confirmation", async () => {
  render(<PreferencesPanel initial={PREFS} onSave={vi.fn().mockResolvedValue(undefined)} />);
  await userEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  expect(await screen.findByText("Saved")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("checkbox", { name: "Include phone number in generated resume" }));
  expect(screen.queryByText("Saved")).not.toBeInTheDocument();
});

test("experience year fields show the saved values", () => {
  render(<PreferencesPanel initial={{ ...PREFS, professional_years: 12, earlier_years: 0 }} onSave={vi.fn()} />);
  expect(screen.getByLabelText("Professional Experience (years)")).toHaveValue(12);
  expect(screen.getByLabelText("Earlier Experience (years)")).toHaveValue(0);
});

test("experience year fields have sensible limits", () => {
  render(<PreferencesPanel initial={PREFS} onSave={vi.fn()} />);
  const professional = screen.getByLabelText("Professional Experience (years)");
  const earlier = screen.getByLabelText("Earlier Experience (years)");
  expect(professional).toHaveAttribute("min", "1");
  expect(professional).toHaveAttribute("max", "50");
  expect(earlier).toHaveAttribute("min", "0");
  expect(earlier).toHaveAttribute("max", "50");
});

test("editing experience years saves numbers", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<PreferencesPanel initial={PREFS} onSave={onSave} />);
  await userEvent.clear(screen.getByLabelText("Professional Experience (years)"));
  await userEvent.type(screen.getByLabelText("Professional Experience (years)"), "20");
  await userEvent.clear(screen.getByLabelText("Earlier Experience (years)"));
  await userEvent.type(screen.getByLabelText("Earlier Experience (years)"), "5");
  await userEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  expect(onSave).toHaveBeenCalledWith({ ...PREFS, professional_years: 20, earlier_years: 5 });
});
