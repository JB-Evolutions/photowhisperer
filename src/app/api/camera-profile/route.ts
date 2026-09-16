// Per arch-spec-v3.1.md §2.5, implementation-guide.md PACK 6.
// Auth pattern mirrors src/app/api/settings/route.ts.
import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  getCameraProfile,
  upsertCameraProfile,
  type CameraProfile,
} from "@/lib/camera-profile";
import { validateStructuredProfile } from "./structured";
import { loadStructuredProfile, saveStructuredProfile } from "./persist";

const VALID_FLASH = new Set(["none", "speedlight", "studio"]);

type ValidateBodyResult =
  | { ok: true; value: Partial<CameraProfile> }
  | { ok: false; response: NextResponse };

function validateBody(raw: unknown): ValidateBodyResult {
  if (typeof raw !== "object" || raw === null) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "validation", message: "Request body must be a JSON object." },
        { status: 400 }
      ),
    };
  }

  const { body, lenses, flash, notes } = raw as Record<string, unknown>;
  const value: Partial<CameraProfile> = {};

  if (body !== undefined) {
    if (body !== null && (typeof body !== "string" || body.length > 255)) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "validation",
            message: "body must be a string of 255 characters or fewer, or null.",
          },
          { status: 400 }
        ),
      };
    }
    value.body = body;
  }

  if (lenses !== undefined) {
    if (
      lenses !== null &&
      (!Array.isArray(lenses) || !lenses.every((l) => typeof l === "string"))
    ) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "validation", message: "lenses must be an array of strings, or null." },
          { status: 400 }
        ),
      };
    }
    value.lenses = lenses;
  }

  if (flash !== undefined) {
    if (flash !== null && !VALID_FLASH.has(flash as string)) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "validation",
            message: "flash must be 'none', 'speedlight', 'studio', or null.",
          },
          { status: 400 }
        ),
      };
    }
    value.flash = flash as string | null;
  }

  if (notes !== undefined) {
    if (notes !== null && typeof notes !== "string") {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "validation", message: "notes must be a string or null." },
          { status: 400 }
        ),
      };
    }
    value.notes = notes;
  }

  return { ok: true, value };
}

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "You must be signed in." },
      { status: 401 }
    );
  }

  try {
    const profile = await getCameraProfile(user.id);
    // Structured fields are additive: a failed read must not break the
    // legacy profile response.
    let structured = null;
    try {
      structured = await loadStructuredProfile(user.id);
    } catch (err) {
      console.error("GET /api/camera-profile structured read failure:", err);
    }
    return NextResponse.json({ profile, structured });
  } catch (err) {
    console.error("GET /api/camera-profile failure:", err);
    return NextResponse.json(
      { error: "server_error", message: "Couldn't load your camera profile — try again?" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "You must be signed in." },
      { status: 401 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "validation", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  // Structured save: { body, structured: { lenses: LensProfile[], cropFactor,
  // ibisStops, isoBase, isoMode, isoValue, isoMax } }.
  if (typeof rawBody === "object" && rawBody !== null && "structured" in rawBody) {
    const { body, structured } = rawBody as Record<string, unknown>;
    const checked = validateStructuredProfile(body ?? null, structured);
    if (!checked.ok) {
      return NextResponse.json({ error: "validation", message: checked.message }, { status: 400 });
    }
    try {
      await saveStructuredProfile(user.id, checked.value);
      const { body: savedBody, ...savedStructured } = checked.value;
      return NextResponse.json({ body: savedBody, structured: savedStructured });
    } catch (err) {
      console.error("PUT /api/camera-profile structured failure:", err);
      return NextResponse.json(
        { error: "server_error", message: "Couldn't save your camera profile — try again?" },
        { status: 500 }
      );
    }
  }

  const validated = validateBody(rawBody);
  if (!validated.ok) {
    return validated.response;
  }

  try {
    const profile = await upsertCameraProfile(user.id, validated.value);
    return NextResponse.json(profile);
  } catch (err) {
    console.error("PUT /api/camera-profile failure:", err);
    return NextResponse.json(
      { error: "server_error", message: "Couldn't save your camera profile — try again?" },
      { status: 500 }
    );
  }
}
