import { vi } from "vitest";

type Route = { status?: number; body?: unknown };

/** Stub global fetch with responses keyed by "METHOD /path"; returns the mock. */
export function mockFetch(routes: Record<string, Route>) {
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    const route = routes[`${init?.method ?? "GET"} ${url}`];
    if (!route) return new Promise<Response>(() => {});
    return Response.json(route.body ?? {}, { status: route.status ?? 200 });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
