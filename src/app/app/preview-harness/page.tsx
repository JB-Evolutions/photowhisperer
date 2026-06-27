// TODO(9.6-step4): delete preview harness
import { ToastProvider } from "@/components/app/useToast";
import UserMessage from "@/components/app/UserMessage";
import SettingsCubes from "@/components/app/SettingsCubes";
import ResponsePanels from "@/components/app/ResponsePanels";
import ResponseActions from "@/components/app/ResponseActions";
import AssistantResponse from "@/components/app/AssistantResponse";
import SessionView from "@/components/app/SessionView";
import type { SettingsResponseOk } from "@/lib/settings";

const FIXTURES: Array<{ prompt: string; response: SettingsResponseOk }> = [
  {
    // Fixture 1: <1s shutter, numeric WB, assumptions + warnings both present
    prompt: "Backlit portrait at golden hour, 85mm, handheld",
    response: {
      status: "ok",
      iso: 200,
      aperture: "f/1.8",
      shutter_speed: "1/500",
      white_balance: "daylight",
      color_temperature: "5500K",
      assumptions: ["Focal length assumed: 85mm", "Handheld — shake floor applied"],
      warnings: ["High contrast — expose for highlights; shadows may clip"],
      scene_summary: "Golden hour backlit portrait with warm ambient light and shallow depth of field.",
      credits_used: false,
      monthly_count: 1,
      credits_remaining: 4,
      session_id: "preview-1",
    },
  },
  {
    // Fixture 2: ≥1s shutter, Auto WB (color_temperature null), no assumptions, no warnings
    prompt: "Long exposure waterfall on a tripod",
    response: {
      status: "ok",
      iso: 100,
      aperture: "f/11",
      shutter_speed: '2"',
      white_balance: "auto",
      color_temperature: null,
      assumptions: [],
      warnings: [],
      scene_summary: "Long-exposure waterfall on tripod in mixed ambient light.",
      credits_used: false,
      monthly_count: 2,
      credits_remaining: 3,
      session_id: "preview-2",
    },
  },
  {
    // Fixture 3: flash WB, sync caveat in warnings, no assumptions
    prompt: "Studio speedlight portrait",
    response: {
      status: "ok",
      iso: 100,
      aperture: "f/5.6",
      shutter_speed: "1/200",
      white_balance: "flash",
      color_temperature: "5500K",
      assumptions: [],
      warnings: ["Shutter clamped to flash sync speed (1/200) — use HSS for faster."],
      scene_summary: "Studio speedlight portrait — settings optimised for a single off-camera flash.",
      credits_used: false,
      monthly_count: 3,
      credits_remaining: 2,
      session_id: "preview-3",
    },
  },
  {
    // Fixture 4: numeric WB, assumptions present, warnings empty
    prompt: "Bird in flight, overcast, 400mm",
    response: {
      status: "ok",
      iso: 800,
      aperture: "f/5.6",
      shutter_speed: "1/1000",
      white_balance: "cloudy",
      color_temperature: "6500K",
      assumptions: ["Focal length assumed: 400mm — shake floor set accordingly"],
      warnings: [],
      scene_summary: "Fast bird in flat overcast light, long telephoto.",
      credits_used: true,
      monthly_count: 4,
      credits_remaining: 1,
      session_id: "preview-4",
    },
  },
];

export default function PreviewPage() {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-bg px-4 py-12">
        <div className="mx-auto max-w-[880px] space-y-16">
          {/* Live dispatch — 4b SessionView instances */}
          {(["ok", "clarification", "invalid", "error"] as const).map((fake) => (
            <section key={fake} className="flex flex-col gap-4">
              <p className="font-mono text-xs text-text-dim">
                Live · fake={fake}
              </p>
              <SessionView fakeParam={fake} />
            </section>
          ))}

          <div className="border-t border-border" />
          <p className="font-mono text-xs text-text-dim">Static fixtures below (F1–F9)</p>

          {FIXTURES.map((fixture, i) => (
            <section key={fixture.response.session_id} className="flex flex-col gap-4">
              <p className="font-mono text-xs text-text-dim">Fixture {i + 1}</p>
              <UserMessage text={fixture.prompt} />
              <SettingsCubes
                iso={fixture.response.iso}
                aperture={fixture.response.aperture}
                shutter_speed={fixture.response.shutter_speed}
                white_balance={fixture.response.white_balance}
                color_temperature={fixture.response.color_temperature}
              />
              <ResponsePanels
                scene_summary={fixture.response.scene_summary}
                assumptions={fixture.response.assumptions}
                warnings={fixture.response.warnings}
              />
              <ResponseActions
                iso={fixture.response.iso}
                aperture={fixture.response.aperture}
                shutter_speed={fixture.response.shutter_speed}
                white_balance={fixture.response.white_balance}
                color_temperature={fixture.response.color_temperature}
              />
            </section>
          ))}

          {/* F5–F9: AssistantResponse switch exercised */}
          <section className="flex flex-col gap-4">
            <p className="font-mono text-xs text-text-dim">Fixture 5 — clarification_required</p>
            <AssistantResponse
              response={{ status: "clarification_required", question: "Is this indoors or outdoors, and is the subject moving?" }}
            />
          </section>

          <section className="flex flex-col gap-4">
            <p className="font-mono text-xs text-text-dim">Fixture 6 — invalid_input (count 1, no link)</p>
            <AssistantResponse
              response={{ status: "invalid_input", message: "Please describe your shooting conditions: lighting, subject, and movement." }}
              invalidCount={1}
            />
          </section>

          <section className="flex flex-col gap-4">
            <p className="font-mono text-xs text-text-dim">Fixture 7 — invalid_input (count 3, See examples visible)</p>
            <AssistantResponse
              response={{ status: "invalid_input", message: "Please describe your shooting conditions: lighting, subject, and movement." }}
              invalidCount={3}
            />
          </section>

          <section className="flex flex-col gap-4">
            <p className="font-mono text-xs text-text-dim">Fixture 8 — error (retryCount 1, Retry visible)</p>
            <AssistantResponse
              response={{ status: "error", message: "Couldn't reach the photography service. Try again?" }}
              retryCount={1}
            />
          </section>

          <section className="flex flex-col gap-4">
            <p className="font-mono text-xs text-text-dim">Fixture 9 — error (retryCount 3, Report a problem)</p>
            <AssistantResponse
              response={{ status: "error", message: "Couldn't reach the photography service. Try again?" }}
              retryCount={3}
            />
          </section>
        </div>
      </div>
    </ToastProvider>
  );
}
