"use client";

import { useAuth } from "@clerk/react";
import { useEffect, useState } from "react";

import * as api from "@/lib/api";

import Header from "./Header";
import PlansDialog from "./PlansDialog";
import Workspace from "./Workspace";

/** The signed-in app: the title bar (with the plan and Plans), the workspace and the Plans dialog.
 * Owns the plan (GET /api/plan): loaded on mount, after each generation and when the Plans dialog closes. */
export default function SignedIn() {
  const [plan, setPlan] = useState<api.PlanInfo | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const { getToken } = useAuth();

  useEffect(() => {
    api.getPlan().then(setPlan);
  }, []);

  function reloadPlan() {
    api.getPlan().then(setPlan);
  }

  /** After the pricing table closes: get a fresh session token (it carries the plan), then reload the plan. */
  async function closePlans() {
    setPlansOpen(false);
    await getToken({ skipCache: true });
    setPlan(await api.getPlan());
  }

  return (
    <div className="flex h-screen flex-col">
      <Header plan={plan} onPlans={() => setPlansOpen(true)} />
      <Workspace plan={plan} onUsageChanged={reloadPlan} />
      {plansOpen && <PlansDialog onClose={closePlans} />}
    </div>
  );
}
