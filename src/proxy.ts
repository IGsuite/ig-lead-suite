import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeSession, isAuthRequired } from "@/lib/auth";

/** Verify signatures before routing; handlers also verify account status. */
const SESSION_COOKIE = "sd_session";

/**
 * Public without a session cookie.
 * Webhooks (Telnyx / Smartlead) MUST stay here — providers cannot log in.
 */
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/webhooks/",
  "/api/cron/dispatch",
  "/api/queues/dispatch",
  "/sms/abstract",
  "/api/sms/subscribe",
  // No secrets echoed — used by Go live checklist / ops probes

];

function isPublic(pathname: string): boolean {
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon"))
    return true;
  return PUBLIC_PATHS.some(
    (p) => pathname === p || (p.endsWith("/") && pathname.startsWith(p)),
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  if (isAuthRequired() && !decodeSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
