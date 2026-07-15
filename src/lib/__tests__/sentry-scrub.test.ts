import { describe, expect, it } from "vitest";
import {
  scrubEvent,
  scrubTransaction,
  SCENE_MESSAGE_PLACEHOLDER,
  SPAN_DESCRIPTION_PLACEHOLDER,
  type TransactionEvent,
} from "@/lib/sentry-scrub";
import type * as Sentry from "@sentry/nextjs";

const CANARY = "SCENE_LEAK_CANARY_backlit golden hour 85mm";

function buildSceneRouteEventWithCanary(): Sentry.ErrorEvent {
  return {
    message: CANARY,
    exception: {
      values: [{ type: "Error", value: CANARY }],
    },
    breadcrumbs: [
      {
        message: CANARY,
        data: { nested_debug_field: CANARY },
      },
    ],
    request: {
      data: CANARY,
    },
    extra: {
      some_unlisted_debug_field: CANARY,
    },
    contexts: {
      nextjs: {
        request_path: "/api/settings",
        // Hypothetical: even if something unexpected landed alongside the
        // known-safe fields, the allowlist path scrubs it as a string.
        unexpected_field: CANARY,
      },
    },
  } as unknown as Sentry.ErrorEvent;
}

describe("scrubEvent", () => {
  it("wholesale-replaces free text on a scene-route event and drops the canary everywhere", () => {
    const scrubbed = scrubEvent(buildSceneRouteEventWithCanary());
    const serialized = JSON.stringify(scrubbed);

    expect(serialized).not.toContain(CANARY);

    expect(scrubbed.message).toBe(SCENE_MESSAGE_PLACEHOLDER);
    expect(scrubbed.exception?.values?.[0]?.value).toBe(SCENE_MESSAGE_PLACEHOLDER);
    expect(scrubbed.breadcrumbs?.[0]?.message).toBe(SCENE_MESSAGE_PLACEHOLDER);
    // Locks the { omitted: true } branch specifically — this is the exact
    // shape a real TypeScript build caught was wrong (a bare "[omitted]"
    // string failed Breadcrumb.data's object-or-undefined type) but which
    // the old `as unknown as ErrorEvent` cast in this test let slide.
    expect(scrubbed.breadcrumbs?.[0]?.data).toEqual({ omitted: true });
    expect(JSON.stringify(scrubbed.breadcrumbs?.[0]?.data)).not.toContain(CANARY);
    expect(scrubbed.request?.data).toBe("[body omitted]");
    expect(JSON.stringify(scrubbed.extra)).not.toContain(CANARY);
    expect(JSON.stringify(scrubbed.contexts)).not.toContain(CANARY);
  });

  it("detects a scene route via contexts.nextjs.request_path alone (no request.url present) — the captureRequestError path", () => {
    const event = {
      message: CANARY,
      contexts: {
        nextjs: { request_path: "/api/settings" },
      },
      // Deliberately no `request` field at all — captureRequestError only
      // sets scope context, never event.request.url (confirmed from its
      // source in captureRequestError.js: it sets normalizedRequest on the
      // scope, not event.request directly).
    } as unknown as Sentry.ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(scrubbed.message).toBe(SCENE_MESSAGE_PLACEHOLDER);
  });

  it("preserves real messages via redactAndTruncate on a non-scene route", () => {
    const REAL_MESSAGE = "Cannot read properties of undefined (reading 'customer')";
    const event = {
      message: REAL_MESSAGE,
      exception: { values: [{ type: "TypeError", value: REAL_MESSAGE }] },
      breadcrumbs: [{ message: REAL_MESSAGE }],
      request: { url: "https://app.example.com/api/stripe/checkout/subscription" },
    } as unknown as Sentry.ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(scrubbed.message).toBe(REAL_MESSAGE);
    expect(scrubbed.exception?.values?.[0]?.value).toBe(REAL_MESSAGE);
    expect(scrubbed.breadcrumbs?.[0]?.message).toBe(REAL_MESSAGE);
  });

  it("keeps allowlisted extra/context fields intact and omits unlisted ones", () => {
    const event = {
      extra: { user_id: "abc-123", status: 429, some_unlisted_debug_field: CANARY },
      contexts: {
        nextjs: {
          request_path: "/api/settings",
          router_kind: "app-router",
          unexpected_field: CANARY,
        },
      },
    } as unknown as Sentry.ErrorEvent;

    const scrubbed = scrubEvent(event);
    const nextjsContext = scrubbed.contexts?.nextjs as Record<string, unknown>;

    expect(scrubbed.extra?.user_id).toBe("abc-123");
    expect(scrubbed.extra?.status).toBe(429);
    expect(scrubbed.extra?.some_unlisted_debug_field).toBe("[omitted]");
    expect(nextjsContext.request_path).toBe("/api/settings");
    expect(nextjsContext.router_kind).toBe("app-router");
    expect(nextjsContext.unexpected_field).toBe("[omitted]");
  });

  it("scrubs recursive scene-text keys and secret headers by name", () => {
    const event = {
      request: {
        headers: { authorization: "Bearer abc123", cookie: "session=xyz" },
      },
      extra: {
        route: "/api/settings",
      },
    } as unknown as Sentry.ErrorEvent;

    const scrubbed = scrubEvent(event);
    const headers = scrubbed.request?.headers as Record<string, string>;

    expect(headers.authorization).toBe("[redacted]");
    expect(headers.cookie).toBe("[redacted]");
  });

  it("strips user.geo and other non-allowlisted user fields while keeping id", () => {
    const event = {
      user: {
        id: "probe-123",
        email: "leak@example.com",
        geo: { country_code: "NZ", city: "Auckland", subdivision: "Auckland", region: "Oceania" },
      },
    } as unknown as Sentry.ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(scrubbed.user).toEqual({ id: "probe-123" });
    expect(JSON.stringify(scrubbed.user)).not.toContain("Auckland");
  });
});

