"use client";

import { useEffect, useState } from "react";

/** Shows the backend status reported by /api/health. */
export default function HealthIndicator() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setStatus(d.status))
      .catch(() => setStatus("offline"));
  }, []);

  return <span className="text-sm text-ink/70">API: {status}</span>;
}
