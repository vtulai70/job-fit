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
  include_graduation_year: false,
  professional_years: 15,
  earlier_years: 10,
  model: "openai/gpt-oss-120b",
};

test("history shows empty state", () => {
  render(<HistoryPanel entries={[]} />);
  expect(screen.getByText("No downloads yet.")).toBeInTheDocument();
});

test("history lists entries with re-download links", () => {
  render(
    <HistoryPanel
      entries={[
        { id: 2, company: "Beta", style: "modern", downloaded_at: "2026-11-11T10:00:00Z", model: "openai/gpt-6-sol" },
        { id: 1, company: "Acme", style: "classic", downloaded_at: "2026-11-10T10:00:00Z", model: null },
      ]}
    />,
  );
  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(within(items[0]).getByText("Beta")).toBeInTheDocument();
  expect(within(items[0]).getByText(new Date("2026-11-11T10:00:00Z").toLocaleString())).toBeInTheDocument();
  expect(within(items[0]).getByText("openai/gpt-6-sol")).toBeInTheDocument();
  expect(items[1]).not.toHaveTextContent(/openai|anthropic|google/);
  expect(screen.getByRole("link", { name: "Download Beta resume" })).toHaveAttribute("href", "/api/history/2/pdf");
  expect(screen.getByRole("link", { name: "Download Acme resume" })).toHaveAttribute("href", "/api/history/1/pdf");
});

test("preferences have no save button", () => {
  render(<PreferencesPanel initial={PREFS} onChange={vi.fn()} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("preferences form shows initial values", () => {
  render(<PreferencesPanel initial={{ ...PREFS, tone: "bold" }} onChange={vi.fn()} />);
  expect(screen.getByLabelText("PDF style")).toHaveValue("professional");
  expect(screen.getByLabelText("Max pages")).toHaveValue(2);
  expect(screen.getByLabelText("Tone")).toHaveValue("bold");
});

test("every edit reports the full preferences", async () => {
  const onChange = vi.fn();
  render(<PreferencesPanel initial={PREFS} onChange={onChange} />);
  await userEvent.selectOptions(screen.getByLabelText("PDF style"), "classic");
  await userEvent.clear(screen.getByLabelText("Max pages"));
  await userEvent.type(screen.getByLabelText("Max pages"), "3");
  await userEvent.type(screen.getByLabelText("Tone"), "concise");
  await userEvent.type(screen.getByLabelText("Notes for the AI"), "Lead with AI");
  expect(onChange).toHaveBeenLastCalledWith({
    style: "classic",
    max_pages: 3,
    tone: "concise",
    notes: "Lead with AI",
    include_phone: true,
    include_graduation_year: false,
    professional_years: 15,
    earlier_years: 10,
    model: "openai/gpt-oss-120b",
  });
});

test("phone checkbox reflects the saved preference", () => {
  const { unmount } = render(<PreferencesPanel initial={PREFS} onChange={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: "Include phone number in generated resume" })).toBeChecked();
  unmount();
  render(<PreferencesPanel initial={{ ...PREFS, include_phone: false }} onChange={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: "Include phone number in generated resume" })).not.toBeChecked();
});

test("unchecking the phone option saves include_phone false", async () => {
  const onChange = vi.fn();
  render(<PreferencesPanel initial={PREFS} onChange={onChange} />);
  await userEvent.click(screen.getByRole("checkbox", { name: "Include phone number in generated resume" }));
  expect(onChange).toHaveBeenLastCalledWith({ ...PREFS, include_phone: false });
});

const GRADUATION = "Include university graduation year in generated resume";

test("graduation year checkbox is off by default and reflects the saved preference", () => {
  const { unmount } = render(<PreferencesPanel initial={PREFS} onChange={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: GRADUATION })).not.toBeChecked();
  unmount();
  render(<PreferencesPanel initial={{ ...PREFS, include_graduation_year: true }} onChange={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: GRADUATION })).toBeChecked();
});

