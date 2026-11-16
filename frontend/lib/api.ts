/** Typed calls to the backend data routes. Session cookie is sent automatically (same origin). */

/** PDF styles, as `Style` in the backend; the first is the default. */
export const STYLES = ["professional", "modern", "classic"] as const;

export type Style = (typeof STYLES)[number];

/** Models the user can pick; the backend validates against the same list. First is the default. */
export const MODELS = [
  "openai/gpt-oss-120b",
  "anthropic/claude-opus-5.5",
  "anthropic/claude-haiku-5.5",
  "anthropic/claude-sonnet-5.5",
  "openai/gpt-6-sol",
  "openai/gpt-5.4-nano",
  "google/gemini-3.8-flash",
  "google/gemini-4-argon",
] as const;

export type Model = (typeof MODELS)[number];

/** Pro mode needs 2 to 4 candidate models (the backend validates the same limits). */
export const PRO_MIN_MODELS = 2;
export const PRO_MAX_MODELS = 4;

/** How much the AI changes the resume; values match `Optimization` in the backend. `summary` follows the label in the
 * drop-down; `description` is shown under it for the chosen level. */
export const OPTIMIZATION_LEVELS = [
  {
    value: "light",
    label: "Light polish",
    summary: "adds the job's skills, keeps your wording",
    description: "Adds the skills and requirements to the resume and keeps the original context intact.",
  },
  {
    value: "smart",
    label: "Smart integration",
    summary: "weaves the job's skills into your work history",
    description: "Naturally integrates the skills and requirements into the work history to make a stronger impression.",
  },
  {
    value: "full",
    label: "Full tailoring",
    summary: "rewrites and reorders the content for the job",
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
  pro_mode: boolean;
  /** Candidate models in Pro mode; `model` judges them, so in Pro mode it is never one of them. */
  pro_models: Model[];
};

export type Baseline = { content_md: string | null; updated_at: string | null };

/** The preferences that shape a generated resume; /api/generate returns them and each download saves them.
 * Keep in sync with `GenerationSettings` in `backend/app/routes/preferences.py`. */
export const GENERATION_KEYS = [
  "model",
  "optimization",
  "professional_years",
  "earlier_years",
  "max_pages",
  "tone",
  "notes",
] as const;

export type GenerationSettings = Pick<Preferences, (typeof GENERATION_KEYS)[number]>;

/** Just the generation settings of a larger object, e.g. a generate result. */
export const generationSettings = (source: GenerationSettings) =>
  Object.fromEntries(GENERATION_KEYS.map((key) => [key, source[key]])) as GenerationSettings;

/** Tone as shown to the user: "no preference" when empty. */
export const toneLabel = (tone: string) => tone.trim() || "no preference";

/** Set when a download is a Pro candidate: the judge that ranked it and its rank (1 = best);
 * both null when it was the only candidate, so nothing was judged. */
export type ProFields = { pro_judge_model: Model | null; pro_rank: number | null };

/** A download; the generation settings are null for downloads saved before they were recorded,
 * the Pro fields for downloads that were not a judged Pro candidate. */
export type HistoryEntry = {
  id: number;
  company: string;
  style: Style;
  downloaded_at: string;
} & { [K in keyof GenerationSettings]: GenerationSettings[K] | null } & ProFields;

export type NewHistoryEntry = {
  company: string;
  job_description: string;
  content_md: string;
  style: Style;
} & GenerationSettings &
  Partial<ProFields>;

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

/** A resume a Pro model wrote, with the judge's review; score is null when nothing was compared. */
export type ProCandidate = {
  model: Model;
  company: string | null;
  resume_md: string;
  score: number | null;
  strengths: string;
  weaknesses: string;
  rule_violations: string[];
};

/** A Pro model that returned no valid resume, and why (e.g. "timed out after 300 s"). */
export type ProFailure = { model: Model; reason: string };

/** Pro candidates ranked best first (none when every Pro model failed); judge_model is null unless at least two
 * were compared; failed lists the Pro models that were left out. */
export type ProResult = { candidates: ProCandidate[]; rationale: string; judge_model: Model | null; failed: ProFailure[] };

/** The AI result plus the saved settings the backend generated with. `pro` is set when Pro mode wrote the
 * resume (`model` is then the chat model; each candidate names its own). */
export type GenerateResult = {
  reply: string;
  company: string | null;
  resume_md: string | null;
  pro: ProResult | null;
} & GenerationSettings;

export const generate = (req: GenerateRequest) => request<GenerateResult>("POST", "/api/generate", req);
