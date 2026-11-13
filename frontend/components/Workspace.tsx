"use client";

import { useEffect, useState } from "react";

import * as api from "@/lib/api";

import ChatSidebar from "./ChatSidebar";
import CustomResume, { type CustomResumeData } from "./CustomResume";
import HistoryPanel from "./HistoryPanel";
import JobDescription from "./JobDescription";
import PreferencesPanel from "./PreferencesPanel";
import ResumePanel from "./ResumePanel";

export const GENERATE_MESSAGE = "Please generate my custom resume for this job description.";

/** Signed-in workspace: loads and saves the user's data and runs the AI chat. */
export default function Workspace() {
  const [baseline, setBaseline] = useState<string | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [customResume, setCustomResume] = useState<CustomResumeData | null>(null);
  const [history, setHistory] = useState<api.HistoryEntry[]>([]);
  const [prefs, setPrefs] = useState<api.Preferences | null>(null);
  const [messages, setMessages] = useState<api.ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getBaseline().then((b) => setBaseline(b.content_md));
    api.listHistory().then(setHistory);
    api.getPreferences().then(setPrefs);
  }, []);

  async function uploadBaseline(content: string) {
    setBaseline((await api.putBaseline(content)).content_md);
  }

  async function savePreferences(next: api.Preferences) {
    setPrefs(await api.putPreferences(next));
  }

  /** Show which model will answer, then send the message with the AI conversation so far. */
  async function send(text: string) {
    const sent: api.ChatEntry[] = [
      ...messages,
      { role: "info", content: `Model: ${prefs!.model}` },
      { role: "user", content: text },
    ];
    const history = messages.filter((m): m is api.ChatMessage => m.role !== "info");
    setMessages(sent);
    setBusy(true);
    try {
      const result = await api.generate({ job_description: jobDescription, message: text, history });
      setMessages([...sent, { role: "assistant", content: result.reply }]);
      if (result.resume_md) {
        setCustomResume({ company: result.company ?? "Unknown company", content_md: result.resume_md });
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
    });
    setHistory([entry, ...history]);
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
        <ResumePanel content={baseline} onUpload={uploadBaseline} />
        <JobDescription value={jobDescription} onChange={setJobDescription} />
        <CustomResume resume={customResume} onChange={editCustomResume} onDownload={downloadCustomResume} />
        <HistoryPanel entries={history} />
        {prefs && <PreferencesPanel initial={prefs} onSave={savePreferences} />}
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
