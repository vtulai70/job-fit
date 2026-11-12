import { UserButton } from "@clerk/react";

import HealthIndicator from "./HealthIndicator";

/** Top bar with the app name, API health and the Clerk user menu (profile, sign out). */
export default function Header() {
  return (
    <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-3">
      <h1 className="text-xl font-semibold text-primary">JobFit</h1>
      <div className="flex items-center gap-4 text-sm">
        <HealthIndicator />
        <UserButton />
      </div>
    </header>
  );
}
