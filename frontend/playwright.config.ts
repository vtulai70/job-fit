import path from "node:path";

import { defineConfig } from "@playwright/test";

process.loadEnvFile(path.join(__dirname, "..", ".env"));
process.env.CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const PORT = 8001;

/**
 * E2E tests build the image and run a throwaway container on port 8001 with no volume,
 * so each run starts with an empty database and never touches data/jobfit.db.
 * The setup project prepares Clerk testing tokens and the two test users.
 */
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    { name: "e2e", testIgnore: /global\.setup\.ts/, dependencies: ["setup"] },
  ],
  webServer: {
    command: [
      "docker rm -f jobfit-e2e >/dev/null 2>&1;",
      "docker build -q --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY -t jobfit .. &&",
      `docker run --rm --name jobfit-e2e --env-file ../.env -e CLERK_AUTHORIZED_PARTIES=http://localhost:${PORT}`,
      `-p ${PORT}:8000 jobfit`,
    ].join(" "),
    url: `http://localhost:${PORT}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
