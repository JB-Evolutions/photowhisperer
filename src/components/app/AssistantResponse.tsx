// step 4: loading handled by session container
import type { SettingsResponse } from "@/lib/settings";
import SettingsCubes from "@/components/app/SettingsCubes";
import ResponsePanels from "@/components/app/ResponsePanels";
import ResponseActions from "@/components/app/ResponseActions";
import ClarificationCard from "@/components/app/ClarificationCard";
import InvalidInputCard from "@/components/app/InvalidInputCard";
import ErrorCard from "@/components/app/ErrorCard";

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
  switch (response.status) {
    case "ok":
      return (
        <div className="flex flex-col gap-3">
          <SettingsCubes
            iso={response.iso}
            aperture={response.aperture}
            shutter_speed={response.shutter_speed}
            white_balance={response.white_balance}
            color_temperature={response.color_temperature}
          />
          <ResponsePanels
            scene_summary={response.scene_summary}
            assumptions={response.assumptions}
            warnings={response.warnings}
          />
          <ResponseActions
            iso={response.iso}
            aperture={response.aperture}
            shutter_speed={response.shutter_speed}
            white_balance={response.white_balance}
            color_temperature={response.color_temperature}
            onRefine={onRefine}
            onFeedback={onFeedback}
          />
        </div>
      );
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
    default:
      return <ErrorCard message="Unexpected response." />;
  }
}
