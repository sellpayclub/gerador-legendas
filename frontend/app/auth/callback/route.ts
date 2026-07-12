import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Validate that `next` is a safe internal redirect (no open redirect). */
function isSafeRedirect(next: string): boolean {
  return next.startsWith("/") && !next.startsWith("//");
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/";
  const next = isSafeRedirect(rawNext) ? rawNext : "/";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
