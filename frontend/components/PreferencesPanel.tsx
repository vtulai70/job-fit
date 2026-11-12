"use client";

import { useState } from "react";

import type { Preferences, Style } from "@/lib/api";

type Props = { initial: Preferences; onSave: (prefs: Preferences) => Promise<void> };

const STYLES: Style[] = ["professional", "modern", "classic"];

/** Form for resume preferences used by the AI and the PDF style. */
export default function PreferencesPanel({ initial, onSave }: Props) {
  const [prefs, setPrefs] = useState(initial);
  const [saved, setSaved] = useState(false);

  function update(change: Partial<Preferences>) {
    setPrefs({ ...prefs, ...change });
    setSaved(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await onSave(prefs);
    setSaved(true);
  }

  const inputClass =
    "w-full rounded border border-line bg-canvas p-2 text-sm focus:border-primary focus:outline-none";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <h2 className="font-semibold">Preferences</h2>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label>
          PDF style
          <select
            value={prefs.style}
            onChange={(e) => update({ style: e.target.value as Style })}
            className={inputClass}
          >
            {STYLES.map((style) => (
              <option key={style} value={style}>
                {style}
              </option>
            ))}
          </select>
        </label>
        <label>
          Max pages
          <input
            type="number"
            min={1}
            max={5}
            value={prefs.max_pages}
            onChange={(e) => update({ max_pages: Number(e.target.value) })}
            className={inputClass}
          />
        </label>
      </div>
      <label className="text-sm">
        Tone
        <input
          value={prefs.tone}
          onChange={(e) => update({ tone: e.target.value })}
          placeholder="e.g. concise, metrics-driven"
          className={inputClass}
        />
      </label>
      <label className="text-sm">
        Notes for the AI
        <textarea
          value={prefs.notes}
          onChange={(e) => update({ notes: e.target.value })}
          rows={3}
          className={inputClass}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={prefs.include_phone}
          onChange={(e) => update({ include_phone: e.target.checked })}
          className="h-4 w-4 accent-primary"
        />
        Include phone number in generated resume
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" className="rounded bg-primary px-3 py-1 text-sm font-semibold text-canvas">
          Save preferences
        </button>
        {saved && <span className="text-sm text-ink/70">Saved</span>}
      </div>
    </form>
  );
}
