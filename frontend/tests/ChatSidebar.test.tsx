import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import ChatSidebar from "@/components/ChatSidebar";

function renderChat(overrides = {}) {
  const props = {
    messages: [],
    busy: false,
    busyText: "Thinking...",
    ready: true,
    canGenerate: true,
    onSend: vi.fn(),
    onGenerate: vi.fn(),
    onClear: vi.fn(),
    usage: null,
    onPlans: vi.fn(),
    ...overrides,
  };
  render(<ChatSidebar {...props} />);
  return props;
}

test("shows hint when the conversation is empty", () => {
  renderChat();
  expect(screen.getByText("Ask anything about tailoring your resume.")).toBeInTheDocument();
});

test("renders the conversation with speaker labels", () => {
  renderChat({
    messages: [
      { role: "user", content: "Tailor it" },
      { role: "assistant", content: "Which team size?" },
    ],
  });
  const log = screen.getByRole("log", { name: "Conversation" });
  expect(within(log).getByText("Tailor it")).toHaveTextContent("You: Tailor it");
  expect(within(log).getByText("Which team size?")).toHaveTextContent("AI: Which team size?");
});

test("sends trimmed text and clears the input", async () => {
  const { onSend } = renderChat();
  const input = screen.getByLabelText("Message");
  await userEvent.type(input, "  Make it punchy  {Enter}");
  expect(onSend).toHaveBeenCalledWith("Make it punchy");
  expect(input).toHaveValue("");
});

test("send is disabled for empty text", async () => {
  const { onSend } = renderChat();
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await userEvent.type(screen.getByLabelText("Message"), "   {Enter}");
  expect(onSend).not.toHaveBeenCalled();
});

test("generate button calls onGenerate", async () => {
  const { onGenerate } = renderChat();
  await userEvent.click(screen.getByRole("button", { name: "Generate custom resume" }));
  expect(onGenerate).toHaveBeenCalledOnce();
});

test("generate is disabled until baseline and job description exist", () => {
  renderChat({ canGenerate: false });
  expect(screen.getByRole("button", { name: "Generate custom resume" })).toBeDisabled();
});

test("while busy, shows thinking and disables actions", async () => {
  renderChat({ busy: true });
  expect(screen.getByText("Thinking...")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Generate custom resume" })).toBeDisabled();
  await userEvent.type(screen.getByLabelText("Message"), "hi");
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
});

test("model notes render as plain lines without a speaker label", () => {
  renderChat({
    messages: [
      { role: "info", content: "Model: anthropic/claude-haiku-5.5" },
      { role: "user", content: "Tailor it" },
    ],
  });
  const note = within(screen.getByRole("log", { name: "Conversation" })).getByText("Model: anthropic/claude-haiku-5.5");
  expect(note).toHaveTextContent(/^Model: anthropic\/claude-haiku-5\.5$/);
});

test("before preferences load, generate and send are disabled", async () => {
  const { onSend } = renderChat({ ready: false });
  expect(screen.getByRole("button", { name: "Generate custom resume" })).toBeDisabled();
  await userEvent.type(screen.getByLabelText("Message"), "hi{Enter}");
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  expect(onSend).not.toHaveBeenCalled();
});

test("Clear conversation shows only with messages and is disabled while busy", async () => {
  const { unmount } = render(
    <ChatSidebar messages={[]} busy={false} busyText="" ready canGenerate onSend={vi.fn()} onGenerate={vi.fn()} onClear={vi.fn()} usage={null} onPlans={vi.fn()} />,
  );
  expect(screen.queryByRole("button", { name: "Clear conversation" })).not.toBeInTheDocument();
  unmount();
  const messages = [{ role: "user" as const, content: "hi" }];
  const busy = renderChat({ messages, busy: true });
  expect(screen.getByRole("button", { name: "Clear conversation" })).toBeDisabled();
  expect(busy.onClear).not.toHaveBeenCalled();
});

test("Clear conversation calls onClear", async () => {
  const props = renderChat({ messages: [{ role: "user", content: "hi" }] });
  await userEvent.click(screen.getByRole("button", { name: "Clear conversation" }));
  expect(props.onClear).toHaveBeenCalledOnce();
});

test("shows this month's usage and plan, and Plans opens the pricing table", async () => {
  const usage = { plan: "free", features: [], limit: 5, used: 3, resets_at: "2026-12-01T00:00:00Z" };
  const props = renderChat({ usage });
  expect(screen.getByText("3 of 5 resumes this month · Free plan")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Plans" }));
  expect(props.onPlans).toHaveBeenCalledOnce();
});

test("no usage line or Plans button before the plan loads", () => {
  renderChat();
  expect(screen.queryByRole("button", { name: "Plans" })).not.toBeInTheDocument();
});
