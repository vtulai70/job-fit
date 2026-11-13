import { type HistoryEntry, pdfUrl } from "@/lib/api";

type Props = { entries: HistoryEntry[]; onClear: () => void };

export const CLEAR_CONFIRM = "Delete all download history? This cannot be undone.";

/** Past downloads, newest first: company, time, generating model (when recorded) and a re-download link.
 * "Clear history" asks for confirmation, then calls onClear. */
export default function HistoryPanel({ entries, onClear }: Props) {
  return (
    <section aria-labelledby="history-heading" className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="history-heading" className="font-semibold">
          Download history
        </h2>
        {entries.length > 0 && (
          <button
            onClick={() => window.confirm(CLEAR_CONFIRM) && onClear()}
            className="rounded border border-line px-3 py-1 text-sm hover:border-primary hover:text-primary"
          >
            Clear history
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-ink/60">No downloads yet.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between py-2">
              <span>
                <span className="font-semibold">{entry.company}</span>
                <span className="ml-3 text-ink/60">{new Date(entry.downloaded_at).toLocaleString()}</span>
                {entry.model && <span className="ml-3 font-mono text-xs text-ink/60">{entry.model}</span>}
              </span>
              <a
                href={pdfUrl(entry.id)}
                aria-label={`Download ${entry.company} resume`}
                className="text-primary hover:underline"
              >
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
