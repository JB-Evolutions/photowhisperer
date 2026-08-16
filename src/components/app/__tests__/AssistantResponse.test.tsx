// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AssistantResponse from "../AssistantResponse";
import type { SettingsResponse } from "@/lib/settings";

afterEach(cleanup);

describe("AssistantResponse status switch — service_busy carve-out", () => {
  it("service_busy → ServiceBusyCard, not ErrorCard", () => {
    // ServiceBusyCard/ErrorCard headers are plain <span> text with no role,
    // aria-label, or test id — copy-coupled and unavoidable without adding
    // markers that don't already exist in the component.
    render(
      <AssistantResponse
        response={{ status: "service_busy" } as SettingsResponse}
        retryCount={0}
        onRetry={() => {}}
      />
    );
    expect(screen.getByText("The service is busy right now")).not.toBeNull();
    expect(screen.queryByText("Something went sideways")).toBeNull();
  });

  it("service_busy passes retryCount/onRetry through to ServiceBusyCard", () => {
    // props.retryCount/props.onRetry are no longer inspectable directly through
    // a real render, so this is now two DOM-observable proofs instead of one
    // prop-equality check: (1) onRetry is the exact function threaded through —
    // proven by simulating a click and asserting the mock fired; (2) retryCount
    // is the exact number threaded through (not just "some value under 3") —
    // proven with a boundary value of 3, which flips ServiceBusyCard's rendered
    // branch from the Retry button to the "Still failing?" fallback. Both the
    // Retry button and the "Report a problem" link have accessible
    // role+name, so this test uses getByRole throughout — no copy-string
    // assertions needed here.
    const onRetry = vi.fn();
    const { unmount } = render(
      <AssistantResponse
        response={{ status: "service_busy" } as SettingsResponse}
        retryCount={2}
        onRetry={onRetry}
      />
    );
    const retryButton = screen.getByRole("button", { name: "Retry" });
    retryButton.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    unmount();

    render(
      <AssistantResponse
        response={{ status: "service_busy" } as SettingsResponse}
        retryCount={3}
        onRetry={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getByRole("link", { name: "Report a problem" })).not.toBeNull();
  });

  // ─── Regression guards — no other status path changed behavior ────────────
  it("REGRESSION: quota_exceeded still renders null (no redundant ErrorCard bubble — §4.10)", () => {
    const { container } = render(
      <AssistantResponse response={{ status: "quota_exceeded" } as SettingsResponse} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("REGRESSION: error still renders ErrorCard (not ServiceBusyCard)", () => {
    // Same copy-coupling caveat as the service_busy carve-out test above:
    // ErrorCard's header has no role/label to key off instead.
    render(
      <AssistantResponse
        response={{ status: "error", message: "Something went sideways." } as SettingsResponse}
        retryCount={0}
        onRetry={() => {}}
      />
    );
    expect(screen.getByText("Something went sideways")).not.toBeNull();
    expect(screen.queryByText("The service is busy right now")).toBeNull();
  });

  it("REGRESSION: invalid_input unaffected", () => {
    // Header text is copy-coupled (no role/label on InvalidInputCard's
    // header). The message assertion is intentionally still getByText —
    // the message string passing through unchanged IS the behavior under
    // test here, not an incidental implementation detail.
    render(
      <AssistantResponse
        response={{
          status: "invalid_input",
          message: "Please describe your shooting conditions.",
        } as SettingsResponse}
      />
    );
    expect(screen.getByText("Not quite enough to go on")).not.toBeNull();
    expect(screen.getByText("Please describe your shooting conditions.")).not.toBeNull();
  });

  it("REGRESSION: clarification_required unaffected", () => {
    // Same pattern as invalid_input: header text is copy-coupled, the
    // question text is the passthrough behavior being verified.
    render(
      <AssistantResponse
        response={{ status: "clarification_required", question: "Indoors or outdoors?" } as SettingsResponse}
      />
    );
    expect(screen.getByText("Need a bit more info")).not.toBeNull();
    expect(screen.getByText("Indoors or outdoors?")).not.toBeNull();
  });

  // rate_limited never reaches AssistantResponse — SessionView returns early
  // on it (onRateLimit + reset counters) before pushing an assistant message,
  // so there's no switch case for it here. Confirmed by reading SessionView's
  // send(): `if (result.status === "rate_limited") { onRateLimit?.(); return; }`
  // runs before `setMessages` is ever called with that result.
});
