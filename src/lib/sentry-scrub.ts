import type * as Sentry from "@sentry/nextjs";

// @sentry/nextjs doesn't re-export TransactionEvent from its public surface,
// and @sentry/core isn't a direct dependency of this project (pnpm phantom-
// dep — resolves in node_modules today only as a transitive dep of
// @sentry/nextjs, not safe to import from directly). Derived structurally
// from Sentry.init's own beforeSendTransaction parameter instead.
type TransactionEvent = NonNullable<
  Parameters<NonNullable<Parameters<typeof Sentry.init>[0]["beforeSendTransaction"]>>[0]
>;

// Fields anywhere in an event (request data, extra, contexts, breadcrumb
// data) that may carry raw user photography prompts or model output — these
// must never leave the process. Recursive so it catches prior_context's
// nested user_msg/assistant_summary regardless of where the object ends up
// (top-level extra, request body, or a breadcrumb payload).
const SCENE_TEXT_KEYS = new Set([
  "conditions",
  "prior_context",
  "user_msg",
  "assistant_summary",
  "scene_summary",
]);

const SECRET_HEADER_NAMES = new Set(["authorization", "cookie", "set-cookie"]);

// Catches common secret token shapes if one ever ends up inline in a
// message string rather than a named field.
const SECRET_VALUE_RE =
  /\b(sb_secret_[A-Za-z0-9._-]+|sk_live_[A-Za-z0-9._-]+|sk_test_[A-Za-z0-9._-]+|whsec_[A-Za-z0-9._-]+|Bearer\s+[A-Za-z0-9._-]+)/gi;

// Free-text fields (event.message, exception values, breadcrumb.message)
// can't be scrubbed by key name — there's no field name to match on inside
// a string. Regex can catch recognizable secret shapes, but arbitrary
// natural-language scene text has no fixed shape a pattern can target, so
// this cap is a defensive bound, not a proof that no scene text can ever
// appear here. The real guarantee for this app's actual error paths is that
// no code interpolates conditions/prior_context/scene_summary into a thrown
// Error's message (verified: no such interpolation exists in src/api or
// src/lib as of this writing) — this truncation is the backstop if that
// ever changes.
const MAX_FREE_TEXT_LENGTH = 200;

function redactAndTruncate(value: string): string {
  const redacted = value.replace(SECRET_VALUE_RE, "[redacted]");
  return redacted.length > MAX_FREE_TEXT_LENGTH
    ? `${redacted.slice(0, MAX_FREE_TEXT_LENGTH)}…[truncated]`
    : redacted;
}

// extra/contexts are populated only by our own capture-point code (never
// automatically by the SDK with arbitrary user data, unlike request/
// breadcrumbs). That means we can afford — and need — an allowlist rather
// than a blocklist here: a blocklist only catches keys we thought to name,
// so a scene string under any other key (e.g. a future ad hoc debug field)
// would sail through the recursive key-name scrub AND survive
// redactAndTruncate if it's short and doesn't match a secret pattern. An
// allowlist closes that regardless of the value's length or shape.
const SAFE_EXTRA_KEYS = new Set(["user_id", "route", "status", "error_type", "tags"]);
const SAFE_CONTEXT_KEYS = new Set(["nextjs"]); // set by Sentry's own captureRequestError — framework-controlled, not user input

// contexts.nextjs is itself an object (request_path/router_kind/router_path/
// route_type per captureRequestError.js). Recursing into it via the plain
// blocklist scrub let an unexpected nested field slip through unscrubbed —
// so it gets the same field-level allowlist treatment as extra/contexts
// themselves, not the weaker key-name blocklist.
const SAFE_NEXTJS_CONTEXT_FIELDS = new Set([
  "request_path",
  "router_kind",
  "router_path",
  "route_type",
]);

function scrubAllowlisted(
  value: unknown,
  safeKeys: Set<string>,
  nestedScrubbers: Record<string, (v: unknown) => unknown> = {}
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "[omitted]";
  }
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (!safeKeys.has(key)) {
      out[key] = "[omitted]";
    } else if (nestedScrubbers[key]) {
      out[key] = nestedScrubbers[key](nested);
    } else {
      out[key] = scrubValue(nested);
    }
  }
  return out;
}

