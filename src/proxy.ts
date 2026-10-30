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
  // Approved campaign artwork must load in email clients without a CRM session.
  // Keep exact file paths; uploaded files and other CRM assets stay private.
  "/email-assets/abstract/heloc-business-v3.png",
  "/email-assets/abstract/sba-7a-v1.png",
  "/email-assets/abstract/sba-504-v1.png",
  "/email-assets/abstract/sba-express-v1.png",
  "/email-assets/abstract/business-line-of-credit-v1.png",
  "/email-assets/abstract/revenue-based-financing-v1.png",
  "/email-assets/abstract/term-loans-v1.png",
  "/email-assets/abstract/equipment-financing-v1.png",
  "/email-assets/abstract/invoice-factoring-v1.png",
  "/email-assets/abstract/small-business-loans-v1.png",
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/webhooks/",
  "/api/cron/dispatch",
  // These exact handlers enforce dedicated scheduler / integration credentials themselves.
  "/api/cron/seo",
  "/api/cron/connections",
  "/api/integrations/seo/events",
  "/api/queues/dispatch",
  "/api/queues/lead-imports",
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

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if(session?.role==="setup"&&!pathname.startsWith("/api/")&&!pathname.startsWith("/_next/")&&!["/company-setup","/alerts"].includes(pathname)){
    const url=request.nextUrl.clone();url.pathname="/company-setup";url.search="";return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
