import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// Dev-only: mints a real Supabase session cookie so protected routes behind
// proxy.ts can be exercised without a login UI. Disabled unless both the
// environment and an explicit opt-in flag allow it.
function isEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_TEST_LOGIN === "true"
  );
}

export async function POST(request: NextRequest) {
  if (!isEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { email, password } = (await request.json()) as {
    email?: string;
    password?: string;
  };

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value)
          );
        },
      },
    }
  );

  if (password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { error: error?.message ?? "Sign-in failed" },
        { status: 401 }
      );
    }

    return withCookies(response, data.user.id);
  }

  // Magic-link-style: admin-generate a link, then redeem its token_hash for
  // a real session on the cookie-wired client above.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkError || !linkData) {
    return NextResponse.json(
      { error: linkError?.message ?? "Could not generate link" },
      { status: 400 }
    );
  }

  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });

  if (verifyError || !verifyData.user) {
    return NextResponse.json(
      { error: verifyError?.message ?? "Verification failed" },
      { status: 401 }
    );
  }

  return withCookies(response, verifyData.user.id);
}

function withCookies(response: NextResponse, user_id: string) {
  const out = NextResponse.json({ ok: true, user_id });
  response.cookies.getAll().forEach(({ name, value, ...options }) =>
    out.cookies.set(name, value, options)
  );
  response.headers.forEach((value, key) => out.headers.set(key, value));
  return out;
}
