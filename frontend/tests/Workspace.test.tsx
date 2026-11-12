import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import Workspace, { GENERATE_MESSAGE } from "@/components/Workspace";

import { mockFetch } from "./fetchMock";

const PREFS = { style: "modern", tone: "concise", max_pages: 2, notes: "" };
const HISTORY = [{ id: 1, company: "Acme", style: "modern", downloaded_at: "2026-11-11T10:00:00Z" }];

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
  expect(await screen.findByLabelText("Baseline resume content")).toHaveTextContent("# Saved resume");
  expect(await screen.findByText("Acme")).toBeInTheDocument();
  expect(await screen.findByLabelText("PDF style")).toHaveValue("modern");
  expect(screen.getByLabelText("Tone")).toHaveValue("concise");
});

test("shows empty baseline when none saved", async () => {
  mockData(null);
  render(<Workspace />);
  await screen.findByLabelText("PDF style");
  expect(screen.getByText("No resume uploaded yet.")).toBeInTheDocument();
});

test("uploading a resume saves it and shows the saved content", async () => {
  const fetchMock = mockData();
  const { container } = render(<Workspace />);
  await screen.findByLabelText("Baseline resume content");
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, new File(["# New resume"], "resume.md"));
  await screen.findByText("# New resume");
  const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
  expect(put[0]).toBe("/api/resume/baseline");
  expect(JSON.parse(put[1]!.body as string)).toEqual({ content_md: "# New resume" });
});

test("saving preferences sends them to the API", async () => {
  const fetchMock = mockData();
  render(<Workspace />);
  await userEvent.selectOptions(await screen.findByLabelText("PDF style"), "classic");
  await userEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  expect(await screen.findByText("Saved")).toBeInTheDocument();
  const put = fetchMock.mock.calls.find(([url, init]) => url === "/api/preferences" && init?.method === "PUT")!;
  expect(JSON.parse(put[1]!.body as string)).toEqual({ ...PREFS, style: "classic" });
});

test("job description is kept as typed", async () => {
  mockData();
  render(<Workspace />);
  const box = screen.getByLabelText("Job description");
  await userEvent.type(box, "Director of Engineering");
  expect(box).toHaveValue("Director of Engineering");
});

const RESUME_RESULT = { reply: "Here is your resume.", company: "Initech", resume_md: "# Tailored for Initech" };
const QUESTION_RESULT = { reply: "Which team size should I emphasize?", company: "Initech", resume_md: null };

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

async function ready() {
  render(<Workspace />);
  await screen.findByLabelText("Baseline resume content");
  await userEvent.type(screen.getByLabelText("Job description"), "Director at Initech");
}

test("generate is disabled without a job description", async () => {
  mockData();
  render(<Workspace />);
  await screen.findByLabelText("Baseline resume content");
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
  expect(screen.getByLabelText("Custom resume content")).toHaveTextContent("# Tailored for Initech");
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
  expect(await screen.findByLabelText("Custom resume content")).toHaveTextContent("# Tailored for Initech");
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

test("downloading the generated resume records history with company, job and style", async () => {
  const fetchMock = mockChat({ body: RESUME_RESULT });
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    url === "/api/history" && init?.method === "POST"
      ? Response.json({ id: 9, company: "Initech", style: "modern", downloaded_at: "2026-11-11T12:00:00Z" })
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
  });
  expect(screen.getByRole("link", { name: "Download Initech resume" })).toBeInTheDocument();
});
