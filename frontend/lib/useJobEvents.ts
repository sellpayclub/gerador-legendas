"use client";

import { useEffect, useState } from "react";
import { eventsUrl, type JobState } from "@/lib/api";

/** Subscribe to a job's SSE event stream and return the latest state. */
export function useJobEvents(jobId: string | null, enabled: boolean = true) {
  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId || !enabled) return;
    const es = new EventSource(eventsUrl(jobId));
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as JobState;
        setJob(data);
      } catch {
        /* ignore ping comments */
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects; only show error if we never got data
      setError("Conexão perdida com o backend");
    };
    return () => es.close();
  }, [jobId, enabled]);

  return { job, error };
}
