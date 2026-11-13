"use client";

import { useState } from "react";

import { MODELS, type Model, type Preferences, type Style } from "@/lib/api";

type Props = { initial: Preferences; onChange: (prefs: Preferences) => void };

const STYLES: Style[] = ["professional", "modern", "classic"];

const inputClass =
  "w-full rounded border border-line bg-canvas p-2 text-sm focus:border-primary focus:outline-none";

const groupClass = "flex flex-col gap-3 border-t border-line pt-3";

/** Preferences in two groups, resume generation then PDF style; every change is reported to be saved. */
export default function PreferencesPanel({ initial, onChange }: Props) {
  const [prefs, setPrefs] = useState(initial);

  function update(change: Partial<Preferences>) {
    const next = { ...prefs, ...change };
    setPrefs(next);
    onChange(next);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <h2 className="font-semibold">Preferences</h2>
      <fieldset className={groupClass}>
        <legend className="text-sm font-semibold text-primary">Resume generation</legend>
        <label className="text-sm">
          AI model
          <select
            value={prefs.model}
            onChange={(e) => update({ model: e.target.value as Model })}
            className={inputClass}
          >
            {MODELS.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>
            Professional Experience (years)
            <input
              type="number"
              min={1}
              max={50}
              value={prefs.professional_years}
              onChange={(e) => update({ professional_years: Number(e.target.value) })}
              className={inputClass}
            />
          </label>
          <label>
            Earlier Experience (years)
            <input
              type="number"
              min={0}
              max={50}
              value={prefs.earlier_years}
              onChange={(e) => update({ earlier_years: Number(e.target.value) })}
              className={inputClass}
            />
          </label>
        </div>
        <p className="-mt-1 text-xs text-ink/60">
          Recent roles get full detail; earlier ones are condensed; older ones are left out. 0 earlier years means
          no Earlier Experience section.
        </p>
        <div className="grid grid-cols-2 gap-3 text-sm">
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
      </fieldset>
      <fieldset className={groupClass}>
        <legend className="text-sm font-semibold text-primary">PDF</legend>
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
        </div>
      </fieldset>
    </section>
  );
}
