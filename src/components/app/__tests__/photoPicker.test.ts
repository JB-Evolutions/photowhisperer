import { describe, expect, it } from "vitest";
import { PHOTO_SOURCE_ORDER, SOURCE_HINTS } from "@/components/app/PhotoPicker";
import { IMAGE_ACCEPT } from "@/lib/image/limits";

describe("PHOTO_SOURCE_ORDER", () => {
  // A device-matrix run found that an iOS capture="environment" input returns a
  // photo with the exposure tags stripped, whatever the accept value. Library
  // photos keep theirs and resolve at tier 1, so the library has to lead. Left
  // uncommented this looks like an arbitrary ordering and invites a reflip.
  it("puts the library first, because iOS capture strips EXIF", () => {
    expect(PHOTO_SOURCE_ORDER[0]).toBe("library");
    expect([...PHOTO_SOURCE_ORDER]).toEqual(["library", "camera"]);
  });

  // The same run showed accept="image/*" makes Safari transcode the pick and
  // drop the EXIF with it. Both inputs read this constant, so it is the one
  // place the wildcard could creep back in.
  it("feeds both inputs an accept with no wildcard", () => {
    expect(IMAGE_ACCEPT).not.toMatch(/\*/);
  });
});

describe("SOURCE_HINTS", () => {
  // The hint exists to steer people off the capture path. On the library row it
  // would be advising them to do what they are already doing.
  it("hints on the camera row only", () => {
    expect(SOURCE_HINTS.camera).toMatch(/Camera app/);
    expect(SOURCE_HINTS.library).toBeUndefined();
  });
});
