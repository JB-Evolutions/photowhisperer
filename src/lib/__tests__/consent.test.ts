import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CONSENT_STORAGE_KEY,
  readConsentChoice,
  writeConsentChoice,
  consentToGtagUpdate,
  shouldLoadAnalytics,
} from "../consent";

// vitest.config.ts runs this suite in the "node" environment (no jsdom), so
// localStorage isn't a real global here — stub a minimal in-memory Storage
// before each test rather than pulling in jsdom for one file.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  globalThis.localStorage = createMemoryStorage();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("readConsentChoice / writeConsentChoice", () => {
  it("returns null when nothing has been stored yet — banner should show", () => {
    expect(readConsentChoice()).toBeNull();
  });

  it("persists a granted choice", () => {
    writeConsentChoice("granted");
    expect(readConsentChoice()).toBe("granted");
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe("granted");
  });

  it("persists a denied choice", () => {
    writeConsentChoice("denied");
    expect(readConsentChoice()).toBe("denied");
  });

  it("treats an unrecognized stored value as absent", () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, "yes-please");
    expect(readConsentChoice()).toBeNull();
  });
});

describe("consentToGtagUpdate", () => {
  it("maps granted to all four Consent Mode v2 signals granted", () => {
    expect(consentToGtagUpdate("granted")).toEqual({
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
      analytics_storage: "granted",
    });
  });

  it("maps denied to all four Consent Mode v2 signals denied", () => {
    expect(consentToGtagUpdate("denied")).toEqual({
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
  });
});

describe("shouldLoadAnalytics", () => {
  it("is false when the measurement id is missing, empty, or blank", () => {
    expect(shouldLoadAnalytics(undefined)).toBe(false);
    expect(shouldLoadAnalytics(null)).toBe(false);
    expect(shouldLoadAnalytics("")).toBe(false);
    expect(shouldLoadAnalytics("   ")).toBe(false);
  });

  it("is true when a measurement id is present — GA no-ops silently otherwise", () => {
    expect(shouldLoadAnalytics("G-2D29M0MN87")).toBe(true);
  });
});
