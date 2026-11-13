"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { type HistoryEntry, pdfUrl } from "@/lib/api";

import PanelTitle from "./PanelTitle";

type Props = { entries: HistoryEntry[]; onClear: () => void };

export const CLEAR_CONFIRM = "Delete all download history? This cannot be undone.";

/** Rows shown before the list scrolls. */
export const MAX_VISIBLE = 10;

/** Past downloads, newest first: company, time, generating model (when recorded) and a re-download link.
 * "Clear history" asks for confirmation, then calls onClear. The list is as tall as its first
 * MAX_VISIBLE rows (measured, since rows can wrap) and scrolls beyond that. Starts expanded. */
export default function HistoryPanel({ entries, onClear }: Props) {
  const [open, setOpen] = useState(true);
  const list = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    if (!list.current) return;
    const last = list.current.children[MAX_VISIBLE - 1] as HTMLElement | undefined;
    list.current.style.maxHeight = last && entries.length > MAX_VISIBLE ? `${last.offsetTop + last.offsetHeight}px` : "";
  }, [entries, open]);

  return (
    <section aria-labelledby="history-heading" className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <PanelTitle id="history-heading" title="Download history" open={open} onToggle={() => setOpen(!open)} />
        {entries.length > 0 && (
          <button
            onClick={() => window.confirm(CLEAR_CONFIRM) && onClear()}
            className="rounded border border-line px-3 py-1 text-sm hover:border-primary hover:text-primary"
          >
            Clear history
          </button>
        )}
      </div>
      {!open ? null : entries.length === 0 ? (
        <p className="text-sm text-ink/60">No downloads yet.</p>
      ) : (
        <ul ref={list} className="relative divide-y divide-line overflow-y-auto text-sm">
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
