/** Typed calls to the backend data routes. Session cookie is sent automatically (same origin). */

export type Style = "professional" | "modern" | "classic";

export type Preferences = {
  style: Style;
  tone: string;
  max_pages: number;
  notes: string;
  include_phone: boolean;
  professional_years: number;
  earlier_years: number;
};

export type Baseline = { content_md: string | null; updated_at: string | null };

export type HistoryEntry = { id: number; company: string; style: Style; downloaded_at: string };

export type NewHistoryEntry = {
  company: string;
  job_description: string;
  content_md: string;
  style: Style;
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

export const pdfUrl = (id: number) => `/api/history/${id}/pdf`;

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

export type GenerateRequest = { job_description: string; message: string; history: ChatMessage[] };

export type GenerateResult = { reply: string; company: string | null; resume_md: string | null };

export const generate = (req: GenerateRequest) => request<GenerateResult>("POST", "/api/generate", req);
