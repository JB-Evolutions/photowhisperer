"use client";

// step 4: loading handled by session container
import { useState } from "react";
import type { SettingsResponse } from "@/lib/settings";
import SettingsCubes, { nudgedIso, type NudgeStops } from "@/components/app/SettingsCubes";
import ResponsePanels from "@/components/app/ResponsePanels";
import ResponseActions from "@/components/app/ResponseActions";
import ClarificationCard from "@/components/app/ClarificationCard";
import InvalidInputCard from "@/components/app/InvalidInputCard";
import ErrorCard from "@/components/app/ErrorCard";
import ServiceBusyCard from "@/components/app/ServiceBusyCard";

interface AssistantResponseProps {
  response: SettingsResponse;
  onRefine?: () => void;
  onFeedback?: (rating: "up" | "down") => void;
  onRetry?: () => void;
  onSeeExamples?: () => void;
  retryCount?: number;
  invalidCount?: number;
}

export default function AssistantResponse({
  response,
  onRefine,
  onFeedback,
  onRetry,
  onSeeExamples,
  retryCount,
  invalidCount,
}: AssistantResponseProps) {
  // Local-only, resets per response since AssistantResponse remounts per
  // message (SessionView keys the list by index). Declared unconditionally,
  // above the switch — this component returns from every case branch below,
  // so a hook declared inside one branch would be conditional and violate
  // the rules of hooks whenever response.status differs between renders.
  const [nudgeStops, setNudgeStops] = useState<NudgeStops>(0);

  switch (response.status) {
    case "ok": {
      // ResponseActions' "Copy all" needs this same adjusted value, which is
      // why the nudge lives here rather than staying local to SettingsCubes.
      const adjustedIso = nudgedIso(response.iso, nudgeStops);
      const isoAdjusted = nudgeStops !== 0;
      return (
        <div className="flex flex-col gap-3">
          <SettingsCubes
            iso={response.iso}
            aperture={response.aperture}
            shutter_speed={response.shutter_speed}
            white_balance={response.white_balance}
            color_temperature={response.color_temperature}
            nudgeStops={nudgeStops}
            onNudgeStopsChange={setNudgeStops}
          />
          <ResponsePanels
            scene_summary={response.scene_summary}
            assumptions={response.assumptions}
            warnings={response.warnings}
          />
          <ResponseActions
            iso={adjustedIso}
            isoAdjusted={isoAdjusted}
            aperture={response.aperture}
            shutter_speed={response.shutter_speed}
            white_balance={response.white_balance}
            color_temperature={response.color_temperature}
            onRefine={onRefine}
            onFeedback={onFeedback}
          />
        </div>
      );
    }
    case "clarification_required":
      return <ClarificationCard question={response.question} />;
    case "invalid_input":
      return (
        <InvalidInputCard
          message={response.message}
          consecutiveCount={invalidCount}
          onSeeExamples={onSeeExamples}
        />
      );
    case "error":
      return (
        <ErrorCard
          message={response.message}
          retryCount={retryCount}
          onRetry={onRetry}
        />
      );
    case "quota_exceeded":
      // §4.10: no thread bubble — the OutOfCreditsCard replacing the
      // composer (forced via onQuotaExceeded, see SessionView/AppShell) is
      // the only UI for this case.
      return null;
    case "service_busy":
      return (
        <ServiceBusyCard
          retryCount={retryCount}
          onRetry={onRetry}
        />
      );
    default:
      return <ErrorCard message="Unexpected response." />;
  }
}
