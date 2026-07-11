import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isWithinGracePeriod } from "@/lib/account-deletion";

// Exact byte hash of the FOUC script in layout.tsx (src/app/layout.tsx).
// Kept as an extra script-src source alongside the nonce so a nonce-plumbing
// bug can't silently break theme init. Regenerate (base64-sha256 of the exact
// script body) if that string is ever edited.
const FOUC_SCRIPT_HASH = "sha256-C+ErKw40+TeXwVFXHdQMcQ9MSPY91QRKo8heDY0mV1A=";

// ENFORCING: report-only pass came back clean across landing, /app, /auth,
// /account, and /account/billing — violations are now blocked, not just logged.
const CSP_HEADER_NAME = "Content-Security-Policy";

function buildCsp(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' '${FOUC_SCRIPT_HASH}'`,
    "style-src 'self'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Every request headers object built below carries x-nonce (for layout.tsx
  // to read) and the CSP itself (for Next's internal renderer to auto-nonce
  // its own bootstrap/RSC scripts) — reused on every NextResponse.next() call
  // so a future edit to one branch can't silently drop the nonce.
  //
  // Next's auto-nonce detection only looks for the enforcing header name on
  // the REQUEST, regardless of what the browser is actually sent — so this
  // always uses "Content-Security-Policy" here even while CSP_HEADER_NAME
  // (below, response-side only) is still the Report-Only variant.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // Every return path funnels through here so the response-side CSP header
  // (the one the browser actually enforces/reports) can never be skipped on
  // a branch.
  function finish(response: NextResponse) {
    response.headers.set(CSP_HEADER_NAME, csp);
    return response;
  }

  // Stripe webhooks use signature-based auth — bypass JWT check entirely.
  if (pathname.startsWith("/api/webhooks/")) {
    return finish(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_TEST_LOGIN === "true" &&
    pathname === "/api/test-login"
  ) {
    return finish(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // Unchanged gating from the original matcher: marketing pages, /auth/*,
  // /billing/success|cancel etc. never touch Supabase here — same as before,
  // just now reached via a widened matcher instead of being unmatched.
  const isAuthGated =
    pathname.startsWith("/api/") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/app") ||
    pathname.startsWith("/account");

  if (!isAuthGated) {
    return finish(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // Build a mutable response so refreshed auth cookies can be forwarded.
  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write onto the request so subsequent proxy sees them.
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set({ name, value, ...options })
          );
          // Rebuild the response so the cookie mutations are included.
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() is the authoritative check — never trust getSession() alone.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith("/api/")) {
      const unauthorized = NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
      // Preserve any refreshed auth cookies even on the 401 path.
      supabaseResponse.cookies.getAll().forEach(({ name, value, ...options }) =>
        unauthorized.cookies.set(name, value, options)
      );
      return finish(unauthorized);
    }
    return finish(NextResponse.redirect(new URL("/auth/signin", request.url)));
  }

  // Soft-delete gate — /app/* and /account/* only. API routes return 401 via
  // their own getUser() checks; redirecting them to /account/restore would
  // break the client's fetch error handling.
  if (pathname.startsWith("/app") || pathname.startsWith("/account")) {
    const { data: profile } = await supabase
      .from("users")
      .select("deleted_at")
      .eq("user_id", user.id)
      .maybeSingle();

    const deletedAt =
      (profile as { deleted_at: string | null } | null)?.deleted_at ?? null;

    if (deletedAt) {
      if (isWithinGracePeriod(deletedAt)) {
        // /account/restore must be reachable — it IS the recovery page.
        // Redirecting here unconditionally would loop: restore → proxy →
        // within grace → redirect restore → proxy → ... indefinitely.
        if (pathname !== "/account/restore") {
          return finish(redirectTo("/account/restore", request, supabaseResponse));
        }
      } else {
        // Past 7-day grace: revoke session + permanent block.
        await supabase.auth.signOut();
        return finish(
          redirectTo("/auth/signin?account=expired", request, supabaseResponse)
        );
      }
    }
  }

  // Return the supabase-mutated response so refreshed cookies reach the client.
  return finish(supabaseResponse);
}

// Copies refreshed/cleared auth cookies from supabaseResponse into the redirect
// so the browser always receives the current cookie state on every branch.
function redirectTo(
  destination: string,
  request: NextRequest,
  supabaseResponse: NextResponse
): NextResponse {
  const dest = new URL(destination, request.nextUrl.origin);
  const url = request.nextUrl.clone();
  url.pathname = dest.pathname;
  url.search = dest.search;
  const res = NextResponse.redirect(url);
  supabaseResponse.cookies.getAll().forEach(({ name, value, ...options }) => {
    res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2]);
  });
  return res;
}

// Skip the Next.js static-asset pipeline and public/ files — CSP/nonce
// overhead on those is pure waste, they're not HTML documents.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png)$).*)"],
};