function scrubNextjsContext(value: unknown): unknown {
  return scrubAllowlisted(value, SAFE_NEXTJS_CONTEXT_FIELDS);
}

// Routes that handle raw scene text: /api/settings server-side (no
// sub-paths — confirmed only src/app/api/settings/route.ts exists), /app
// client-side and its sub-paths (confirmed only src/app/app/page.tsx exists
// today, but prefix-matched defensively since a session-scoped sub-route
// like /app/session/[id] is a plausible future addition). For events on
// these routes, free-text fields (message, exception values,
// breadcrumb.message) are replaced wholesale rather than pattern-scrubbed —
// regex/length checks can't reliably strip arbitrary natural language, so
// for this route class we trade message fidelity for a hard guarantee.
// Every other route (Stripe, webhooks, auth, marketing) keeps real messages
// via redactAndTruncate.
//
// Route identity is read directly off the event (contexts.nextjs.request_path
// server-side, request.url or window.location.pathname client-side) rather
// than a scope-set tag: captureRequestError builds its own fresh scope
// internally (see captureRequestError.js), and relying on scope/tag
// inheritance into that fresh scope was an unverified assumption. The route
// path is already on the event (or on `window` client-side) unconditionally,
// so deriving from it needs no scope-propagation guarantee at all.
export const SCENE_MESSAGE_PLACEHOLDER = "[error message omitted — scene-processing route]";

function isSceneRoutePathname(pathname: string): boolean {
  return pathname === "/api/settings" || pathname === "/app" || pathname.startsWith("/app/");
}

function pathnameMatchesSceneRoute(url: string): boolean {
  try {
    return isSceneRoutePathname(new URL(url, "http://localhost").pathname);
  } catch {
    return false; // malformed/relative URL we can't parse
  }
}

function isSceneRoute(event: Sentry.ErrorEvent): boolean {
  const nextjsContext = event.contexts?.nextjs as Record<string, unknown> | undefined;
  const nextjsPath = nextjsContext?.request_path;
  if (typeof nextjsPath === "string" && isSceneRoutePathname(nextjsPath)) {
    return true;
  }

  const requestUrl = event.request?.url;
  if (typeof requestUrl === "string" && pathnameMatchesSceneRoute(requestUrl)) {
    return true;
  }

  // Client-only fallback: browser events should already carry request.url,
  // but if it's ever absent, fall back to the page the error occurred on.
  if (typeof window !== "undefined" && isSceneRoutePathname(window.location.pathname)) {
    return true;
  }

  return false;
}

function scrubValue(value: unknown): unknown {
  // Floor: every string, anywhere, regardless of its key — a scene string
  // sitting under an unrecognized key (e.g. an ad hoc debug field in extra)
  // must not escape just because its key name isn't in SCENE_TEXT_KEYS.
  if (typeof value === "string") {
    return redactAndTruncate(value);
  }
  if (Array.isArray(value)) {
    return value.map(scrubValue);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (SCENE_TEXT_KEYS.has(key)) {
        out[key] = "[scrubbed]";
      } else if (SECRET_HEADER_NAMES.has(lowerKey)) {
        out[key] = "[redacted]";
      } else {
        out[key] = scrubValue(nested);
      }
    }
    return out;
  }
  return value;
}

