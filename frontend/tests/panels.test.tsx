import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import HistoryPanel, { CLEAR_CONFIRM } from "@/components/HistoryPanel";
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
  optimization: "smart",
};

test("history shows empty state", () => {
  render(<HistoryPanel onClear={vi.fn()} entries={[]} />);
  expect(screen.getByText("No downloads yet.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Clear history" })).not.toBeInTheDocument();
});

const ENTRY = { id: 1, company: "Acme", style: "modern" as const, downloaded_at: "2026-11-10T10:00:00Z", model: null, optimization: null };

test("clear history asks for confirmation, then calls onClear", async () => {
  const confirm = vi.fn().mockReturnValue(true);
  vi.stubGlobal("confirm", confirm);
  const onClear = vi.fn();
  render(<HistoryPanel entries={[ENTRY]} onClear={onClear} />);
  await userEvent.click(screen.getByRole("button", { name: "Clear history" }));
  expect(confirm).toHaveBeenCalledWith(CLEAR_CONFIRM);
  expect(onClear).toHaveBeenCalledOnce();
});

test("cancelling the confirmation keeps the history", async () => {
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
  const onClear = vi.fn();
  render(<HistoryPanel entries={[ENTRY]} onClear={onClear} />);
  await userEvent.click(screen.getByRole("button", { name: "Clear history" }));
  expect(onClear).not.toHaveBeenCalled();
});

test("history lists entries with re-download links", () => {
  render(
    <HistoryPanel
      onClear={vi.fn()}
      entries={[
        { id: 2, company: "Beta", style: "modern", downloaded_at: "2026-11-11T10:00:00Z", model: "openai/gpt-6-sol", optimization: "full" },
        { id: 1, company: "Acme", style: "classic", downloaded_at: "2026-11-10T10:00:00Z", model: null, optimization: null },
      ]}
    />,
  );
  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(within(items[0]).getByText("Beta")).toBeInTheDocument();
  expect(within(items[0]).getByText(new Date("2026-11-11T10:00:00Z").toLocaleString())).toBeInTheDocument();
  expect(within(items[0]).getByText("openai/gpt-6-sol")).toBeInTheDocument();
  expect(within(items[0]).getByText("Full tailoring")).toBeInTheDocument();
  expect(items[1]).not.toHaveTextContent(/openai|anthropic|google/);
  expect(items[1]).not.toHaveTextContent(/polish|integration|tailoring/);
  expect(screen.getByRole("link", { name: "Download Beta resume" })).toHaveAttribute("href", "/api/history/2/pdf");
  expect(screen.getByRole("link", { name: "Download Acme resume" })).toHaveAttribute("href", "/api/history/1/pdf");
});

test("preferences have no save button", () => {
  render(<PreferencesPanel initial={PREFS} onChange={vi.fn()} />);
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Preferences"]);
});

test("preferences start expanded and collapse, keeping edited values", async () => {
  render(<PreferencesPanel initial={PREFS} onChange={vi.fn()} />);
  const toggle = screen.getByRole("button", { name: "Preferences" });
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  await userEvent.type(screen.getByLabelText("Tone"), "bold");
  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByLabelText("Tone")).not.toBeInTheDocument();
  await userEvent.click(toggle);
  expect(screen.getByLabelText("Tone")).toHaveValue("bold");
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
    optimization: "smart",
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
    "Optimization level",
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

function entries(count: number) {
  return Array.from({ length: count }, (_, i) => ({ ...ENTRY, id: i + 1, company: `Co ${i + 1}` }));
}

test("history list is capped at the 10th row only when there are more than 10 entries", () => {
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockReturnValue(333);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(37);
  const { rerender } = render(<HistoryPanel entries={entries(10)} onClear={vi.fn()} />);
  expect(screen.getByRole("list").style.maxHeight).toBe("");
  rerender(<HistoryPanel entries={entries(11)} onClear={vi.fn()} />);
  expect(screen.getByRole("list").style.maxHeight).toBe("370px");
  expect(screen.getAllByRole("listitem")).toHaveLength(11);
  rerender(<HistoryPanel entries={entries(3)} onClear={vi.fn()} />);
  expect(screen.getByRole("list").style.maxHeight).toBe("");
});

test("history starts expanded and collapses, keeping Clear history in the header", async () => {
  render(<HistoryPanel entries={entries(2)} onClear={vi.fn()} />);
  const toggle = screen.getByRole("button", { name: "Download history" });
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Clear history" })).toBeInTheDocument();
  await userEvent.click(toggle);
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
});

test("history cap is applied when the panel is expanded again", async () => {
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockReturnValue(333);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(37);
  render(<HistoryPanel entries={entries(11)} onClear={vi.fn()} />);
  const toggle = screen.getByRole("button", { name: "Download history" });
  await userEvent.click(toggle);
  await userEvent.click(toggle);
  expect(screen.getByRole("list").style.maxHeight).toBe("370px");
});

const LEVELS = ["Light polish", "Smart integration", "Full tailoring"];

test("optimization level lists the three levels and shows the saved one with its description", () => {
  render(<PreferencesPanel initial={{ ...PREFS, optimization: "full" }} onChange={vi.fn()} />);
  const select = screen.getByLabelText("Optimization level");
  expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(LEVELS);
  expect(select).toHaveValue("full");
  expect(select).toHaveAccessibleDescription(
    "Fully rewrites and reprioritizes the content to match exactly what the employer is looking for.",
  );
});

test("choosing an optimization level saves it and updates the description", async () => {
  const onChange = vi.fn();
  render(<PreferencesPanel initial={PREFS} onChange={onChange} />);
  const select = screen.getByLabelText("Optimization level");
  expect(select).toHaveAccessibleDescription(
    "Naturally integrates the skills and requirements into the work history to make a stronger impression.",
  );
  await userEvent.selectOptions(select, "light");
  expect(onChange).toHaveBeenLastCalledWith({ ...PREFS, optimization: "light" });
  expect(select).toHaveAccessibleDescription(
    "Adds the skills and requirements to the resume and keeps the original context intact.",
  );
});
