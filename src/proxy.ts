import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isWithinGracePeriod } from "@/lib/account-deletion";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Stripe webhooks use signature-based auth — bypass JWT check entirely.
  if (pathname.startsWith("/api/webhooks/")) {
    return NextResponse.next();
  }

  // Dev-only login route mints the session itself, so it can't require one
  // to be reached. The route's own NODE_ENV/ALLOW_TEST_LOGIN guard is the
  // real gate; this bypass is a no-op (404) whenever that guard is off.
  if (pathname === "/api/test-login") {
    return NextResponse.next();
  }

  // Build a mutable response so refreshed auth cookies can be forwarded.
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
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
      return unauthorized;
    }
    return NextResponse.redirect(new URL("/auth/signin", request.url));
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
          return redirectTo("/account/restore", request, supabaseResponse);
        }
      } else {
        // Past 7-day grace: revoke session + permanent block.
        await supabase.auth.signOut();
        return redirectTo("/auth/signin?account=expired", request, supabaseResponse);
      }
    }
  }

  // Return the supabase-mutated response so refreshed cookies reach the client.
  return supabaseResponse;
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

export const config = {
  matcher: ["/api/:path*", "/onboarding/:path*", "/app/:path*", "/account/:path*"],
};
