import { type HistoryEntry, pdfUrl } from "@/lib/api";

/** Past downloads, newest first: company, time, generating model (when recorded) and a re-download link. */
export default function HistoryPanel({ entries }: { entries: HistoryEntry[] }) {
  return (
    <section aria-labelledby="history-heading" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="history-heading" className="mb-2 font-semibold">
        Download history
      </h2>
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
