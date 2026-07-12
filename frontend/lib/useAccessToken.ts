"use client";

import { useEffect, useState } from "react";
import { createClient, getAccessToken } from "@/lib/supabase/client";
import { isMultiTenant } from "@/lib/hosted";

/** Survives remounts so &lt;video src&gt; does not flash empty on preview key changes. */
let cachedAccessToken: string | null = null;

/** Appends Supabase access_token to media URLs in hosted mode (for &lt;video src&gt;). */
export function useAccessToken(): string | null {
  const [token, setToken] = useState<string | null>(() =>
    isMultiTenant() ? cachedAccessToken : null,
  );
  useEffect(() => {
    if (!isMultiTenant()) return;
    let active = true;
    void getAccessToken().then((t) => {
      cachedAccessToken = t;
      if (active) setToken(t);
    });
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.access_token ?? null;
      cachedAccessToken = next;
      setToken(next);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  return token;
}
