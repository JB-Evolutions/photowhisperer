import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // Stripe webhooks use signature-based auth — bypass JWT check entirely.
  if (request.nextUrl.pathname.startsWith("/api/webhooks/")) {
    return NextResponse.next();
  }

  // Dev-only login route mints the session itself, so it can't require one
  // to be reached. The route's own NODE_ENV/ALLOW_TEST_LOGIN guard is the
  // real gate; this bypass is a no-op (404) whenever that guard is off.
  if (request.nextUrl.pathname === "/api/test-login") {
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

  // Return the supabase-mutated response so refreshed cookies reach the client.
  return supabaseResponse;
}

export const config = {
  matcher: ["/api/:path*"],
};
