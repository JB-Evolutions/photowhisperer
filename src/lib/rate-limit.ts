import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  throw new Error(
    "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set — " +
      "rate limiting has no in-memory or no-op fallback."
  );
}

const redis = new Redis({
  url,
  token,
  // A dead/slow Redis host must fail the request fast into the 503 path
  // rather than hang it; a fresh AbortSignal.timeout() per call since a
  // single AbortSignal instance can only fire once.
  signal: () => AbortSignal.timeout(1000),
  // No retries: a retry can burn most of the 1s per-call signal budget
  // again, pushing fail-closed latency to multiple seconds.
  retry: false,
});

export const settingsRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  prefix: "ratelimit:settings",
});

type RatelimitResult = Awaited<ReturnType<typeof settingsRatelimit.limit>>;

// LOCAL-DEV-ONLY bypass — see KNOWN_ISSUES.md. Auckland→us-east-1 latency to
// the real Upstash regional DB is genuinely slow enough from this dev
// machine (~27% of calls exceed the 1000ms timeout) to make local testing of
// anything past the limiter (e.g. the §4.10 quota flow) impractical. This is
// NOT a fix for that latency and NOT a fallback for missing creds or a
// timed-out call — those still fail closed via the catch below. It is an
// explicit, double-guarded opt-in: both DISABLE_RATE_LIMIT_LOCAL === "true"
// AND NODE_ENV !== "production" must hold, so prod (which never sets the
// flag, and always runs NODE_ENV=production) is structurally unaffected
// regardless of what's in any single env source.
const LOCAL_BYPASS_ENABLED =
  process.env.NODE_ENV !== "production" && process.env.DISABLE_RATE_LIMIT_LOCAL === "true";

function localBypassResult(): RatelimitResult {
  return {
    success: true,
    limit: 10,
    remaining: 10,
    reset: Date.now() + 60_000,
    pending: Promise.resolve(),
  };
}

// The per-fetch signal above bounds a single HTTP call, not the total
// wall-time of .limit() (which can issue more than one Redis command).
// This is the hard outer bound; a timeout here rejects into the route's
// catch → 503 fail-closed path.
export function limitWithTimeout(key: string): Promise<RatelimitResult> {
  if (LOCAL_BYPASS_ENABLED) {
    return Promise.resolve(localBypassResult());
  }

  let timer: ReturnType<typeof setTimeout>;
  const limitCall = settingsRatelimit.limit(key);
  // @upstash/ratelimit's LimitOptions has no abort/signal field, so a lost
  // race can't cancel the in-flight call — it keeps running server-side and
  // settles later, discarded. Attach a no-op catch so that late rejection
  // (e.g. the per-fetch AbortSignal firing after we've already moved on)
  // never surfaces as an unhandled rejection.
  limitCall.catch(() => {});
  const timeout = new Promise<RatelimitResult>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("rate limit check timed out"));
    }, 1200);
  });
  return Promise.race([limitCall, timeout]).finally(() => clearTimeout(timer));
}
