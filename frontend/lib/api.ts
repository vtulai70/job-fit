/** Typed calls to the backend data routes. Session cookie is sent automatically (same origin). */

export type Style = "professional" | "modern" | "classic";

/** Models the user can pick; the backend validates against the same list. First is the default. */
export const MODELS = [
  "openai/gpt-oss-120b",
  "anthropic/claude-opus-5.5",
  "anthropic/claude-haiku-5.5",
  "anthropic/claude-sonnet-5.5",
  "openai/gpt-6-sol",
  "openai/gpt-5.4-nano",
  "~google/gemini-pro-latest",
] as const;

export type Model = (typeof MODELS)[number];

/** How much the AI changes the resume; values match `Optimization` in the backend. */
export const OPTIMIZATION_LEVELS = [
  {
    value: "light",
    label: "Light polish",
    description: "Adds the skills and requirements to the resume and keeps the original context intact.",
  },
  {
    value: "smart",
    label: "Smart integration",
    description: "Naturally integrates the skills and requirements into the work history to make a stronger impression.",
  },
  {
    value: "full",
    label: "Full tailoring",
    description: "Fully rewrites and reprioritizes the content to match exactly what the employer is looking for.",
  },
] as const;

export type Optimization = (typeof OPTIMIZATION_LEVELS)[number]["value"];

/** Display name of an optimization level, e.g. "Smart integration". */
export const optimizationLabel = (value: Optimization) => OPTIMIZATION_LEVELS.find((l) => l.value === value)!.label;

export type Preferences = {
  style: Style;
  tone: string;
  max_pages: number;
  notes: string;
  include_phone: boolean;
  include_graduation_year: boolean;
  professional_years: number;
  earlier_years: number;
  model: Model;
  optimization: Optimization;
};

export type Baseline = { content_md: string | null; updated_at: string | null };

/** `model` and `optimization` are null for downloads saved before they were recorded. */
export type HistoryEntry = {
  id: number;
  company: string;
  style: Style;
  downloaded_at: string;
  model: Model | null;
  optimization: Optimization | null;
};

export type NewHistoryEntry = {
  company: string;
  job_description: string;
  content_md: string;
  style: Style;
  model: Model;
  optimization: Optimization;
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status}`);
  return response.json();
}

export const getBaseline = () => request<Baseline>("GET", "/api/resume/baseline");

export const putBaseline = (content_md: string) =>
  request<Baseline>("PUT", "/api/resume/baseline", { content_md });

export const getPreferences = () => request<Preferences>("GET", "/api/preferences");

export const putPreferences = (prefs: Preferences) =>
  request<Preferences>("PUT", "/api/preferences", prefs);

export const listHistory = () => request<HistoryEntry[]>("GET", "/api/history");

export const addHistory = (entry: NewHistoryEntry) =>
  request<HistoryEntry>("POST", "/api/history", entry);

/** Delete all of the user's download history (the server answers 204, no body). */
export async function clearHistory() {
  const response = await fetch("/api/history", { method: "DELETE" });
  if (!response.ok) throw new Error(`DELETE /api/history failed: ${response.status}`);
}

export const pdfUrl = (id: number) => `/api/history/${id}/pdf`;

/** The HTML the PDF would be rendered from, in the given style. */
export const previewHtml = async (content_md: string, style: Style) =>
  (await request<{ html: string }>("POST", "/api/preview", { content_md, style })).html;

/** Trigger a browser download; the server responds with Content-Disposition: attachment. */
export function downloadFile(url: string) {
  window.location.assign(url);
}

/** Record a download in history, then download its PDF. Returns the new entry. */
export async function downloadCustomResume(entry: NewHistoryEntry): Promise<HistoryEntry> {
  const saved = await addHistory(entry);
  downloadFile(pdfUrl(saved.id));
  return saved;
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** A chat line shown in the sidebar; "info" lines are UI notes and are never sent to the AI. */
export type ChatEntry = ChatMessage | { role: "info"; content: string };

export type GenerateRequest = { job_description: string; message: string; history: ChatMessage[] };

/** `model` and `optimization` are the saved settings the backend generated with. */
export type GenerateResult = {
  reply: string;
  company: string | null;
  resume_md: string | null;
  model: Model;
  optimization: Optimization;
};

export const generate = (req: GenerateRequest) => request<GenerateResult>("POST", "/api/generate", req);
