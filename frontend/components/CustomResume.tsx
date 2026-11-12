export type CustomResumeData = { company: string; content_md: string };

type Props = { resume: CustomResumeData | null; onDownload: () => void };

/** The generated custom resume with a PDF download button. */
export default function CustomResume({ resume, onDownload }: Props) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Custom resume{resume && ` for ${resume.company}`}</h2>
        {resume && (
          <button
            onClick={onDownload}
            className="rounded bg-primary px-3 py-1 text-sm font-semibold text-canvas"
          >
            Download PDF
          </button>
        )}
      </div>
      {resume ? (
        <pre aria-label="Custom resume content" className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm">
          {resume.content_md}
        </pre>
      ) : (
        <p className="text-sm text-ink/60">Your tailored resume will appear here.</p>
      )}
    </section>
  );
}
