import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PROTECTED = ["/", "/editor", "/cortes", "/configuracoes", "/render", "/aulas", "/admin"];
const AUTH_PAGES = ["/login", "/signup", "/auth/callback", "/login/esqueci-senha"];
const AUTH_PAGES_ALLOW_LOGGED_IN = ["/auth/atualizar-senha"];

export async function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_MULTI_TENANT !== "true") {
    return NextResponse.next();
  }

  // Public checkout pages — skip auth checks
  const p = request.nextUrl.pathname;
  if (p.startsWith("/checkout") || p.startsWith("/comprar")) {
    return NextResponse.next();
  }

  const response = await updateSession(request);
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
  const isAuthPage = AUTH_PAGES.some((p) => path.startsWith(p));
  const allowLoggedInOnAuth = AUTH_PAGES_ALLOW_LOGGED_IN.some((p) => path.startsWith(p));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return response;
  }

  const { createServerClient } = await import("@supabase/ssr");
  const supabase = createServerClient(url, key, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set() {},
      remove() {},
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtected && !user && !path.startsWith("/plano-inativo")) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }

  if (isAuthPage && user && !allowLoggedInOnAuth && path !== "/auth/callback") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|woff2?)$).*)",
  ],
};
