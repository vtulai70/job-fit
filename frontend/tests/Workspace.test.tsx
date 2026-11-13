import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import Workspace, { CLEAR_FAILED, GENERATE_MESSAGE, settingsNote } from "@/components/Workspace";
import type { Preferences } from "@/lib/api";

import { mockFetch } from "./fetchMock";

const PREFS: Preferences = {
  style: "modern",
  tone: "concise",
  max_pages: 2,
  notes: "",
  include_phone: true,
  include_graduation_year: false,
  professional_years: 15,
  earlier_years: 10,
  model: "openai/gpt-oss-120b",
  optimization: "smart",
};
const HISTORY = [
  { id: 1, company: "Acme", style: "modern", downloaded_at: "2026-11-11T10:00:00Z", model: "openai/gpt-oss-120b", optimization: "full" },
];

function mockData(baseline: string | null = "# Saved resume") {
  return mockFetch({
    "GET /api/resume/baseline": { body: { content_md: baseline, updated_at: null } },
    "GET /api/history": { body: HISTORY },
    "GET /api/preferences": { body: PREFS },
    "PUT /api/resume/baseline": { body: { content_md: "# New resume", updated_at: "t" } },
    "PUT /api/preferences": { body: { ...PREFS, style: "classic" } },
  });
}

test("loads baseline, history and preferences on mount", async () => {
  mockData();
  render(<Workspace />);
  const baseline = await screen.findByRole("button", { name: "Baseline resume" });
  expect(baseline).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByLabelText("Baseline resume content")).not.toBeInTheDocument();
  await userEvent.click(baseline);
  expect(screen.getByLabelText("Baseline resume content")).toHaveTextContent("# Saved resume");
  expect(await screen.findByText("Acme")).toBeInTheDocument();
  expect(await screen.findByLabelText("PDF style")).toHaveValue("modern");
  expect(screen.getByLabelText("Tone")).toHaveValue("concise");
});

test("shows empty baseline when none saved", async () => {
  mockData(null);
  render(<Workspace />);
  await screen.findByLabelText("PDF style");
  expect(screen.getByRole("button", { name: "Baseline resume" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("No resume uploaded yet.")).toBeInTheDocument();
});

test("uploading a resume saves it and shows the saved content", async () => {
  const fetchMock = mockData();
  const { container } = render(<Workspace />);
  const baseline = await screen.findByRole("button", { name: "Baseline resume" });
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, new File(["# New resume"], "resume.md"));
  await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
  expect(baseline).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(baseline);
  await screen.findByText("# New resume");
  const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
  expect(put[0]).toBe("/api/resume/baseline");
  expect(JSON.parse(put[1]!.body as string)).toEqual({ content_md: "# New resume" });
});

test("changing a preference saves it without a button", async () => {
  const fetchMock = mockData();
  render(<Workspace />);
  await userEvent.selectOptions(await screen.findByLabelText("PDF style"), "classic");
  await waitFor(() => expect(lastPreferencesPut(fetchMock)).toEqual({ ...PREFS, style: "classic" }));
});

test("job description is kept as typed", async () => {
  mockData();
  render(<Workspace />);
  const box = screen.getByLabelText("Job description");
  await userEvent.type(box, "Director of Engineering");
  expect(box).toHaveValue("Director of Engineering");
});

const RESUME_RESULT = {
  reply: "Here is your resume.",
  company: "Initech",
  resume_md: "# Tailored for Initech",
  model: "openai/gpt-oss-120b",
  optimization: "smart",
};
const QUESTION_RESULT = {
  reply: "Which team size should I emphasize?",
  company: "Initech",
  resume_md: null,
  model: "openai/gpt-oss-120b",
  optimization: "smart",
};

function mockChat(...results: { status?: number; body?: unknown }[]) {
  const fetchMock = mockData();
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url !== "/api/generate") return base(url, init);
    const { status = 200, body } = results.shift()!;
    return Response.json(body ?? {}, { status });
  });
  return fetchMock;
}

function generateBodies(fetchMock: ReturnType<typeof mockData>) {
  return fetchMock.mock.calls
    .filter(([url]) => url === "/api/generate")
    .map(([, init]) => JSON.parse(init!.body as string));
}

function lastPreferencesPut(fetchMock: ReturnType<typeof mockData>) {
  const puts = fetchMock.mock.calls.filter(([url, init]) => url === "/api/preferences" && init?.method === "PUT");
  return JSON.parse(puts.at(-1)![1]!.body as string);
}

async function ready() {
  render(<Workspace />);
  await screen.findByRole("button", { name: "Baseline resume" });
  await userEvent.type(screen.getByLabelText("Job description"), "Director at Initech");
}

