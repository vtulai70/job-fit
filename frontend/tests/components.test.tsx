import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import CustomResume from "@/components/CustomResume";
import JobDescription from "@/components/JobDescription";
import ResumePanel from "@/components/ResumePanel";

test("resume panel shows empty state", () => {
  render(<ResumePanel content={null} onUpload={vi.fn()} />);
  expect(screen.getByText("No resume uploaded yet.")).toBeInTheDocument();
});

test("resume panel shows saved content", () => {
  render(<ResumePanel content="# Jane Doe" onUpload={vi.fn()} />);
  expect(screen.getByLabelText("Baseline resume content")).toHaveTextContent("# Jane Doe");
});

test("resume panel passes uploaded file text to onUpload", async () => {
  const onUpload = vi.fn();
  const { container } = render(<ResumePanel content={null} onUpload={onUpload} />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).toHaveAttribute("accept", ".md,.txt");
  await userEvent.upload(input, new File(["# Jane\n\nEngineer"], "resume.md"));
  await vi.waitFor(() => expect(onUpload).toHaveBeenCalledWith("# Jane\n\nEngineer"));
});

test("job description reports typed text", async () => {
  const onChange = vi.fn();
  render(<JobDescription value="" onChange={onChange} />);
  await userEvent.type(screen.getByLabelText("Job description"), "A");
  expect(onChange).toHaveBeenCalledWith("A");
  expect(screen.getByPlaceholderText("Paste the full job description text")).toBeInTheDocument();
});

test("custom resume shows placeholder and no download when empty", () => {
  render(<CustomResume resume={null} onChange={vi.fn()} onDownload={vi.fn()} />);
  expect(screen.getByText("Your tailored resume will appear here.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Custom resume content")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Download PDF" })).not.toBeInTheDocument();
});

test("custom resume shows editable content and downloads", async () => {
  const onDownload = vi.fn();
  render(<CustomResume resume={{ company: "Acme", content_md: "# Tailored" }} onChange={vi.fn()} onDownload={onDownload} />);
  expect(screen.getByRole("heading", { name: "Custom resume for Acme" })).toBeInTheDocument();
  const editor = screen.getByRole("textbox", { name: "Custom resume content" });
  expect(editor).toHaveValue("# Tailored");
  expect(editor).not.toHaveAttribute("readonly");
  await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
  expect(onDownload).toHaveBeenCalledOnce();
});

test("editing the custom resume reports the new text", async () => {
  const onChange = vi.fn();
  render(<CustomResume resume={{ company: "Acme", content_md: "# Tailored" }} onChange={onChange} onDownload={vi.fn()} />);
  await userEvent.type(screen.getByLabelText("Custom resume content"), "!");
  expect(onChange).toHaveBeenCalledWith("# Tailored!");
});

test("download is disabled when the edited resume is empty", () => {
  render(<CustomResume resume={{ company: "Acme", content_md: "  \n " }} onChange={vi.fn()} onDownload={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
});
