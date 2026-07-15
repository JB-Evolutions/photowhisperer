// THROWAWAY PROBE — iteration 2.
// Iteration 1 (plain `tsx`, no --conditions) silently loaded the WRONG
// build: @sentry/nextjs's package.json "exports" map only picks
// build/*/index.client.js under a "browser" condition, which plain Node
// resolution never sets (that's normally set by Next.js's webpack client
// build, not by a bare `node`/`tsx` process) — so it fell through to
// index.server.js and armed the Node SDK instead (platform:"node",
// Express/Fastify/Postgres integrations). Running with Node's built-in
// `--conditions=browser` flag (no new dep) forces the real browser-entry
// resolution.
//
// That first browser-build run threw synchronously during Sentry.init,
// before ever reaching captureException:
//   TypeError: Cannot read properties of undefined (reading 'getElementById')
//     at nextRouterInstrumentNavigation (.../client/routing/nextRoutingInstrumentation.ts:22)
//     at browserTracingIntegration.afterAllSetup (.../client/browserTracingIntegration.ts:41)
// i.e. @sentry/nextjs's client SDK wires router-transition instrumentation
// (browserTracingIntegration) unconditionally on init — independent of
// tracesSampleRate — and that setup calls document.getElementById directly.
// So `document.getElementById` is a hard requirement, stubbed here as the
// first addition.
//
// process.exit(0) added after flush per instruction — Sentry's browser
// client can keep timers alive past flush, which would otherwise hang the
// process indefinitely with no output.

import { createServer } from "node:http";
import { createRequire } from "node:module";
import type { ErrorEvent as SentryErrorEvent } from "@sentry/nextjs";

const require = createRequire(import.meta.url);
const addedGlobals: string[] = [];

function ensureGlobal(name: string, value: unknown) {
  if (!(name in globalThis)) {
    (globalThis as any)[name] = value;
    addedGlobals.push(name);
  }
}

const fakeLocation = {
  href: "http://localhost/dashboard",
  pathname: "/dashboard",
  protocol: "http:",
  hostname: "localhost",
};

ensureGlobal("window", {
  location: fakeLocation,
  addEventListener() {},
  removeEventListener() {},
});
// @sentry/browser-utils's internal WINDOW constant is literally
// `core.GLOBAL_OBJ` (confirmed by reading its types.js: `const WINDOW =
// core.GLOBAL_OBJ`), not `globalThis.window` — mirroring the real-browser
// invariant window === globalThis. So addEventListener/removeEventListener
// have to exist directly on globalThis itself, not just on our separate
// `window` stub object, or WINDOW.addEventListener(...) is undefined.
ensureGlobal("addEventListener", () => {});
ensureGlobal("removeEventListener", () => {});
ensureGlobal("document", {
  location: fakeLocation,
  getElementById: () => null,
  querySelector: () => null,
  createElement: () => ({ style: {} }),
  // dataset needed by next/dist/shared/lib/deployment-id.js, which reads
  // document.documentElement.dataset.dplId (then deletes it) unconditionally
  // whenever typeof window !== 'undefined' — hit via
  // browserTracingIntegration -> next's route-loader require chain.
  documentElement: { style: {}, dataset: {} },
  addEventListener() {},
  removeEventListener() {},
});
ensureGlobal("navigator", { userAgent: "probe" });
ensureGlobal("location", fakeLocation);

async function main() {
  const received: string[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(9999, "127.0.0.1", resolve));

  process.env.NEXT_PUBLIC_SENTRY_DSN = "http://public@127.0.0.1:9999/1";

  await import("../src/instrumentation-client");
  const Sentry = require("@sentry/nextjs");

  const client = Sentry.getClient();
  console.log("globals stubbed by hand:", addedGlobals);
  console.log("client armed:", !!client);
  if (!client) {
    console.error("INIT DID NOT RUN — DSN gate blocked it, or init silently failed");
    server.close();
    process.exit(1);
  }
  const options = client.getOptions();
  console.log("beforeSend wired:", typeof options.beforeSend === "function");

  const CANARIES = {
    email: "CANARY_EMAIL@leak.test",
    ip: "203.0.113.7",
    context: "CANARY_CONTEXT_STRING",
    message: "CANARY_MESSAGE_STRING",
    breadcrumb: "CANARY_BREADCRUMB_STRING",
    cookie: "CANARY_COOKIE_STRING",
  };
  const SAFE_USER_ID = "probe-123"; // positive control: SAFE_USER_KEYS must pass this through, not nuke it

  Sentry.setUser({ id: SAFE_USER_ID, email: CANARIES.email, ip_address: CANARIES.ip });
  Sentry.setContext("canary_ctx", { note: CANARIES.context });
  Sentry.addBreadcrumb({ message: `breadcrumb ${CANARIES.breadcrumb}`, category: "probe" });
  // Not a `tag` canary: grep of src/ turned up zero Sentry.setTag calls and
  // exactly one `tags:` call site (src/app/api/settings/route.ts:303, both
  // values hardcoded literals — "true" and "/api/settings" — never PII).
  // Tags aren't a real PII surface in this app, so planting a PII canary
  // there would test a risk that doesn't exist in prod. Cookies are a real
  // surface (SECRET_HEADER_NAMES-based redaction in scrubValue), so the
  // canary lives there instead.
  Sentry.addEventProcessor((event: SentryErrorEvent) => {
    event.request = {
      ...event.request,
      headers: { ...(event.request?.headers ?? {}), cookie: `session=${CANARIES.cookie}` },
    };
    return event;
  });

  Sentry.captureException(new Error(`boom ${CANARIES.message}`));
  await Sentry.flush(2000);
  await new Promise((r) => setTimeout(r, 500));

  console.log("envelopes received by fake-DSN server:", received.length);
  received.forEach((body, i) => {
    console.log(`--- envelope ${i} (raw, post-beforeSend) ---`);
    console.log(body);
  });

  const allBodies = received.join("\n");
  console.log("=== CANARY TABLE ===");
  for (const [name, value] of Object.entries(CANARIES)) {
    const present = allBodies.includes(value);
    console.log(`${name.padEnd(10)} ("${value}"): ${present ? "PRESENT in envelope" : "ABSENT from envelope"}`);
  }

  console.log(
    "\nLIMITATION: this probe exercises instrumentation-client.ts's raw source " +
      "under tsx + --conditions=browser, not the Next.js webpack-bundled " +
      "client output — NEXT_PUBLIC_SENTRY_DSN read here is a runtime " +
      "process.env lookup, whereas the real deployed bundle has that value " +
      "inlined at build time. This proves the source logic, not the bundled " +
      "production artifact."
  );

  server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("PROBE THREW:");
  console.error(err);
  process.exit(1);
});
