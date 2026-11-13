import { expect, test, vi } from "vitest";

import * as api from "@/lib/api";

import { mockFetch } from "./fetchMock";

const ENTRY = {
  company: "Acme",
  job_description: "JD",
  content_md: "# R",
  style: "modern" as const,
  model: "openai/gpt-6-sol" as const,
};

test("getBaseline returns the saved baseline", async () => {
  mockFetch({ "GET /api/resume/baseline": { body: { content_md: "# Me", updated_at: "t" } } });
  expect(await api.getBaseline()).toEqual({ content_md: "# Me", updated_at: "t" });
});

test("putBaseline sends JSON content", async () => {
  const fetchMock = mockFetch({ "PUT /api/resume/baseline": { body: { content_md: "# Me", updated_at: "t" } } });
  await api.putBaseline("# Me");
  const [, init] = fetchMock.mock.calls[0];
  expect(init!.headers).toEqual({ "Content-Type": "application/json" });
  expect(JSON.parse(init!.body as string)).toEqual({ content_md: "# Me" });
});

test("errors are thrown with status", async () => {
  mockFetch({ "GET /api/preferences": { status: 401 } });
  await expect(api.getPreferences()).rejects.toThrow("GET /api/preferences failed: 401");
});

test("pdfUrl builds the history PDF path", () => {
  expect(api.pdfUrl(7)).toBe("/api/history/7/pdf");
});

test("downloadCustomResume records history then downloads its PDF", async () => {
  const fetchMock = mockFetch({
    "POST /api/history": { body: { id: 7, company: "Acme", style: "modern", downloaded_at: "t" } },
  });
  const assign = vi.fn();
  vi.stubGlobal("location", { assign });

  const saved = await api.downloadCustomResume(ENTRY);

  expect(saved.id).toBe(7);
  expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual(ENTRY);
  expect(assign).toHaveBeenCalledWith("/api/history/7/pdf");
});

test("downloadCustomResume does not download if recording fails", async () => {
  mockFetch({ "POST /api/history": { status: 500 } });
  const assign = vi.fn();
  vi.stubGlobal("location", { assign });
  await expect(api.downloadCustomResume(ENTRY)).rejects.toThrow();
  expect(assign).not.toHaveBeenCalled();
});

test("clearHistory sends DELETE /api/history", async () => {
  const fetchMock = mockFetch({ "DELETE /api/history": { status: 204 } });
  await api.clearHistory();
  expect(fetchMock).toHaveBeenCalledWith("/api/history", { method: "DELETE" });
});

test("clearHistory throws when the server fails", async () => {
  mockFetch({ "DELETE /api/history": { status: 500 } });
  await expect(api.clearHistory()).rejects.toThrow("DELETE /api/history failed: 500");
});
