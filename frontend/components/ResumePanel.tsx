"use client";

type Props = { content: string | null; onUpload: (content: string) => void };

/** Baseline resume: shows the saved content and uploads a replacement (.md or .txt). */
export default function ResumePanel({ content, onUpload }: Props) {
  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onUpload(await file.text());
    event.target.value = "";
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Baseline resume</h2>
        <label className="cursor-pointer rounded bg-primary px-3 py-1 text-sm font-semibold text-canvas">
          Upload resume
          <input type="file" accept=".md,.txt" onChange={upload} className="hidden" />
        </label>
      </div>
      {content ? (
        <pre aria-label="Baseline resume content" className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm">
          {content}
        </pre>
      ) : (
        <p className="text-sm text-ink/60">No resume uploaded yet.</p>
      )}
    </section>
  );
}
