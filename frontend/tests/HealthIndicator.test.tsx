import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import HealthIndicator from "@/components/HealthIndicator";

test("shows checking before the response arrives", () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  render(<HealthIndicator />);
  expect(screen.getByText("API: checking")).toBeInTheDocument();
});

test("shows the status from /api/health", async () => {
  const fetchMock = vi.fn(() => Promise.resolve(Response.json({ status: "ok" })));
  vi.stubGlobal("fetch", fetchMock);
  render(<HealthIndicator />);
  expect(await screen.findByText("API: ok")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/health");
});

test("shows offline when the request fails", async () => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("down"))));
  render(<HealthIndicator />);
  expect(await screen.findByText("API: offline")).toBeInTheDocument();
});
