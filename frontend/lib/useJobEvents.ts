"use client";

import { useEffect, useState } from "react";
import { eventsUrl, type JobState } from "@/lib/api";
import { isMultiTenant } from "@/lib/hosted";
import { useAccessToken } from "@/lib/useAccessToken";

/** Subscribe to a job's SSE event stream and return the latest state. */
export function useJobEvents(jobId: string | null, enabled: boolean = true) {
  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accessToken = useAccessToken();

  useEffect(() => {
    if (!jobId || !enabled) return;
    if (isMultiTenant() && !accessToken) return;

    const es = new EventSource(eventsUrl(jobId, accessToken));
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as JobState;
        setJob(data);
        setError(null);
      } catch {
        /* ignore ping comments */
      }
    };
    es.onerror = () => {
      setError("Conexão perdida com o backend");
    };

    return () => es.close();
  }, [jobId, enabled, accessToken]);

  return { job, error };
}
