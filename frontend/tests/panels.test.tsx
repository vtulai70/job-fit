import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";

import HistoryPanel, { CLEAR_CONFIRM, historyDetails } from "@/components/HistoryPanel";
import PreferencesPanel, { proModelsWithout } from "@/components/PreferencesPanel";
import type { Preferences } from "@/lib/api";

/** The panel with its preferences held in state, as Workspace does. */
const ALL_FEATURES = ["pdf_download", "premium_models", "pro_mode"];

function Stateful({
  initial,
  onChange,
  features = ALL_FEATURES,
}: {
  initial: Preferences;
  onChange: (prefs: Preferences) => void;
  features?: string[];
}) {
  const [prefs, setPrefs] = useState(initial);
  return (
    <PreferencesPanel
      prefs={prefs}
      features={features}
      onChange={(next) => {
        setPrefs(next);
        onChange(next);
      }}
    />
  );
}

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
  pro_mode: false,
  pro_models: ["anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5"],
};

test("history shows empty state", () => {
  render(<HistoryPanel canDownload onClear={vi.fn()} entries={[]} />);
  expect(screen.getByText("No downloads yet.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Clear history" })).not.toBeInTheDocument();
});

const ENTRY = { id: 1, company: "Acme", style: "modern" as const, downloaded_at: "2026-11-10T10:00:00Z", model: null, optimization: null, professional_years: null, earlier_years: null, max_pages: null, tone: null, notes: null, pro_judge_model: null, pro_rank: null };

test("clear history asks for confirmation, then calls onClear", async () => {
  const confirm = vi.fn().mockReturnValue(true);
  vi.stubGlobal("confirm", confirm);
  const onClear = vi.fn();
  render(<HistoryPanel canDownload entries={[ENTRY]} onClear={onClear} />);
  await userEvent.click(screen.getByRole("button", { name: "Clear history" }));
  expect(confirm).toHaveBeenCalledWith(CLEAR_CONFIRM);
  expect(onClear).toHaveBeenCalledOnce();
});

test("cancelling the confirmation keeps the history", async () => {
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
  const onClear = vi.fn();
  render(<HistoryPanel canDownload entries={[ENTRY]} onClear={onClear} />);
  await userEvent.click(screen.getByRole("button", { name: "Clear history" }));
  expect(onClear).not.toHaveBeenCalled();
});

test("history lists entries with re-download links", () => {
  render(
    <HistoryPanel canDownload
      onClear={vi.fn()}
      entries={[
        { id: 2, company: "Beta", style: "modern", downloaded_at: "2026-11-11T10:00:00Z", model: "openai/gpt-6-sol", optimization: "full", professional_years: 12, earlier_years: 0, max_pages: 3, tone: "", notes: "Lead with AI", pro_judge_model: null, pro_rank: null },
        { id: 1, company: "Acme", style: "classic", downloaded_at: "2026-11-10T10:00:00Z", model: null, optimization: null, professional_years: null, earlier_years: null, max_pages: null, tone: null, notes: null, pro_judge_model: null, pro_rank: null },
      ]}
    />,
  );
  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(2);
  expect(within(items[0]).getByText("Beta")).toBeInTheDocument();
  expect(within(items[0]).getByText(new Date("2026-11-11T10:00:00Z").toLocaleString())).toBeInTheDocument();
  expect(within(items[0]).getByText("openai/gpt-6-sol")).toBeInTheDocument();
  expect(within(items[0]).getByText("Full tailoring")).toBeInTheDocument();
  for (const detail of ["Professional: 12 yrs", "Earlier: 0 yrs", "Max pages: 3", "Tone: no preference", "Notes: Lead with AI"]) {
    expect(within(items[0]).getByText(detail)).toBeInTheDocument();
  }
  expect(items[1]).not.toHaveTextContent(/openai|anthropic|google/);
  expect(items[1]).not.toHaveTextContent(/polish|integration|tailoring/);
  expect(items[1]).not.toHaveTextContent(/Professional|Earlier|Max pages|Tone|Notes/);
  expect(screen.getByRole("link", { name: "Download Beta resume" })).toHaveAttribute("href", "/api/history/2/pdf");
  expect(screen.getByRole("link", { name: "Download Acme resume" })).toHaveAttribute("href", "/api/history/1/pdf");
});

