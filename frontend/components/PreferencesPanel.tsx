"use client";

import { useState } from "react";

import {
  MODELS,
  type Model,
  OPTIMIZATION_LEVELS,
  type Optimization,
  PRO_MAX_MODELS,
  PRO_MIN_MODELS,
  type Preferences,
  PREMIUM_MODELS,
} from "@/lib/api";

import PanelTitle from "./PanelTitle";

/** features: the plan's features; premium models and Pro mode are locked without them. */
type Props = { prefs: Preferences; features: string[]; onChange: (prefs: Preferences) => void };

const inputClass =
  "w-full rounded border border-line bg-canvas p-2 text-sm focus:border-primary focus:outline-none";

const groupClass = "flex flex-col gap-3 border-t border-line pt-3";

type ProProps = { prefs: Preferences; features: string[]; update: (change: Partial<Preferences>) => void };

/** A premium model on a plan without premium_models. */
const premiumLocked = (model: Model, features: string[]) =>
  PREMIUM_MODELS.includes(model) && !features.includes("premium_models");

/** The Pro models without the AI model (which judges them), topped up to the minimum in `MODELS` order. */
export function proModelsWithout(model: Model, proModels: Model[]): Model[] {
  const kept = proModels.filter((m) => m !== model);
  const extra = MODELS.filter((m) => m !== model && !kept.includes(m)).slice(0, Math.max(0, PRO_MIN_MODELS - kept.length));
  return MODELS.filter((m) => kept.includes(m) || extra.includes(m));
}

/** Pro mode switch, then (when on) the candidate models. The AI model judges them, so the controls only allow
 * valid choices: 2 to 4 candidates, never the AI model. Without the plan feature, Pro mode and premium models
 * can be turned off but not on. */
function ProModeFields({ prefs, features, update }: ProProps) {
  const count = prefs.pro_models.length;
  const proLocked = !features.includes("pro_mode");

  function toggle(model: Model, checked: boolean) {
    update({ pro_models: MODELS.filter((m) => (m === model ? checked : prefs.pro_models.includes(m))) });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={prefs.pro_mode}
            disabled={proLocked && !prefs.pro_mode}
            onChange={(e) =>
              update({ pro_mode: e.target.checked, pro_models: proModelsWithout(prefs.model, prefs.pro_models) })
            }
            aria-describedby="pro-mode-description"
            className="h-4 w-4 accent-primary disabled:opacity-40"
          />
          Pro mode
        </label>
        {proLocked && <span className="text-xs text-accent">Pro plan</span>}
      </div>
      <p id="pro-mode-description" className="-mt-2 text-xs text-ink/60">
        The AI model above handles the chat. When it is ready to write the resume, the Pro models each write one and
        the AI model judges and ranks them. Takes longer and costs more.
      </p>
      {prefs.pro_mode && (
        <fieldset className="text-sm">
          <legend>
            Pro models ({PRO_MIN_MODELS}-{PRO_MAX_MODELS})
          </legend>
          {MODELS.map((model) => {
            const checked = prefs.pro_models.includes(model);
            const premium = premiumLocked(model, features);
            const locked =
              model === prefs.model ||
              (premium && !checked) ||
              (checked ? count <= PRO_MIN_MODELS : count >= PRO_MAX_MODELS);
            return (
              <label key={model} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={(e) => toggle(model, e.target.checked)}
                  className="h-4 w-4 accent-primary disabled:opacity-40"
                />
                {model}
                {model === prefs.model && " (AI model, judges)"}
                {premium && " (Pro plan)"}
              </label>
            );
          })}
        </fieldset>
      )}
    </>
  );
}

/** The resume generation preferences (PDF style is set in the Custom resume panel). Controlled: every change
 * reports the full preferences to be saved. Starts expanded. */
export default function PreferencesPanel({ prefs, features, onChange }: Props) {
  const [open, setOpen] = useState(true);

  function update(change: Partial<Preferences>) {
    onChange({ ...prefs, ...change });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <PanelTitle title="Preferences" open={open} onToggle={() => setOpen(!open)} />
      {open && (
        <div className={groupClass}>
          <label className="text-sm">
            AI model
            <select
              value={prefs.model}
              onChange={(e) => update({ model: e.target.value as Model })}
              className={inputClass}
            >
              {MODELS.filter((model) => !prefs.pro_mode || !prefs.pro_models.includes(model)).map((model) => (
                <option key={model} value={model} disabled={premiumLocked(model, features) && model !== prefs.model}>
                  {model}
                  {premiumLocked(model, features) && " (Pro plan)"}
                </option>
              ))}
            </select>
          </label>
          <ProModeFields prefs={prefs} features={features} update={update} />
          <label className="text-sm">
            Optimization level
            <select
              value={prefs.optimization}
              onChange={(e) => update({ optimization: e.target.value as Optimization })}
              aria-describedby="optimization-description"
              className={inputClass}
            >
              {OPTIMIZATION_LEVELS.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label} - {level.summary}
                </option>
              ))}
            </select>
          </label>
          <p id="optimization-description" className="-mt-1 text-xs text-ink/60">
            {OPTIMIZATION_LEVELS.find((level) => level.value === prefs.optimization)!.description}
          </p>
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
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.include_phone}
                onChange={(e) => update({ include_phone: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              Include phone number in generated resume
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.include_graduation_year}
                onChange={(e) => update({ include_graduation_year: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              Include university graduation year in generated resume
            </label>
          </div>
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
        </div>
      )}
    </section>
  );
}
