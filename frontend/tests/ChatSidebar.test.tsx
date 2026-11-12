import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import ChatSidebar from "@/components/ChatSidebar";

function renderChat(overrides = {}) {
  const props = {
    messages: [],
    busy: false,
    canGenerate: true,
    onSend: vi.fn(),
    onGenerate: vi.fn(),
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
