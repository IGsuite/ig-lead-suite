import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Keep Edge-safe: only presence-check the cookie. Full HMAC verify happens in Node route handlers. */
const SESSION_COOKIE = "sd_session";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/webhooks/",
  "/api/providers/status",
];

function isPublic(pathname: string): boolean {
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon"))
    return true;
  return PUBLIC_PATHS.some(
    (p) => pathname === p || (p.endsWith("/") && pathname.startsWith(p)),
  );
}

function isAuthRequired(): boolean {
  const v = process.env.AUTH_REQUIRED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  if (isAuthRequired() && !request.cookies.get(SESSION_COOKIE)?.value) {
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
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