test("generate is disabled without a job description", async () => {
  mockData();
  render(<Workspace />);
  await screen.findByRole("button", { name: "Baseline resume" });
  expect(screen.getByRole("button", { name: "Generate custom resume" })).toBeDisabled();
});

test("generate is disabled without a baseline", async () => {
  mockData(null);
  render(<Workspace />);
  await screen.findByLabelText("PDF style");
  await userEvent.type(screen.getByLabelText("Job description"), "Director at Initech");
  expect(screen.getByRole("button", { name: "Generate custom resume" })).toBeDisabled();
});

test("generate shows the reply and the custom resume", async () => {
  const fetchMock = mockChat({ body: RESUME_RESULT });
  await ready();
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));

  expect(await screen.findByText("Here is your resume.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Custom resume for Initech" })).toBeInTheDocument();
  expect(screen.getByLabelText("Custom resume content")).toHaveValue("# Tailored for Initech");
  expect(generateBodies(fetchMock)).toEqual([
    { job_description: "Director at Initech", message: GENERATE_MESSAGE, history: [] },
  ]);
});

test("clarifying question, then answer sends conversation history", async () => {
  const fetchMock = mockChat({ body: QUESTION_RESULT }, { body: RESUME_RESULT });
  await ready();
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));
  expect(await screen.findByText("Which team size should I emphasize?")).toBeInTheDocument();
  expect(screen.queryByLabelText("Custom resume content")).not.toBeInTheDocument();

  await userEvent.type(screen.getByLabelText("Message"), "Teams of 40{Enter}");
  expect(await screen.findByLabelText("Custom resume content")).toHaveValue("# Tailored for Initech");
  expect(generateBodies(fetchMock)[1]).toEqual({
    job_description: "Director at Initech",
    message: "Teams of 40",
    history: [
      { role: "user", content: GENERATE_MESSAGE },
      { role: "assistant", content: "Which team size should I emphasize?" },
    ],
  });
});

test("a failed generate shows an error message in the chat", async () => {
  mockChat({ status: 500 });
  await ready();
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));
  expect(await screen.findByText("Sorry, something went wrong. Please try again.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Generate custom resume" })).toBeEnabled();
});

test("downloading the generated resume records history with company, job, style, model and optimization", async () => {
  const fetchMock = mockChat({ body: RESUME_RESULT });
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    url === "/api/history" && init?.method === "POST"
      ? Response.json({
          id: 9,
          company: "Initech",
          style: "modern",
          downloaded_at: "2026-11-11T12:00:00Z",
          model: "openai/gpt-oss-120b", optimization: "full",
        })
      : base(url, init),
  );
  const assign = vi.fn();
  vi.stubGlobal("location", { assign });
  await ready();
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));
  await userEvent.click(await screen.findByRole("button", { name: "Download PDF" }));

  await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/api/history/9/pdf"));
  const post = fetchMock.mock.calls.find(([url, init]) => url === "/api/history" && init?.method === "POST")!;
  expect(JSON.parse(post[1]!.body as string)).toEqual({
    company: "Initech",
    job_description: "Director at Initech",
    content_md: "# Tailored for Initech",
    style: "modern",
    model: "openai/gpt-oss-120b",
    optimization: "smart",
  });
  expect(screen.getByRole("link", { name: "Download Initech resume" })).toBeInTheDocument();
});

test("download records the optimization level that generated the resume, not one chosen afterwards", async () => {
  const fetchMock = mockChat({ body: { ...RESUME_RESULT, optimization: "full" } });
  mockHistoryPost(fetchMock);
  await ready();
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));
  await screen.findByLabelText("Custom resume content");
  await userEvent.selectOptions(screen.getByLabelText("Optimization level"), "light");
  await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
  await vi.waitFor(() => expect(postedHistory(fetchMock).optimization).toBe("full"));
});

test("changing the optimization level saves it", async () => {
  const fetchMock = mockData();
  render(<Workspace />);
  await userEvent.selectOptions(await screen.findByLabelText("Optimization level"), "full");
  await waitFor(() => expect(lastPreferencesPut(fetchMock)).toEqual({ ...PREFS, optimization: "full" }));
});

test("download records the model that generated the resume, not a model chosen afterwards", async () => {
  const fetchMock = mockChat({ body: { ...RESUME_RESULT, model: "anthropic/claude-haiku-5.5" } });
  mockHistoryPost(fetchMock);
  await ready();
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));
  await screen.findByLabelText("Custom resume content");
  await userEvent.selectOptions(screen.getByLabelText("AI model"), "openai/gpt-6-sol");
  await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
  await vi.waitFor(() => expect(postedHistory(fetchMock).model).toBe("anthropic/claude-haiku-5.5"));
});

