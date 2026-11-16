"use client";

import { useEffect, useState } from "react";

import type { GenerationSettings, Model, ProCandidate, Style } from "@/lib/api";

/** `settings` are the preferences that generated the resume (saved with its download; for a Pro candidate,
 * `model` is the candidate's). `review` is the judge's review of a Pro candidate. */
export type CustomResumeData = {
  company: string;
  content_md: string;
  settings: GenerationSettings;
  review?: Pick<ProCandidate, "score" | "strengths" | "weaknesses" | "rule_violations">;
};

/** Pro mode result: the candidates best first, the one shown, and the judge's verdict. */
export type ProView = {
  versions: CustomResumeData[];
  selected: number;
  rationale: string;
  judgeModel: Model | null;
  onSelect: (index: number) => void;
};

type Mode = "markdown" | "preview";

type Props = {
  resume: CustomResumeData | null;
  pro?: ProView | null;
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
export default function CustomResume({ resume, pro, style, renderPreview, onChange, onDownload }: Props) {
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
      {resume && pro && <ProCandidates pro={pro} />}
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

/** Tab label: model, score, "best" for the winner and the number of rule violations. */
export function candidateLabel(version: CustomResumeData, index: number): string {
  const review = version.review!;
  const issues = review.rule_violations.length;
  return [
    version.settings.model,
    review.score !== null && `${review.score}/10`,
    index === 0 && review.score !== null && "best",
    issues > 0 && `${issues} ${issues === 1 ? "issue" : "issues"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** One tab per Pro candidate, then the judge's verdict and the shown candidate's review. */
function ProCandidates({ pro }: { pro: ProView }) {
  const review = pro.versions[pro.selected].review!;
  return (
    <div className="mb-3 flex flex-col gap-2 text-sm">
      <div role="tablist" aria-label="Pro candidates" className="flex flex-wrap gap-2">
        {pro.versions.map((version, index) => (
          <button
            key={version.settings.model}
            role="tab"
            aria-selected={index === pro.selected}
            onClick={() => pro.onSelect(index)}
            className="rounded border border-line px-3 py-1 text-xs aria-selected:border-primary aria-selected:bg-primary/15 aria-selected:font-semibold"
          >
            {candidateLabel(version, index)}
          </button>
        ))}
      </div>
      <details open className="rounded border border-line bg-canvas p-2 text-xs">
        <summary className="cursor-pointer font-semibold">
          {pro.judgeModel ? `Why it won (judged by ${pro.judgeModel})` : "Not compared"}
        </summary>
        <p className="mt-1">{pro.rationale}</p>
        {review.strengths && <p className="mt-1">Strengths: {review.strengths}</p>}
        {review.weaknesses && <p className="mt-1">Weaknesses: {review.weaknesses}</p>}
        {review.rule_violations.length > 0 && (
          <ul aria-label="Rule violations" className="mt-1 list-disc pl-4 text-accent">
            {review.rule_violations.map((violation) => (
              <li key={violation}>{violation}</li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
