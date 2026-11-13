"use client";

import { useEffect, useState } from "react";

import type { Model, Style } from "@/lib/api";

/** `model` is the model that generated the resume. */
export type CustomResumeData = { company: string; content_md: string; model: Model };

type Mode = "markdown" | "preview";

type Props = {
  resume: CustomResumeData | null;
  style: Style;
  renderPreview: (content_md: string, style: Style) => Promise<string>;
  onChange: (content_md: string) => void;
  onDownload: () => void;
};

const MODES: { mode: Mode; label: string }[] = [
  { mode: "markdown", label: "Markdown" },
  { mode: "preview", label: "Preview" },
];

/** The generated custom resume: editable Markdown or a preview as the PDF renders it, plus PDF download. */
export default function CustomResume({ resume, style, renderPreview, onChange, onDownload }: Props) {
  const [mode, setMode] = useState<Mode>("markdown");
  const [html, setHtml] = useState("");
  const content = resume?.content_md;

  useEffect(() => {
    if (mode !== "preview" || content === undefined) return;
    let current = true;
    renderPreview(content, style).then((next) => current && setHtml(next));
    return () => {
      current = false;
    };
  }, [mode, content, style, renderPreview]);

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Custom resume{resume && ` for ${resume.company}`}</h2>
        {resume && (
          <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded border border-line text-sm">
              {MODES.map((m) => (
                <button
                  key={m.mode}
                  aria-pressed={mode === m.mode}
                  onClick={() => setMode(m.mode)}
                  className="px-3 py-1 aria-pressed:bg-primary aria-pressed:font-semibold aria-pressed:text-canvas"
                >
                  {m.label}
                </button>
              ))}
            </div>
            <button
              onClick={onDownload}
              disabled={!resume.content_md.trim()}
              className="rounded bg-primary px-3 py-1 text-sm font-semibold text-canvas disabled:opacity-40"
            >
              Download PDF
            </button>
          </div>
        )}
      </div>
      {!resume && <p className="text-sm text-ink/60">Your tailored resume will appear here.</p>}
      {resume && mode === "markdown" && (
        <>
          <p className="mb-2 text-xs text-ink/60">Edit freely; the PDF and history use exactly this text.</p>
          <textarea
            aria-label="Custom resume content"
            value={resume.content_md}
            onChange={(e) => onChange(e.target.value)}
            rows={24}
            className="w-full rounded border border-line bg-canvas p-2 font-mono text-sm focus:border-primary focus:outline-none"
          />
        </>
      )}
      {resume && mode === "preview" && (
        <>
          <p className="mb-2 text-xs text-ink/60">Preview in the {style} PDF style; switch to Markdown to edit.</p>
          <iframe
            title="Custom resume preview"
            srcDoc={html}
            sandbox=""
            className="h-[36rem] w-full rounded border border-line bg-white"
          />
        </>
      )}
    </section>
  );
}
