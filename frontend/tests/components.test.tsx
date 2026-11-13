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

const MODEL = "openai/gpt-oss-120b" as const;
const PREVIEW = { style: "modern" as const, renderPreview: vi.fn() };

test("custom resume shows placeholder and no download when empty", () => {
  render(<CustomResume {...PREVIEW} resume={null} onChange={vi.fn()} onDownload={vi.fn()} />);
  expect(screen.getByText("Your tailored resume will appear here.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Custom resume content")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Download PDF" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
});

test("custom resume shows editable content and downloads", async () => {
  const onDownload = vi.fn();
  render(<CustomResume {...PREVIEW} resume={{ company: "Acme", content_md: "# Tailored", model: MODEL }} onChange={vi.fn()} onDownload={onDownload} />);
  expect(screen.getByRole("heading", { name: "Custom resume for Acme" })).toBeInTheDocument();
  const editor = screen.getByRole("textbox", { name: "Custom resume content" });
  expect(editor).toHaveValue("# Tailored");
  expect(editor).not.toHaveAttribute("readonly");
  await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
  expect(onDownload).toHaveBeenCalledOnce();
});

test("editing the custom resume reports the new text", async () => {
  const onChange = vi.fn();
  render(<CustomResume {...PREVIEW} resume={{ company: "Acme", content_md: "# Tailored", model: MODEL }} onChange={onChange} onDownload={vi.fn()} />);
  await userEvent.type(screen.getByLabelText("Custom resume content"), "!");
  expect(onChange).toHaveBeenCalledWith("# Tailored!");
});

test("download is disabled when the edited resume is empty", () => {
  render(<CustomResume {...PREVIEW} resume={{ company: "Acme", content_md: "  \n ", model: MODEL }} onChange={vi.fn()} onDownload={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
});

function previewTitle() {
  return screen.getByTitle("Custom resume preview");
}

test("custom resume starts in Markdown mode", () => {
  render(<CustomResume {...PREVIEW} resume={{ company: "Acme", content_md: "# Tailored", model: MODEL }} onChange={vi.fn()} onDownload={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Markdown" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Preview" })).toHaveAttribute("aria-pressed", "false");
});

test("preview mode renders the resume in the PDF style and toggles back to the editor", async () => {
  const renderPreview = vi.fn().mockResolvedValue("<h1>Tailored</h1>");
  render(
    <CustomResume
      resume={{ company: "Acme", content_md: "# Tailored", model: MODEL }}
      style="classic"
      renderPreview={renderPreview}
      onChange={vi.fn()}
      onDownload={vi.fn()}
    />,
  );
  expect(renderPreview).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Preview" }));
  expect(renderPreview).toHaveBeenCalledWith("# Tailored", "classic");
  await vi.waitFor(() => expect(previewTitle()).toHaveAttribute("srcdoc", "<h1>Tailored</h1>"));
  expect(previewTitle()).toHaveAttribute("sandbox", "");
  expect(screen.queryByLabelText("Custom resume content")).not.toBeInTheDocument();
  expect(screen.getByText("Preview in the classic PDF style; switch to Markdown to edit.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();

  await userEvent.click(screen.getByRole("button", { name: "Markdown" }));
  expect(screen.getByLabelText("Custom resume content")).toHaveValue("# Tailored");
  expect(screen.queryByTitle("Custom resume preview")).not.toBeInTheDocument();
});

test("preview re-renders when the resume or style changes", async () => {
  const renderPreview = vi.fn(async (md: string, style: string) => `${style}:${md}`);
  const props = { renderPreview, onChange: vi.fn(), onDownload: vi.fn() };
  const { rerender } = render(<CustomResume {...props} style="modern" resume={{ company: "A", content_md: "# One", model: MODEL }} />);
  await userEvent.click(screen.getByRole("button", { name: "Preview" }));
  await vi.waitFor(() => expect(previewTitle()).toHaveAttribute("srcdoc", "modern:# One"));
  rerender(<CustomResume {...props} style="modern" resume={{ company: "A", content_md: "# Two", model: MODEL }} />);
  await vi.waitFor(() => expect(previewTitle()).toHaveAttribute("srcdoc", "modern:# Two"));
  rerender(<CustomResume {...props} style="classic" resume={{ company: "A", content_md: "# Two", model: MODEL }} />);
  await vi.waitFor(() => expect(previewTitle()).toHaveAttribute("srcdoc", "classic:# Two"));
});
