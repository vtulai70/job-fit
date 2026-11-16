import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import SignedIn from "@/components/SignedIn";
import type { PlanInfo } from "@/lib/api";

import { mockFetch } from "./fetchMock";

const clerk = vi.hoisted(() => ({ getToken: vi.fn(async () => "token") }));

vi.mock("@clerk/react", () => ({
  UserButton: () => <button>User menu</button>,
  useAuth: () => ({ getToken: clerk.getToken }),
  PricingTable: (props: { for: string }) => <div data-testid="pricing-table" data-for={props.for} />,
}));

const FREE: PlanInfo = { plan: "free", features: [], limit: 5, used: 2, resets_at: "2026-12-01T00:00:00Z" };
const PRO: PlanInfo = { plan: "pro", features: ["pdf_download", "premium_models", "pro_mode"], limit: 200, used: 0, resets_at: "2026-12-01T00:00:00Z" };
const PREFS = {
  style: "modern", tone: "", max_pages: 2, notes: "", include_phone: true, include_graduation_year: false,
  professional_years: 15, earlier_years: 10, model: "openai/gpt-oss-120b", optimization: "smart", pro_mode: false,
  pro_models: ["anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5"],
};
const RESULT = {
  reply: "Here it is.", company: "Initech", resume_md: "# Tailored", pro: null, model: "openai/gpt-oss-120b",
  optimization: "smart", professional_years: 15, earlier_years: 10, max_pages: 2, tone: "", notes: "",
};

/** The signed-in app with GET /api/plan answering each plan in turn (the last repeats). */
function renderApp(...plans: PlanInfo[]) {
  const fetchMock = mockFetch({
    "GET /api/health": { body: { status: "ok" } },
    "GET /api/resume/baseline": { body: { content_md: "# Saved", updated_at: null } },
    "GET /api/history": { body: [] },
    "GET /api/preferences": { body: PREFS },
    "POST /api/generate": { body: RESULT },
  });
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    url === "/api/plan" ? Response.json(plans.length > 1 ? plans.shift() : plans[0]) : base(url, init),
  );
  render(<SignedIn />);
  return fetchMock;
}

test("the title bar shows this month's usage and Plans, left of the account menu", async () => {
  renderApp(FREE);
  const banner = screen.getByRole("banner");
  const usage = await within(banner).findByText("2 of 5 resumes this month · Free plan");
  const plans = within(banner).getByRole("button", { name: "Plans" });
  const account = within(banner).getByRole("button", { name: "User menu" });
  expect(usage.compareDocumentPosition(plans) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(plans.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const chat = screen.getByRole("complementary", { name: "AI chat" });
  expect(within(chat).queryByRole("button", { name: "Plans" })).not.toBeInTheDocument();
  expect(within(chat).queryByText(/resumes this month/)).not.toBeInTheDocument();
});

test("Plans opens Clerk's pricing table; closing it refreshes the session token, then the plan", async () => {
  renderApp(FREE, PRO);
  await userEvent.click(await screen.findByRole("button", { name: "Plans" }));
  const dialog = screen.getByRole("dialog", { name: "Plans" });
  expect(within(dialog).getByTestId("pricing-table")).toHaveAttribute("data-for", "user");
  await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(clerk.getToken).toHaveBeenCalledWith({ skipCache: true });
  expect(await screen.findByText("0 of 200 resumes this month · Pro plan")).toBeInTheDocument();
});

test("the title bar usage updates after a generation", async () => {
  renderApp(FREE, { ...FREE, used: 3 });
  await screen.findByText("2 of 5 resumes this month · Free plan");
  await userEvent.type(screen.getByLabelText("Job description"), "Director at Initech");
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));
  expect(await screen.findByText("3 of 5 resumes this month · Free plan")).toBeInTheDocument();
});

test("the plan's features reach the workspace: no PDF download on Free", async () => {
  renderApp(FREE);
  await screen.findByText("2 of 5 resumes this month · Free plan");
  await userEvent.type(screen.getByLabelText("Job description"), "Director at Initech");
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));
  expect(await screen.findByRole("button", { name: "Download PDF" })).toBeDisabled();
});
