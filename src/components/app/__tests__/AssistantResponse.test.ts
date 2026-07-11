// AssistantResponse is a plain function component with no hooks of its own,
// so it can be invoked directly as a function and its returned element tree
// inspected via .type/.props — no DOM/jsdom needed (this project's vitest
// config runs environment: "node").
import { describe, it, expect } from "vitest";
import AssistantResponse from "../AssistantResponse";
import ErrorCard from "../ErrorCard";
import ServiceBusyCard from "../ServiceBusyCard";
import type { SettingsResponse } from "@/lib/settings";

describe("AssistantResponse status switch — service_busy carve-out", () => {
  it("service_busy → ServiceBusyCard, not ErrorCard", () => {
    const el = AssistantResponse({
      response: { status: "service_busy" } as SettingsResponse,
      retryCount: 0,
      onRetry: () => {},
    });
    expect(el).not.toBeNull();
    expect((el as { type: unknown }).type).toBe(ServiceBusyCard);
    expect((el as { type: unknown }).type).not.toBe(ErrorCard);
  });

  it("service_busy passes retryCount/onRetry through to ServiceBusyCard", () => {
    const onRetry = () => {};
    const el = AssistantResponse({
      response: { status: "service_busy" } as SettingsResponse,
      retryCount: 2,
      onRetry,
    });
    const props = (el as { props: { retryCount?: number; onRetry?: () => void } }).props;
    expect(props.retryCount).toBe(2);
    expect(props.onRetry).toBe(onRetry);
  });

  // ─── Regression guards — no other status path changed behavior ────────────
  it("REGRESSION: quota_exceeded still renders null (no redundant ErrorCard bubble — §4.10)", () => {
    const el = AssistantResponse({
      response: { status: "quota_exceeded" } as SettingsResponse,
    });
    expect(el).toBeNull();
  });

  it("REGRESSION: error still renders ErrorCard (not ServiceBusyCard)", () => {
    const el = AssistantResponse({
      response: { status: "error", message: "Something went sideways." } as SettingsResponse,
      retryCount: 0,
      onRetry: () => {},
    });
    expect((el as { type: unknown }).type).toBe(ErrorCard);
    expect((el as { type: unknown }).type).not.toBe(ServiceBusyCard);
  });

  it("REGRESSION: invalid_input unaffected", () => {
    const el = AssistantResponse({
      response: {
        status: "invalid_input",
        message: "Please describe your shooting conditions.",
      } as SettingsResponse,
    });
    expect((el as { type: { name: string } }).type.name).toBe("InvalidInputCard");
  });

  it("REGRESSION: clarification_required unaffected", () => {
    const el = AssistantResponse({
      response: { status: "clarification_required", question: "Indoors or outdoors?" } as SettingsResponse,
    });
    expect((el as { type: { name: string } }).type.name).toBe("ClarificationCard");
  });

  // rate_limited never reaches AssistantResponse — SessionView returns early
  // on it (onRateLimit + reset counters) before pushing an assistant message,
  // so there's no switch case for it here. Confirmed by reading SessionView's
  // send(): `if (result.status === "rate_limited") { onRateLimit?.(); return; }`
  // runs before `setMessages` is ever called with that result.
});
