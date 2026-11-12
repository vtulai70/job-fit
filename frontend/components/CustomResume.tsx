export type CustomResumeData = { company: string; content_md: string };

type Props = {
  resume: CustomResumeData | null;
  onChange: (content_md: string) => void;
  onDownload: () => void;
};

/** The generated custom resume, editable in place, with a PDF download of the edited text. */
export default function CustomResume({ resume, onChange, onDownload }: Props) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Custom resume{resume && ` for ${resume.company}`}</h2>
        {resume && (
          <button
            onClick={onDownload}
            disabled={!resume.content_md.trim()}
            className="rounded bg-primary px-3 py-1 text-sm font-semibold text-canvas disabled:opacity-40"
          >
            Download PDF
          </button>
        )}
      </div>
      {resume ? (
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
      ) : (
        <p className="text-sm text-ink/60">Your tailored resume will appear here.</p>
      )}
    </section>
  );
}