test("checking the graduation year option saves include_graduation_year true", async () => {
  const onChange = vi.fn();
  render(<PreferencesPanel initial={PREFS} onChange={onChange} />);
  await userEvent.click(screen.getByRole("checkbox", { name: GRADUATION }));
  expect(onChange).toHaveBeenLastCalledWith({ ...PREFS, include_graduation_year: true });
});

test("experience year fields show the saved values", () => {
  render(<PreferencesPanel initial={{ ...PREFS, professional_years: 12, earlier_years: 0 }} onChange={vi.fn()} />);
  expect(screen.getByLabelText("Professional Experience (years)")).toHaveValue(12);
  expect(screen.getByLabelText("Earlier Experience (years)")).toHaveValue(0);
});

test("experience year fields have sensible limits", () => {
  render(<PreferencesPanel initial={PREFS} onChange={vi.fn()} />);
  const professional = screen.getByLabelText("Professional Experience (years)");
  const earlier = screen.getByLabelText("Earlier Experience (years)");
  expect(professional).toHaveAttribute("min", "1");
  expect(professional).toHaveAttribute("max", "50");
  expect(earlier).toHaveAttribute("min", "0");
  expect(earlier).toHaveAttribute("max", "50");
});

test("editing experience years saves numbers", async () => {
  const onChange = vi.fn();
  render(<PreferencesPanel initial={PREFS} onChange={onChange} />);
  await userEvent.clear(screen.getByLabelText("Professional Experience (years)"));
  await userEvent.type(screen.getByLabelText("Professional Experience (years)"), "20");
  await userEvent.clear(screen.getByLabelText("Earlier Experience (years)"));
  await userEvent.type(screen.getByLabelText("Earlier Experience (years)"), "5");
  expect(onChange).toHaveBeenLastCalledWith({ ...PREFS, professional_years: 20, earlier_years: 5 });
});

const MODELS = [
  "openai/gpt-oss-120b",
  "anthropic/claude-opus-5.5",
  "anthropic/claude-haiku-5.5",
  "anthropic/claude-sonnet-5.5",
  "openai/gpt-6-sol",
  "openai/gpt-5.4-nano",
  "~google/gemini-pro-latest",
];

test("model select lists every model, default first", () => {
  render(<PreferencesPanel initial={PREFS} onChange={vi.fn()} />);
  const select = screen.getByLabelText("AI model");
  expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(MODELS);
  expect(select).toHaveValue("openai/gpt-oss-120b");
});

test("model select shows the saved model", () => {
  render(<PreferencesPanel initial={{ ...PREFS, model: "openai/gpt-6-sol" }} onChange={vi.fn()} />);
  expect(screen.getByLabelText("AI model")).toHaveValue("openai/gpt-6-sol");
});

test("choosing a model saves it", async () => {
  const onChange = vi.fn();
  render(<PreferencesPanel initial={PREFS} onChange={onChange} />);
  await userEvent.selectOptions(screen.getByLabelText("AI model"), "anthropic/claude-sonnet-5.5");
  expect(onChange).toHaveBeenLastCalledWith({ ...PREFS, model: "anthropic/claude-sonnet-5.5" });
});

test("preferences are grouped: resume generation first, PDF last", () => {
  render(<PreferencesPanel initial={PREFS} onChange={vi.fn()} />);
  const legends = screen.getAllByRole("group").map((group) => group.querySelector("legend")!.textContent);
  expect(legends).toEqual(["Resume generation", "PDF"]);
  const generation = screen.getByRole("group", { name: "Resume generation" });
  for (const label of [
    "AI model",
    "Professional Experience (years)",
    "Earlier Experience (years)",
    "Max pages",
    "Tone",
    "Notes for the AI",
  ]) {
    expect(within(generation).getByLabelText(label)).toBeInTheDocument();
  }
  expect(within(generation).getByRole("checkbox", { name: "Include phone number in generated resume" })).toBeInTheDocument();
  expect(within(generation).getByRole("checkbox", { name: GRADUATION })).toBeInTheDocument();
  const pdf = screen.getByRole("group", { name: "PDF" });
  expect(within(pdf).getByLabelText("PDF style")).toBeInTheDocument();
  expect(within(pdf).queryByLabelText("AI model")).not.toBeInTheDocument();
});