describe("scrubTransaction", () => {
  function buildTransactionEventWithCanary(): TransactionEvent {
    return {
      type: "transaction",
      spans: [
        {
          description: CANARY,
          data: { nested_debug_field: CANARY },
          span_id: "abc",
          trace_id: "def",
          start_timestamp: 0,
        },
      ],
      contexts: {
        trace: {
          trace_id: "def",
          span_id: "abc",
          op: "http.server",
          data: { nested_debug_field: CANARY },
        },
      },
      request: {
        data: CANARY,
      },
      extra: {
        some_unlisted_debug_field: CANARY,
      },
    } as unknown as TransactionEvent;
  }

  it("drops the canary from every transaction-specific surface", () => {
    const scrubbed = scrubTransaction(buildTransactionEventWithCanary());
    const serialized = JSON.stringify(scrubbed);

    expect(serialized).not.toContain(CANARY);

    expect(scrubbed.spans?.[0]?.description).toBe(SPAN_DESCRIPTION_PLACEHOLDER);
    expect(scrubbed.spans?.[0]?.data).toEqual({ omitted: true });
    expect((scrubbed.contexts?.trace as Record<string, unknown>)?.data).toEqual({ omitted: true });
    expect(scrubbed.request?.data).toBe("[body omitted]");
    expect(scrubbed.extra?.some_unlisted_debug_field).toBe("[omitted]");
  });

  it("keeps contexts.trace's fixed fields intact while omitting its data bag", () => {
    const scrubbed = scrubTransaction(buildTransactionEventWithCanary());
    const trace = scrubbed.contexts?.trace as Record<string, unknown>;

    expect(trace.trace_id).toBe("def");
    expect(trace.op).toBe("http.server");
    expect(trace.data).toEqual({ omitted: true });
  });

  it("omits unlisted context keys the same way scrubEvent does", () => {
    const event = {
      type: "transaction",
      contexts: {
        trace: { trace_id: "def", span_id: "abc" },
        some_unlisted_context: { anything: CANARY },
      },
    } as unknown as TransactionEvent;

    const scrubbed = scrubTransaction(event);

    expect(scrubbed.contexts?.some_unlisted_context).toBe("[omitted]");
  });
});
