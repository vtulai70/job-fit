import { UserButton } from "@clerk/react";

import { type PlanInfo, planName } from "@/lib/api";

import HealthIndicator from "./HealthIndicator";

type Props = { plan: PlanInfo | null; onPlans: () => void };

/** Top bar with the app name, API health, this month's usage and plan with a Plans button (once the plan loads),
 * and the Clerk user menu (profile, billing, sign out). */
export default function Header({ plan, onPlans }: Props) {
  return (
    <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-3">
      <h1 className="text-xl font-semibold text-primary">JobFit</h1>
      <div className="flex items-center gap-4 text-sm">
        <HealthIndicator />
        {plan && (
          <>
            <span className="text-ink/60">
              {plan.used} of {plan.limit} resumes this month · {planName(plan.plan)} plan
            </span>
            <button
              onClick={onPlans}
              className="rounded border border-line px-3 py-1 font-semibold text-primary hover:border-primary"
            >
              Plans
            </button>
          </>
        )}
        <UserButton />
      </div>
    </header>
  );
}