test("preferences have no save button", () => {
  render(<Stateful initial={PREFS} onChange={vi.fn()} />);
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Preferences"]);
});

test("preferences start expanded and collapse, keeping edited values", async () => {
  render(<Stateful initial={PREFS} onChange={vi.fn()} />);
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
  render(<Stateful initial={{ ...PREFS, tone: "bold" }} onChange={vi.fn()} />);
  expect(screen.getByLabelText("Max pages")).toHaveValue(2);
  expect(screen.getByLabelText("Tone")).toHaveValue("bold");
});

test("every edit reports the full preferences", async () => {
  const onChange = vi.fn();
  render(<Stateful initial={PREFS} onChange={onChange} />);
  await userEvent.clear(screen.getByLabelText("Max pages"));
  await userEvent.type(screen.getByLabelText("Max pages"), "3");
  await userEvent.type(screen.getByLabelText("Tone"), "concise");
  await userEvent.type(screen.getByLabelText("Notes for the AI"), "Lead with AI");
  expect(onChange).toHaveBeenLastCalledWith({
    ...PREFS,
    max_pages: 3,
    tone: "concise",
    notes: "Lead with AI",
  });
});

test("phone checkbox reflects the saved preference", () => {
  const { unmount } = render(<Stateful initial={PREFS} onChange={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: "Include phone number in generated resume" })).toBeChecked();
  unmount();
  render(<Stateful initial={{ ...PREFS, include_phone: false }} onChange={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: "Include phone number in generated resume" })).not.toBeChecked();
});

test("unchecking the phone option saves include_phone false", async () => {
  const onChange = vi.fn();
  render(<Stateful initial={PREFS} onChange={onChange} />);
  await userEvent.click(screen.getByRole("checkbox", { name: "Include phone number in generated resume" }));
  expect(onChange).toHaveBeenLastCalledWith({ ...PREFS, include_phone: false });
});

const GRADUATION = "Include university graduation year in generated resume";

test("graduation year checkbox is off by default and reflects the saved preference", () => {
  const { unmount } = render(<Stateful initial={PREFS} onChange={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: GRADUATION })).not.toBeChecked();
  unmount();
  render(<Stateful initial={{ ...PREFS, include_graduation_year: true }} onChange={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: GRADUATION })).toBeChecked();
});

test("checking the graduation year option saves include_graduation_year true", async () => {
  const onChange = vi.fn();
  render(<Stateful initial={PREFS} onChange={onChange} />);
  await userEvent.click(screen.getByRole("checkbox", { name: GRADUATION }));
  expect(onChange).toHaveBeenLastCalledWith({ ...PREFS, include_graduation_year: true });
});

test("experience year fields show the saved values", () => {
  render(<Stateful initial={{ ...PREFS, professional_years: 12, earlier_years: 0 }} onChange={vi.fn()} />);
  expect(screen.getByLabelText("Professional Experience (years)")).toHaveValue(12);
  expect(screen.getByLabelText("Earlier Experience (years)")).toHaveValue(0);
});

test("experience year fields have sensible limits", () => {
  render(<Stateful initial={PREFS} onChange={vi.fn()} />);
  const professional = screen.getByLabelText("Professional Experience (years)");
  const earlier = screen.getByLabelText("Earlier Experience (years)");
  expect(professional).toHaveAttribute("min", "1");
  expect(professional).toHaveAttribute("max", "50");
  expect(earlier).toHaveAttribute("min", "0");
  expect(earlier).toHaveAttribute("max", "50");
});