export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  // Must be read before request/contexts are mutated below — it depends on
  // the pristine request.url / contexts.nextjs.request_path.
  const sceneRoute = isSceneRoute(event);
  const scrubFreeText = (value: string): string =>
    sceneRoute ? SCENE_MESSAGE_PLACEHOLDER : redactAndTruncate(value);

  if (event.request) {
    const scrubbedRequest = scrubValue(event.request) as NonNullable<
      Sentry.ErrorEvent["request"]
    >;
    // Value-level: never trust field names for the body — drop wholesale.
    // user_id + route + status is enough; the POST body is never needed,
    // which also moots whether requestDataIntegration attaches it upstream.
    if (scrubbedRequest.data !== undefined) {
      scrubbedRequest.data = "[body omitted]";
    }
    event.request = scrubbedRequest;
  }
  if (event.extra) {
    event.extra = scrubAllowlisted(event.extra, SAFE_EXTRA_KEYS) as typeof event.extra;
  }
  if (event.contexts) {
    event.contexts = scrubAllowlisted(event.contexts, SAFE_CONTEXT_KEYS, {
      nextjs: scrubNextjsContext,
    }) as typeof event.contexts;
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      // On a scene route, breadcrumb.data gets the same wholesale treatment
      // as message/exception values — an arbitrary short string under an
      // unrecognized key (e.g. a future ad hoc debug field) would otherwise
      // survive scrubValue's blocklist+string-floor untouched, same gap
      // that was already closed for extra/contexts via the allowlist.
      data: crumb.data
        ? sceneRoute
          ? { omitted: true }
          : (scrubValue(crumb.data) as typeof crumb.data)
        : crumb.data,
      message: crumb.message ? scrubFreeText(crumb.message) : crumb.message,
    }));
  }
  if (event.message) {
    event.message = scrubFreeText(event.message);
  }
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((ex) => ({
      ...ex,
      value: ex.value ? scrubFreeText(ex.value) : ex.value,
    }));
  }
  return event;
}

export const SPAN_DESCRIPTION_PLACEHOLDER = "[span description omitted]";

// contexts.trace.data is an open key/value bag (SpanAttributes), same as
// spans[].data below — an arbitrary short string under an unrecognized key
// survives scrubValue's blocklist+string-floor untouched (confirmed by a
// failing test before this fix), so it's wholesale-omitted rather than
// trusted. trace_id/span_id/op/status/origin are fixed-shape framework
// fields, not user-controlled text, and pass through unchanged.
function scrubTraceContext(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "[omitted]";
  }
  const trace = value as Record<string, unknown>;
  return {
    ...trace,
    data: trace.data !== undefined ? { omitted: true } : trace.data,
  };
}

// TransactionEvent leaks in different places than ErrorEvent: spans[].description,
// spans[].data, and contexts.trace.data can all carry arbitrary key/value pairs
// (e.g. a future span.setData() call) plus route/URL info, none of which scrubEvent
// touches — ErrorEvent has no `spans` field and its `contexts.trace` (if present at
// all) isn't handled by scrubEvent's allowlist. tracesSampleRate is 0 today, so no
// transaction currently ships; this is a guard against a future sample-rate raise
// shipping unscrubbed span data, not a currently-exercised path. All three
// open-ended bags are wholesale-omitted rather than passed through
// scrubValue's blocklist+string-floor — we never need free-form span text,
// and a short arbitrary string under an unrecognized key would otherwise
// survive that weaker path untouched (same gap already closed for
// extra/contexts/breadcrumb.data elsewhere in this module).
export function scrubTransaction(event: TransactionEvent): TransactionEvent {
  if (event.request) {
    const scrubbedRequest = scrubValue(event.request) as NonNullable<
      TransactionEvent["request"]
    >;
    if (scrubbedRequest.data !== undefined) {
      scrubbedRequest.data = "[body omitted]";
    }
    event.request = scrubbedRequest;
  }
  if (event.extra) {
    event.extra = scrubAllowlisted(event.extra, SAFE_EXTRA_KEYS) as typeof event.extra;
  }
  if (event.contexts) {
    event.contexts = scrubAllowlisted(
      event.contexts,
      new Set([...SAFE_CONTEXT_KEYS, "trace"]),
      { nextjs: scrubNextjsContext, trace: scrubTraceContext }
    ) as typeof event.contexts;
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      data: crumb.data ? (scrubValue(crumb.data) as typeof crumb.data) : crumb.data,
      message: crumb.message ? redactAndTruncate(crumb.message) : crumb.message,
    }));
  }
  if (event.spans) {
    event.spans = event.spans.map((span) => ({
      ...span,
      description: span.description ? SPAN_DESCRIPTION_PLACEHOLDER : span.description,
      data: span.data ? { omitted: true } : span.data,
    }));
  }
  return event;
}
