"use client";

import { PricingTable } from "@clerk/react";

type Props = { onClose: () => void };

/** Clerk's pricing table in a dialog: subscribe, upgrade or downgrade there. The caller refreshes the plan on close. */
export default function PlansDialog({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-canvas/80 p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plans-heading"
        className="max-h-full w-full max-w-4xl overflow-y-auto rounded-lg border border-line bg-surface p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="plans-heading" className="text-lg font-semibold">
            Plans
          </h2>
          <button
            onClick={onClose}
            className="rounded border border-line px-3 py-1 text-sm hover:border-primary hover:text-primary"
          >
            Close
          </button>
        </div>
        <PricingTable for="user" />
        <p className="mt-4 text-xs text-ink/60">
          Manage or cancel your subscription under Billing in the account menu (top right).
        </p>
      </div>
    </div>
  );
}
