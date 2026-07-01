"use client";

import { useState } from "react";
import Button from "@/components/shared/Button";

const SURVEY_OPTIONS = [
  "Too expensive",
  "Need different features",
  "Just exploring",
  "Other",
] as const;

type SurveyOption = (typeof SURVEY_OPTIONS)[number];

export default function CancelView() {
  const [surveyDone, setSurveyDone] = useState(false);

  function handleSurvey(option: SurveyOption) {
    console.debug("[TODO(analytics)] cancel survey response:", option);
    setSurveyDone(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl text-text">Purchase canceled</h1>
        <p className="text-sm text-text-muted">No charges were made.</p>
      </div>

      {!surveyDone && (
        <div className="flex flex-col gap-3 rounded-[12px] border border-border p-4">
          <p className="text-sm font-medium text-text">Why did you cancel?</p>
          <div
            className="flex flex-col gap-2"
            role="group"
            aria-label="Cancelation reason"
          >
            {SURVEY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleSurvey(option)}
                className="rounded-lg border border-border px-4 py-2.5 text-left text-sm text-text-muted transition-colors hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent)]"
              >
                {option}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSurveyDone(true)}
            className="self-start text-xs text-text-dim underline hover:text-text-muted focus-visible:outline-none"
          >
            Skip
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button variant="primary" href="/app">
          Back to app
        </Button>
        <Button variant="outline" href="/account/billing">
          Back to billing
        </Button>
      </div>
    </div>
  );
}
