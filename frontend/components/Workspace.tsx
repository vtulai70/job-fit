"use client";

import { useEffect, useRef, useState } from "react";

import * as api from "@/lib/api";

import ChatSidebar from "./ChatSidebar";
import CustomResume, { type CustomResumeData } from "./CustomResume";
import HistoryPanel from "./HistoryPanel";
import JobDescription from "./JobDescription";
import PreferencesPanel from "./PreferencesPanel";
import ResumePanel from "./ResumePanel";

export const GENERATE_MESSAGE = "Please generate my custom resume for this job description.";
export const CLEAR_FAILED = "Could not clear the download history. Please try again.";
const UNKNOWN_COMPANY = "Unknown company";

/** Chat note naming the settings the next prompt is generated with, one per line; Notes only when set.
 * In Pro mode the model is marked as the judge and the Pro models are listed. */
export function settingsNote(prefs: api.Preferences): string {
  const lines = [
    prefs.pro_mode ? `Model: ${prefs.model} (chat and judge)` : `Model: ${prefs.model}`,
    `Optimization level: ${api.optimizationLabel(prefs.optimization)}`,
    `Tone: ${api.toneLabel(prefs.tone)}`,
  ];
  if (prefs.notes.trim()) lines.push(`Notes: ${prefs.notes.trim()}`);
  if (prefs.pro_mode) lines.push(`Pro models: ${prefs.pro_models.join(", ")}`);
  return lines.join("\n");
}

/** Chat busy text; in Pro mode it says the turn may take longer. */
export function busyText(prefs: api.Preferences | null): string {
  if (!prefs?.pro_mode) return "Thinking...";
  return `Thinking... If the resume is ready, ${prefs.pro_models.length} models write it and ${prefs.model} ranks them; this can take a few minutes.`;
}

/** The generated resume versions (one, or each Pro candidate best first), the one shown, and the Pro verdict. */
export type Generated = {
  versions: CustomResumeData[];
  selected: number;
  pro: Pick<api.ProResult, "rationale" | "judge_model"> | null;
};

/** Chat note for a Pro model that returned no valid resume. */
export function failureNote({ model, reason }: api.ProFailure): string {
  return `${model} did not return a valid resume (${reason}), so it was left out.`;
}

/** The versions a generate result with a resume brings: Pro candidates carry their own model and review. */
export function generatedFrom(result: api.GenerateResult): Generated {
  const settings = api.generationSettings(result);
  if (!result.pro) {
    return {
      versions: [{ company: result.company ?? UNKNOWN_COMPANY, content_md: result.resume_md!, settings }],
      selected: 0,
      pro: null,
    };
  }
  const { candidates, rationale, judge_model } = result.pro;
  return {
    versions: candidates.map(({ model, company, resume_md, ...review }) => ({
      company: company ?? UNKNOWN_COMPANY,
      content_md: resume_md,
      settings: { ...settings, model },
      review,
    })),
    selected: 0,
    pro: { rationale, judge_model },
  };
}

/** The Pro fields of a download: the judge and rank (1 = best) when the candidates were judged. */
function proFields({ pro, selected }: Generated): Partial<api.ProFields> {
  if (!pro) return {};
  return { pro_judge_model: pro.judge_model, pro_rank: pro.judge_model ? selected + 1 : null };
}

/** Signed-in workspace: loads and saves the user's data and runs the AI chat (after pending preference saves). */
export default function Workspace() {
  /** undefined while loading, so the baseline panel can start collapsed when one is saved. */
  const [baseline, setBaseline] = useState<string | null | undefined>(undefined);
  const [jobDescription, setJobDescription] = useState("");
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [history, setHistory] = useState<api.HistoryEntry[]>([]);
  const [prefs, setPrefs] = useState<api.Preferences | null>(null);
  const [messages, setMessages] = useState<api.ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const prefsSaved = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    api.getBaseline().then((b) => setBaseline(b.content_md));
    api.listHistory().then(setHistory);
    api.getPreferences().then(setPrefs);
  }, []);

  async function uploadBaseline(content: string) {
    setBaseline((await api.putBaseline(content)).content_md);
  }

  /** Delete the history on the server, then empty the list; on failure keep it and say so. */
  async function clearHistory() {
    try {
      await api.clearHistory();
      setHistory([]);
    } catch {
      window.alert(CLEAR_FAILED);
    }
  }

  /** Save each change in order; a failed save does not block later ones. */
  function savePreferences(next: api.Preferences) {
    setPrefs(next);
    prefsSaved.current = prefsSaved.current.catch(() => {}).then(() => api.putPreferences(next));
  }

  /** Show the model and settings that will be used, then send the message with the AI conversation so far. */
  async function send(text: string) {
    const sent: api.ChatEntry[] = [
      ...messages,
      { role: "info", content: settingsNote(prefs!) },
      { role: "user", content: text },
    ];
    const history = messages.filter((m): m is api.ChatMessage => m.role !== "info");
    setMessages(sent);
    setBusy(true);
    try {
      await prefsSaved.current;
      const result = await api.generate({ job_description: jobDescription, message: text, history });
      const failures = (result.pro?.failed ?? []).map((f): api.ChatEntry => ({ role: "info", content: failureNote(f) }));
      setMessages([...sent, ...failures, { role: "assistant", content: result.reply }]);
      if (result.resume_md) setGenerated(generatedFrom(result));
    } catch {
      setMessages([...sent, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  const customResume = generated && generated.versions[generated.selected];

  /** Edit the shown version; each Pro candidate keeps its own edits. */
  function editCustomResume(content_md: string) {
    setGenerated((current) => ({
      ...current!,
      versions: current!.versions.map((v, i) => (i === current!.selected ? { ...v, content_md } : v)),
    }));
  }

  async function downloadCustomResume() {
    const entry = await api.downloadCustomResume({
      company: customResume!.company,
      job_description: jobDescription,
      content_md: customResume!.content_md,
      style: prefs!.style,
      ...customResume!.settings,
      ...proFields(generated!),
    });
    setHistory([entry, ...history]);
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
        {baseline !== undefined && <ResumePanel content={baseline} onUpload={uploadBaseline} />}
        <JobDescription value={jobDescription} onChange={setJobDescription} />
        <CustomResume
          resume={customResume}
          pro={
            generated?.pro && {
              versions: generated.versions,
              selected: generated.selected,
              rationale: generated.pro.rationale,
              judgeModel: generated.pro.judge_model,
              onSelect: (selected) => setGenerated({ ...generated, selected }),
            }
          }
          style={prefs?.style ?? "professional"}
          renderPreview={api.previewHtml}
          onChange={editCustomResume}
          onStyleChange={(style) => savePreferences({ ...prefs!, style })}
          onDownload={downloadCustomResume}
        />
        <HistoryPanel entries={history} onClear={clearHistory} />
        {prefs && <PreferencesPanel prefs={prefs} onChange={savePreferences} />}
      </main>
      <ChatSidebar
        messages={messages}
        busy={busy}
        busyText={busyText(prefs)}
        ready={prefs !== null}
        canGenerate={Boolean(baseline && jobDescription.trim())}
        onSend={send}
        onGenerate={() => send(GENERATE_MESSAGE)}
      />
    </div>
  );
}
