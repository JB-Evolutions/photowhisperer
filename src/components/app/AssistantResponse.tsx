"use client";

// step 4: loading handled by session container
import { useState } from "react";
import type { BodyProfile } from "@/lib/contract/types";
import SettingsCubes, { nudgedIso, type NudgeStops } from "@/components/app/SettingsCubes";
import ResponsePanels from "@/components/app/ResponsePanels";
import ResponseActions from "@/components/app/ResponseActions";
import ClarificationCard from "@/components/app/ClarificationCard";
import InvalidInputCard from "@/components/app/InvalidInputCard";
import ErrorCard from "@/components/app/ErrorCard";
import ServiceBusyCard from "@/components/app/ServiceBusyCard";
import GearUnavailableCard from "@/components/app/GearUnavailableCard";
import PhotoRequestCard from "@/components/app/PhotoRequestCard";
import { responseAssumptions, type ThreadResponse } from "@/components/app/photoAttachment";
import type { ClarificationChip } from "@/components/app/conditions";

interface AssistantResponseProps {
  response: ThreadResponse;
  onRefine?: () => void;
  onFeedback?: (rating: "up" | "down") => void;
  onRetry?: () => void;
  onSeeExamples?: () => void;
  retryCount?: number;
  invalidCount?: number;
  // Words the shortfall line ("Locked at ISO 100, …"). null when unknown.
  isoMode?: BodyProfile["isoMode"] | null;
  clarificationChips?: readonly ClarificationChip[];
  onChipSelect?: (chip: ClarificationChip) => void;
  onSendWithoutPhoto?: () => void;
  onTryAnotherPhoto?: () => void;
}

export default function AssistantResponse({
  response,
  onRefine,
  onFeedback,
  onRetry,
  onSeeExamples,
  retryCount,
  invalidCount,
  isoMode = null,
  clarificationChips,
  onChipSelect,
  onSendWithoutPhoto,
  onTryAnotherPhoto,
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
        <div data-shot="app-settings" className="flex flex-col gap-3">
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
            assumptions={responseAssumptions(response, isoMode)}
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
      return (
        <ClarificationCard
          question={response.question}
          chips={clarificationChips}
          onChipSelect={onChipSelect}
        />
      );
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
    case "quota_exhausted":
      // Nothing left at all: same as quota_exceeded, the composer card is the UI.
      if (response.units_available <= 0) return null;
      return (
        <PhotoRequestCard
          response={response}
          onSendWithoutPhoto={onSendWithoutPhoto}
          onTryAnotherPhoto={onTryAnotherPhoto}
        />
      );
    case "payload_too_large":
    case "photo_failed":
      return (
        <PhotoRequestCard
          response={response}
          onSendWithoutPhoto={onSendWithoutPhoto}
          onTryAnotherPhoto={onTryAnotherPhoto}
        />
      );
    case "service_busy":
      return (
        <ServiceBusyCard
          retryCount={retryCount}
          onRetry={onRetry}
        />
      );
    case "gear_profile_unavailable":
      return (
        <GearUnavailableCard
          retryAfterSeconds={response.retryAfterSeconds}
          retryCount={retryCount}
          onRetry={onRetry}
        />
      );
    default:
      return <ErrorCard message="Unexpected response." />;
  }
}