function mockHistoryPost(fetchMock: ReturnType<typeof mockData>) {
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    url === "/api/history" && init?.method === "POST"
      ? Response.json({ id: 9, company: "Initech", style: "modern", downloaded_at: "2026-11-11T12:00:00Z" })
      : base(url, init),
  );
  vi.stubGlobal("location", { assign: vi.fn() });
}

function postedHistory(fetchMock: ReturnType<typeof mockData>) {
  const post = fetchMock.mock.calls.find(([url, init]) => url === "/api/history" && init?.method === "POST")!;
  return JSON.parse(post[1]!.body as string);
}

test("the generated resume can be edited", async () => {
  mockChat({ body: RESUME_RESULT });
  await ready();
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));
  const editor = await screen.findByLabelText("Custom resume content");
  await userEvent.clear(editor);
  await userEvent.type(editor, "# My own edit");
  expect(editor).toHaveValue("# My own edit");
  expect(screen.getByRole("heading", { name: "Custom resume for Initech" })).toBeInTheDocument();
});

test("download saves and renders the edited text, not the generated one", async () => {
  const fetchMock = mockChat({ body: RESUME_RESULT });
  mockHistoryPost(fetchMock);
  await ready();
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));
  const editor = await screen.findByLabelText("Custom resume content");
  await userEvent.type(editor, "\n\n## Added by me");
  await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));

  await vi.waitFor(() => expect(postedHistory(fetchMock).content_md).toBe("# Tailored for Initech\n\n## Added by me"));
});

test("edits survive a clarifying-question reply in the chat", async () => {
  const fetchMock = mockChat({ body: RESUME_RESULT }, { body: QUESTION_RESULT });
  mockHistoryPost(fetchMock);
  await ready();
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));
  const editor = await screen.findByLabelText("Custom resume content");
  await userEvent.clear(editor);
  await userEvent.type(editor, "# Edited");

  await userEvent.type(screen.getByLabelText("Message"), "Any thoughts?{Enter}");
  expect(await screen.findByText("Which team size should I emphasize?")).toBeInTheDocument();
  expect(editor).toHaveValue("# Edited");

  await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
  await vi.waitFor(() => expect(postedHistory(fetchMock).content_md).toBe("# Edited"));
});

test("a newly generated resume replaces earlier edits", async () => {
  mockChat({ body: RESUME_RESULT }, { body: { ...RESUME_RESULT, resume_md: "# Second version" } });
  await ready();
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));
  const editor = await screen.findByLabelText("Custom resume content");
  await userEvent.type(editor, " edited");
  await userEvent.type(screen.getByLabelText("Message"), "Regenerate please{Enter}");
  await vi.waitFor(() => expect(screen.getByLabelText("Custom resume content")).toHaveValue("# Second version"));
});

test("clearing the resume disables download", async () => {
  mockChat({ body: RESUME_RESULT });
  await ready();
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));
  await userEvent.clear(await screen.findByLabelText("Custom resume content"));
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
});

test("changing the phone option saves include_phone", async () => {
  const fetchMock = mockData();
  render(<Workspace />);
  await userEvent.click(await screen.findByRole("checkbox", { name: "Include phone number in generated resume" }));
  await waitFor(() => expect(lastPreferencesPut(fetchMock)).toEqual({ ...PREFS, include_phone: false }));
});

test("changing experience years saves them", async () => {
  const fetchMock = mockData();
  render(<Workspace />);
  const professional = await screen.findByLabelText("Professional Experience (years)");
  await userEvent.clear(professional);
  await userEvent.type(professional, "8");
  await waitFor(() => expect(lastPreferencesPut(fetchMock)).toEqual({ ...PREFS, professional_years: 8 }));
});

function chatLines() {
  return [...screen.getByRole("log", { name: "Conversation" }).children].map((el) => el.textContent);
}

const DEFAULT_NOTE = "Model: openai/gpt-oss-120b\nOptimization level: Smart integration\nTone: concise";

test("settings note lists model, optimization level and tone; notes only when set; no experience years", () => {
  expect(settingsNote(PREFS)).toBe(DEFAULT_NOTE);
  expect(settingsNote({ ...PREFS, professional_years: 8, earlier_years: 0 })).toBe(DEFAULT_NOTE);
  expect(DEFAULT_NOTE).not.toMatch(/Experience/);
  expect(settingsNote({ ...PREFS, optimization: "light" })).toContain("\nOptimization level: Light polish\n");
  expect(settingsNote({ ...PREFS, optimization: "full" }).split("\n")[1]).toBe("Optimization level: Full tailoring");
  expect(settingsNote({ ...PREFS, tone: "  ", notes: " Lead with AI ", earlier_years: 0 })).toBe(
    "Model: openai/gpt-oss-120b\nOptimization level: Smart integration\nTone: no preference\nNotes: Lead with AI",
  );
});

