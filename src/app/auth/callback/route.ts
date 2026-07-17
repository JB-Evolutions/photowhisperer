import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCameraProfile } from "@/lib/camera-profile";

type AllowedOtpType = "recovery" | "magiclink" | "signup" | "email";
const ALLOWED_OTP_TYPES: readonly AllowedOtpType[] = ["recovery", "magiclink", "signup", "email"];

function isAllowedOtpType(value: string | null): value is AllowedOtpType {
  return value !== null && (ALLOWED_OTP_TYPES as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const supabase = await createClient();
  const expiredRedirect = new URL("/auth/signin?error=link_expired", request.url);

  let exchangeError;
  if (code) {
    ({ error: exchangeError } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && isAllowedOtpType(type)) {
    ({ error: exchangeError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  } else {
    return NextResponse.redirect(expiredRedirect);
  }

  if (exchangeError) {
    return NextResponse.redirect(expiredRedirect);
  }

  if (type === "recovery") {
    return NextResponse.redirect(new URL("/auth/reset/confirm", request.url));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(expiredRedirect);
  }

  let cameraProfile: Awaited<ReturnType<typeof getCameraProfile>>;
  try {
    cameraProfile = await getCameraProfile(user.id);
  } catch (err) {
    console.error("auth/callback getCameraProfile failure:", err);
    return NextResponse.redirect(new URL("/app", request.url));
  }
  return NextResponse.redirect(
    new URL(cameraProfile ? "/app" : "/onboarding/camera", request.url)
  );
}
