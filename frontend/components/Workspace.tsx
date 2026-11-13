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

/** Chat note naming the settings the next prompt is generated with, one per line; Notes only when set. */
export function settingsNote(prefs: api.Preferences): string {
  const lines = [
    `Model: ${prefs.model}`,
    `Professional Experience: ${prefs.professional_years} years`,
    `Earlier Experience: ${prefs.earlier_years} years`,
    `Tone: ${prefs.tone.trim() || "no preference"}`,
  ];
  if (prefs.notes.trim()) lines.push(`Notes: ${prefs.notes.trim()}`);
  return lines.join("\n");
}

/** Signed-in workspace: loads and saves the user's data and runs the AI chat (after pending preference saves). */
export default function Workspace() {
  /** undefined while loading, so the baseline panel can start collapsed when one is saved. */
  const [baseline, setBaseline] = useState<string | null | undefined>(undefined);
  const [jobDescription, setJobDescription] = useState("");
  const [customResume, setCustomResume] = useState<CustomResumeData | null>(null);
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
      setMessages([...sent, { role: "assistant", content: result.reply }]);
      if (result.resume_md) {
        setCustomResume({ company: result.company ?? "Unknown company", content_md: result.resume_md, model: result.model });
      }
    } catch {
      setMessages([...sent, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  function editCustomResume(content_md: string) {
    setCustomResume((current) => ({ ...current!, content_md }));
  }

  async function downloadCustomResume() {
    const entry = await api.downloadCustomResume({
      company: customResume!.company,
      job_description: jobDescription,
      content_md: customResume!.content_md,
      style: prefs!.style,
      model: customResume!.model,
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
          style={prefs?.style ?? "professional"}
          renderPreview={api.previewHtml}
          onChange={editCustomResume}
          onDownload={downloadCustomResume}
        />
        <HistoryPanel entries={history} onClear={clearHistory} />
        {prefs && <PreferencesPanel initial={prefs} onChange={savePreferences} />}
      </main>
      <ChatSidebar
        messages={messages}
        busy={busy}
        ready={prefs !== null}
        canGenerate={Boolean(baseline && jobDescription.trim())}
        onSend={send}
        onGenerate={() => send(GENERATE_MESSAGE)}
      />
    </div>
  );
}