test("the model and settings are shown in the chat before the generate prompt", async () => {
  mockChat({ body: RESUME_RESULT });
  await ready();
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));
  await screen.findByText("Here is your resume.");
  expect(chatLines()).toEqual([
    DEFAULT_NOTE,
    `You: ${GENERATE_MESSAGE}`,
    "AI: Here is your resume.",
  ]);
});

test("the model note shows the saved model and is not sent to the AI", async () => {
  const fetchMock = mockChat({ body: QUESTION_RESULT }, { body: RESUME_RESULT });
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    url === "/api/preferences" && init?.method === "GET"
      ? Response.json({ ...PREFS, model: "anthropic/claude-haiku-5.5" })
      : base(url, init),
  );
  await ready();
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));
  await screen.findByText("Which team size should I emphasize?");
  await userEvent.type(screen.getByLabelText("Message"), "Teams of 40{Enter}");
  await screen.findByText("Here is your resume.");

  const notes = chatLines().filter((line) => line!.startsWith("Model: "));
  expect(notes).toEqual(Array(2).fill(DEFAULT_NOTE.replace("openai/gpt-oss-120b", "anthropic/claude-haiku-5.5")));
  expect(generateBodies(fetchMock)[1].history).toEqual([
    { role: "user", content: GENERATE_MESSAGE },
    { role: "assistant", content: "Which team size should I emphasize?" },
  ]);
});

test("after changing settings the next generate's note shows them", async () => {
  mockChat({ body: RESUME_RESULT });
  const fetchMock = vi.mocked(fetch);
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url, init) =>
    url === "/api/preferences" && init?.method === "PUT"
      ? Response.json(JSON.parse(init.body as string))
      : base(url as string, init),
  );
  await ready();
  await userEvent.selectOptions(screen.getByLabelText("AI model"), "openai/gpt-5.4-nano");
  await userEvent.selectOptions(screen.getByLabelText("Optimization level"), "full");
  await userEvent.clear(screen.getByLabelText("Professional Experience (years)"));
  await userEvent.type(screen.getByLabelText("Professional Experience (years)"), "8");
  await userEvent.clear(screen.getByLabelText("Tone"));
  await userEvent.type(screen.getByLabelText("Notes for the AI"), "Stress mentoring");
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));
  await screen.findByText("Here is your resume.");
  expect(chatLines()[0]).toBe(
    "Model: openai/gpt-5.4-nano\nOptimization level: Full tailoring\nTone: no preference\nNotes: Stress mentoring",
  );
});

test("generate waits for a pending preference save", async () => {
  const fetchMock = mockChat({ body: RESUME_RESULT });
  const base = fetchMock.getMockImplementation()!;
  let finishSave!: () => void;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    url === "/api/preferences" && init?.method === "PUT"
      ? new Promise<Response>((resolve) => (finishSave = () => resolve(Response.json(PREFS))))
      : base(url, init),
  );
  await ready();
  await userEvent.click(screen.getByRole("checkbox", { name: "Include phone number in generated resume" }));
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));
  expect(generateBodies(fetchMock)).toHaveLength(0);
  finishSave();
  expect(await screen.findByText("Here is your resume.")).toBeInTheDocument();
  expect(generateBodies(fetchMock)).toHaveLength(1);
});

function mockClear(status: number) {
  const fetchMock = mockData();
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    url === "/api/history" && init?.method === "DELETE" ? new Response(null, { status }) : base(url, init),
  );
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  return fetchMock;
}

test("clearing history deletes it on the server and empties the list", async () => {
  const fetchMock = mockClear(204);
  render(<Workspace />);
  expect(await screen.findByRole("link", { name: "Download Acme resume" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Clear history" }));
  expect(await screen.findByText("No downloads yet.")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/history", { method: "DELETE" });
});

test("history stays and the user is told when the server fails to clear it", async () => {
  mockClear(500);
  const alert = vi.fn();
  vi.stubGlobal("alert", alert);
  render(<Workspace />);
  await userEvent.click(await screen.findByRole("button", { name: "Clear history" }));
  await waitFor(() => expect(alert).toHaveBeenCalledWith(CLEAR_FAILED));
  expect(screen.getByRole("link", { name: "Download Acme resume" })).toBeInTheDocument();
});