test("editing experience years saves numbers", async () => {
  const onChange = vi.fn();
  render(<Stateful initial={PREFS} onChange={onChange} />);
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
  "google/gemini-3.8-flash",
  "google/gemini-4-argon",
];

test("model select lists every model, default first", () => {
  render(<Stateful initial={PREFS} onChange={vi.fn()} />);
  const select = screen.getByLabelText("AI model");
  expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(MODELS);
  expect(select).toHaveValue("openai/gpt-oss-120b");
});

test("model select shows the saved model", () => {
  render(<Stateful initial={{ ...PREFS, model: "openai/gpt-6-sol" }} onChange={vi.fn()} />);
  expect(screen.getByLabelText("AI model")).toHaveValue("openai/gpt-6-sol");
});

test("choosing a model saves it", async () => {
  const onChange = vi.fn();
  render(<Stateful initial={PREFS} onChange={onChange} />);
  await userEvent.selectOptions(screen.getByLabelText("AI model"), "anthropic/claude-sonnet-5.5");
  expect(onChange).toHaveBeenLastCalledWith({ ...PREFS, model: "anthropic/claude-sonnet-5.5" });
});

test("preferences hold the resume generation settings with no section label and no PDF style", () => {
  render(<Stateful initial={PREFS} onChange={vi.fn()} />);
  expect(screen.queryByText("Resume generation")).not.toBeInTheDocument();
  expect(screen.queryByRole("group")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("PDF style")).not.toBeInTheDocument();
  const generation = document.body;
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
});

function entries(count: number) {
  return Array.from({ length: count }, (_, i) => ({ ...ENTRY, id: i + 1, company: `Co ${i + 1}` }));
}

test("history list is capped at the 10th row only when there are more than 10 entries", () => {
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockReturnValue(333);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(37);
  const { rerender } = render(<HistoryPanel canDownload entries={entries(10)} onClear={vi.fn()} />);
  expect(screen.getByRole("list").style.maxHeight).toBe("");
  rerender(<HistoryPanel canDownload entries={entries(11)} onClear={vi.fn()} />);
  expect(screen.getByRole("list").style.maxHeight).toBe("370px");
  expect(screen.getAllByRole("listitem")).toHaveLength(11);
  rerender(<HistoryPanel canDownload entries={entries(3)} onClear={vi.fn()} />);
  expect(screen.getByRole("list").style.maxHeight).toBe("");
});

test("history starts expanded and collapses, keeping Clear history in the header", async () => {
  render(<HistoryPanel canDownload entries={entries(2)} onClear={vi.fn()} />);
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
  render(<HistoryPanel canDownload entries={entries(11)} onClear={vi.fn()} />);
  const toggle = screen.getByRole("button", { name: "Download history" });
  await userEvent.click(toggle);
  await userEvent.click(toggle);
  expect(screen.getByRole("list").style.maxHeight).toBe("370px");
});

const LEVELS = [
  "Light polish - adds the job's skills, keeps your wording",
  "Smart integration - weaves the job's skills into your work history",
  "Full tailoring - rewrites and reorders the content for the job",
];

test("optimization level lists the three levels with a short summary each, and the saved one with its description", () => {
  render(<Stateful initial={{ ...PREFS, optimization: "full" }} onChange={vi.fn()} />);
  const select = screen.getByLabelText("Optimization level");
  expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(LEVELS);
  expect(select).toHaveValue("full");
  expect(select).toHaveAccessibleDescription(
    "Fully rewrites and reprioritizes the content to match exactly what the employer is looking for.",
  );
});

test("choosing an optimization level saves it and updates the description", async () => {
  const onChange = vi.fn();
  render(<Stateful initial={PREFS} onChange={onChange} />);
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

const RECORDED = {
  ...ENTRY,
  model: "openai/gpt-oss-120b" as const,
  optimization: "smart" as const,
  professional_years: 15,
  earlier_years: 10,
  max_pages: 2,
  tone: "concise",
  notes: "",
};

test("history details list every recorded setting in order, notes only when set", () => {
  expect(historyDetails(RECORDED)).toEqual([
    "openai/gpt-oss-120b",
    "Smart integration",
    "Professional: 15 yrs",
    "Earlier: 10 yrs",
    "Max pages: 2",
    "Tone: concise",
  ]);
  expect(historyDetails({ ...RECORDED, tone: " ", notes: " Stress mentoring " }).slice(-2)).toEqual([
    "Tone: no preference",
    "Notes: Stress mentoring",
  ]);
});

test("history details are empty for downloads saved before settings were recorded", () => {
  expect(historyDetails(ENTRY)).toEqual([]);
});

function proCheckbox(model: string) {
  return within(screen.getByRole("group", { name: "Pro models (2-4)" })).getByRole("checkbox", { name: new RegExp(`^${model.replace(/[.~/]/g, "\\$&")}`) });
}

function modelOptions() {
  return within(screen.getByLabelText("AI model")).getAllByRole("option").map((o) => o.textContent);
}

test("Pro mode is off by default and turning it on shows the Pro models, with no judge setting", async () => {
  const onChange = vi.fn();
  render(<Stateful initial={PREFS} onChange={onChange} />);
  const pro = screen.getByRole("checkbox", { name: "Pro mode" });
  expect(pro).not.toBeChecked();
  expect(screen.queryByRole("group", { name: "Pro models (2-4)" })).not.toBeInTheDocument();
  await userEvent.click(pro);
  expect(onChange).toHaveBeenLastCalledWith({ ...PREFS, pro_mode: true });
  expect(proCheckbox("anthropic/claude-haiku-5.5")).toBeChecked();
  expect(proCheckbox("anthropic/claude-sonnet-5.5")).toBeChecked();
  expect(screen.queryByLabelText(/judge model/i)).not.toBeInTheDocument();
});

test("in Pro mode the AI model judges: it is never a Pro model", () => {
  render(<Stateful initial={{ ...PREFS, pro_mode: true }} onChange={vi.fn()} />);
  expect(proCheckbox("openai/gpt-oss-120b")).toBeDisabled();
  expect(proCheckbox("openai/gpt-oss-120b")).not.toBeChecked();
  expect(proCheckbox("openai/gpt-oss-120b")).toHaveAccessibleName("openai/gpt-oss-120b (AI model, judges)");
  expect(modelOptions()).not.toContain("anthropic/claude-haiku-5.5");
  expect(modelOptions()).not.toContain("anthropic/claude-sonnet-5.5");
  expect(modelOptions()).toHaveLength(MODELS.length - 2);
});

test("with Pro mode off every model can be the AI model", () => {
  render(<Stateful initial={PREFS} onChange={vi.fn()} />);
  expect(modelOptions()).toHaveLength(MODELS.length);
});

test("turning Pro mode on drops the AI model from the Pro models and keeps at least 2", async () => {
  const onChange = vi.fn();
  const prefs = { ...PREFS, model: "anthropic/claude-haiku-5.5" as const };
  render(<Stateful initial={prefs} onChange={onChange} />);
  await userEvent.click(screen.getByRole("checkbox", { name: "Pro mode" }));
  expect(onChange).toHaveBeenLastCalledWith({
    ...prefs,
    pro_mode: true,
    pro_models: ["openai/gpt-oss-120b", "anthropic/claude-sonnet-5.5"],
  });
});

test("proModelsWithout removes the AI model and tops up in model list order", () => {
  expect(proModelsWithout("openai/gpt-6-sol", ["anthropic/claude-haiku-5.5", "openai/gpt-6-sol", "openai/gpt-5.4-nano"])).toEqual([
    "anthropic/claude-haiku-5.5",
    "openai/gpt-5.4-nano",
  ]);
  expect(proModelsWithout("openai/gpt-oss-120b", ["openai/gpt-oss-120b", "openai/gpt-6-sol"])).toEqual([
    "anthropic/claude-opus-5.5",
    "openai/gpt-6-sol",
  ]);
  expect(proModelsWithout("openai/gpt-oss-120b", ["anthropic/claude-haiku-5.5", "openai/gpt-6-sol"])).toEqual([
    "anthropic/claude-haiku-5.5",
    "openai/gpt-6-sol",
  ]);
});

test("Pro models keep at least 2: the last two cannot be unchecked", async () => {
  const onChange = vi.fn();
  render(<Stateful initial={{ ...PREFS, pro_mode: true }} onChange={onChange} />);
  expect(proCheckbox("anthropic/claude-haiku-5.5")).toBeDisabled();
  await userEvent.click(proCheckbox("openai/gpt-6-sol"));
  expect(onChange).toHaveBeenLastCalledWith({
    ...PREFS,
    pro_mode: true,
    pro_models: ["anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5", "openai/gpt-6-sol"],
  });
  expect(proCheckbox("anthropic/claude-haiku-5.5")).toBeEnabled();
  await userEvent.click(proCheckbox("anthropic/claude-haiku-5.5"));
  expect(onChange).toHaveBeenLastCalledWith({
    ...PREFS,
    pro_mode: true,
    pro_models: ["anthropic/claude-sonnet-5.5", "openai/gpt-6-sol"],
  });
});

test("Pro models allow at most 4", () => {
  const four = ["anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5", "openai/gpt-6-sol", "openai/gpt-5.4-nano"] as const;
  render(<Stateful initial={{ ...PREFS, pro_mode: true, pro_models: [...four] }} onChange={vi.fn()} />);
  for (const model of four) expect(proCheckbox(model)).toBeEnabled();
  expect(proCheckbox("anthropic/claude-opus-5.5")).toBeDisabled();
  expect(proCheckbox("google/gemini-4-argon")).toBeDisabled();
});

test("history details end with the judge and rank of a Pro download", () => {
  expect(historyDetails({ ...RECORDED, pro_judge_model: "anthropic/claude-opus-5.5", pro_rank: 2 }).at(-1)).toBe(
    "Pro: judged by anthropic/claude-opus-5.5, rank 2",
  );
  expect(historyDetails(RECORDED).join(" ")).not.toContain("Pro:");
});

test("preferences are ordered: model, Pro, optimization, tone, notes, experience, checkboxes, max pages", () => {
  render(<Stateful initial={PREFS} onChange={vi.fn()} />);
  const controls = [...document.querySelectorAll("input, select, textarea")].map(
    (el) => el.closest("label")!.textContent!.trim().split("\n")[0],
  );
  expect(controls.map((text) => text.replace(/(AI model|Optimization level)[\s\S]*/, "$1"))).toEqual([
    "AI model",
    "Pro mode",
    "Optimization level",
    "Tone",
    "Notes for the AI",
    "Professional Experience (years)",
    "Earlier Experience (years)",
    "Include phone number in generated resume",
    GRADUATION,
    "Max pages",
  ]);
});

test("without PDF download on the plan, history is listed but re-download is disabled", () => {
  render(<HistoryPanel canDownload={false} entries={[ENTRY]} onClear={vi.fn()} />);
  expect(screen.getByText("Acme")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Download Acme resume" })).not.toBeInTheDocument();
  expect(screen.getByText("Download")).toHaveAttribute("title", "PDF download is available on the Basic and Pro plans.");
});

test("without premium models, those models are disabled and marked, except the one already chosen", () => {
  render(<Stateful initial={{ ...PREFS, model: "openai/gpt-6-sol" }} onChange={vi.fn()} features={["pdf_download"]} />);
  const options = within(screen.getByLabelText("AI model")).getAllByRole("option") as HTMLOptionElement[];
  const locked = options.filter((o) => o.disabled).map((o) => o.value);
  expect(locked).toEqual(["anthropic/claude-opus-5.5", "anthropic/claude-sonnet-5.5", "google/gemini-4-argon"]);
  expect(options.find((o) => o.value === "anthropic/claude-opus-5.5")!.textContent).toBe("anthropic/claude-opus-5.5 (Pro plan)");
  expect(options.find((o) => o.value === "openai/gpt-6-sol")!.disabled).toBe(false);
});

test("without Pro mode on the plan, it cannot be turned on but can be turned off", async () => {
  const onChange = vi.fn();
  const { unmount } = render(<Stateful initial={PREFS} onChange={onChange} features={[]} />);
  expect(screen.getByRole("checkbox", { name: "Pro mode" })).toBeDisabled();
  expect(screen.getByText("Pro plan")).toBeInTheDocument();
  unmount();
  render(<Stateful initial={{ ...PREFS, pro_mode: true }} onChange={onChange} features={[]} />);
  const pro = screen.getByRole("checkbox", { name: "Pro mode" });
  expect(pro).toBeEnabled();
  await userEvent.click(pro);
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ pro_mode: false }));
});

test("without premium models, premium Pro models cannot be added but can be removed", () => {
  const prefs = { ...PREFS, pro_mode: true, pro_models: ["anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5", "openai/gpt-5.4-nano"] as Preferences["pro_models"] };
  render(<Stateful initial={prefs} onChange={vi.fn()} features={["pro_mode"]} />);
  expect(proCheckbox("openai/gpt-6-sol")).toBeDisabled();
  expect(proCheckbox("openai/gpt-6-sol")).toHaveAccessibleName("openai/gpt-6-sol (Pro plan)");
  expect(proCheckbox("anthropic/claude-sonnet-5.5")).toBeEnabled();
  expect(proCheckbox("google/gemini-3.8-flash")).toBeEnabled();
});
