"use client";

import { useState } from "react";

import PanelTitle from "./PanelTitle";

type Props = { content: string | null; onUpload: (content: string) => void };

/** Baseline resume: shows the saved content and uploads a replacement (.md or .txt).
 * Starts collapsed when a baseline is already saved, expanded otherwise. */
export default function ResumePanel({ content, onUpload }: Props) {
  const [open, setOpen] = useState(!content);

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onUpload(await file.text());
    event.target.value = "";
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <PanelTitle title="Baseline resume" open={open} onToggle={() => setOpen(!open)} />
        <label className="cursor-pointer rounded bg-primary px-3 py-1 text-sm font-semibold text-canvas">
          Upload resume
          <input type="file" accept=".md,.txt" onChange={upload} className="hidden" />
        </label>
      </div>
      {!open ? null : content ? (
        <pre aria-label="Baseline resume content" className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm">
          {content}
        </pre>
      ) : (
        <p className="text-sm text-ink/60">No resume uploaded yet.</p>
      )}
    </section>
  );
}
