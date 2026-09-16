// Repeatable investor-pitch screenshot pipeline. Captures element-scoped
// shots (via data-shot="<name>" attributes on target containers) into a
// fixed 2020x1020 (1.98:1) canvas at #1D1D1D — the deck's card colour, not
// the app's own background — matching the PowerPoint deck's picture
// placeholders.
//
// Auth is done once against a real Supabase account (PITCH_EMAIL /
// PITCH_PASSWORD) via the real /auth/signin UI, and the resulting
// storageState is cached at pitch/.auth.json (gitignored) so subsequent
// runs skip the login flow entirely.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";
import { mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.env.PITCH_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const PITCH_EMAIL = process.env.PITCH_EMAIL;
const PITCH_PASSWORD = process.env.PITCH_PASSWORD;

const OUTPUT_DIR = path.resolve(__dirname, "../pitch/screenshots");
const AUTH_FILE = path.resolve(__dirname, "../pitch/.auth.json");

const VIEWPORT = { width: 1440, height: 900 } as const;
const DEVICE_SCALE_FACTOR = 2;
// Force dark explicitly rather than inheriting the runner's OS/CI setting —
// the app's own theme (data-theme, driven by localStorage) defaults to dark
// independently of this, but the Chromium-level color-scheme hint should
// still be pinned so form controls / scrollbars render consistently.
const COLOR_SCHEME = "dark" as const;

const CANVAS_WIDTH = 2020;
const CANVAS_HEIGHT = 1020;
const LETTERBOX_COLOR = "#1D1D1D";

// Kills animations/transitions/caret blink and hides scrollbars before every
// capture. Injected fresh per navigation (addStyleTag does not survive a
// page.goto), so freeze() must be called again after any route change.
const FREEZE_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
  ::-webkit-scrollbar { display: none; }
`;

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

// Logs in once via the real /auth/signin form (not the ALLOW_TEST_LOGIN
// dev backdoor — that route is disabled outside NODE_ENV!=production builds
// and this pipeline should exercise the same path a real user does) and
// caches the resulting cookies/localStorage to AUTH_FILE. No-ops if that
// file already exists; delete it to force a fresh login.
async function ensureAuthState(): Promise<void> {
  if (await fileExists(AUTH_FILE)) return;

  if (!PITCH_EMAIL || !PITCH_PASSWORD) {
    throw new Error(
      "PITCH_EMAIL and PITCH_PASSWORD must be set (in .env.local or the environment) to create pitch/.auth.json.",
    );
  }

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      colorScheme: COLOR_SCHEME,
    });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/auth/signin`, { waitUntil: "networkidle" });
    await page.getByLabel(/email/i).fill(PITCH_EMAIL);
    await page.getByLabel(/^password$/i).fill(PITCH_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`${BASE_URL}/app`, { timeout: 15_000 });

    await mkdir(path.dirname(AUTH_FILE), { recursive: true });
    await context.storageState({ path: AUTH_FILE });
    await context.close();
  } finally {
    await browser.close();
  }
}

// The app serves a strict style-src 'self' CSP, which rejects addStyleTag's
// usual inline <style> injection outright. Routing FREEZE_CSS through a
// same-origin URL instead satisfies 'self' without touching the app's CSP
// or adding anything to its public/ directory — the request never reaches
// the real server, Playwright fulfills it directly from this script.
const FREEZE_CSS_URL_PATTERN = "**/__pitch-freeze.css";
const FREEZE_CSS_URL = "/__pitch-freeze.css";

async function newAuthedPage(browser: Browser): Promise<{ context: Awaited<ReturnType<Browser["newContext"]>>; page: Page }> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    colorScheme: COLOR_SCHEME,
    storageState: AUTH_FILE,
  });
  await context.route(FREEZE_CSS_URL_PATTERN, (route) =>
    route.fulfill({ contentType: "text/css", body: FREEZE_CSS }),
  );
  const page = await context.newPage();
  return { context, page };
}

// Deterministic-render gate: kills animations, waits for webfonts, then
// waits for network to go idle. No arbitrary sleeps.
async function freeze(page: Page): Promise<void> {
  await page.addStyleTag({ url: FREEZE_CSS_URL });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
}

// Screenshots a container and composites it onto a fixed 2020x1020
// LETTERBOX_COLOR canvas: resized to fit inside (never cropped, never
// stretched), then centered via sharp's `contain` fit, which pads with
// LETTERBOX_COLOR to reach the exact target dimensions in one pass.
//
// overlaySelector serves two purposes, both resolved via the same
// bounding-box union: (1) containers whose interesting state (an open
// autocomplete dropdown) is rendered by an absolutely positioned descendant
// that overflows the container's own layout box — Playwright's element
// screenshot clips to that box, so the overlay would otherwise be cut off;
// (2) spanning two independent in-flow siblings (e.g. the empty-state block
// and the composer bar below it) without needing a new DOM wrapper. When
// given, the capture clip is the union of `selector`'s box and the overlay
// selector's box instead of `selector`'s box alone.
async function captureShot(
  page: Page,
  selector: string,
  outputFile: string,
  overlaySelector?: string,
): Promise<void> {
  const target = page.locator(selector);
  const box = await target.boundingBox();
  if (!box) throw new Error(`${selector} not found or not visible`);

  let clip = box;
  if (overlaySelector) {
    const overlay = page.locator(overlaySelector);
    if ((await overlay.count()) > 0) {
      const overlayBox = await overlay.boundingBox();
      if (overlayBox) {
        const left = Math.min(box.x, overlayBox.x);
        const top = Math.min(box.y, overlayBox.y);
        const right = Math.max(box.x + box.width, overlayBox.x + overlayBox.width);
        const bottom = Math.max(box.y + box.height, overlayBox.y + overlayBox.height);
        clip = { x: left, y: top, width: right - left, height: bottom - top };
      }
    }
  }

  const raw = await page.screenshot({ clip });

  await mkdir(OUTPUT_DIR, { recursive: true });
  await sharp(raw)
    .flatten({ background: LETTERBOX_COLOR }) // source may carry alpha; flatten before pad
    .resize(CANVAS_WIDTH, CANVAS_HEIGHT, {
      fit: "contain",
      background: LETTERBOX_COLOR,
    })
    .png()
    .toFile(path.join(OUTPUT_DIR, outputFile));
}

interface ShotConfig {
  name: string;
  route: string;
  file: string;
  // CSS selector for the element to screenshot (usually a [data-shot="..."]
  // attribute added directly to the relevant component).
  selector: string;
  // Optional interaction to run after the route settles and before capture
  // (e.g. focus an input to open a dropdown, click a seeded session row).
  prepare?: (page: Page) => Promise<void>;
  overlaySelector?: string;
}

// Marker used by seed-pitch-data.ts for its demo session — clicking the
// sidebar row with this title loads the seeded, deterministic "ok" response
// that app-settings captures (see seed-pitch-data.ts SEEDED_SESSION_TITLE).
const SEEDED_SESSION_TITLE = "Golden hour backlit portrait";

const SHOTS: ShotConfig[] = [
  {
    // /onboarding/camera step 1 — the onboarding card only (§ approved:
    // "accept the pillarboxing, do NOT widen the container"). Clicking the
    // body field opens its suggestion dropdown, which overflows the card's
    // own layout box, hence the overlaySelector union.
    name: "body-picker",
    route: "/onboarding/camera",
    file: "body-picker.png",
    selector: '[data-shot="camera-picker"]',
    prepare: async (page) => {
      await page.locator("#camera-body").click();
    },
    overlaySelector: "#camera-body-listbox",
  },
  {
    // Same card, advanced to step 2: two lenses committed as chips, then the
    // lens field re-focused to reopen its dropdown for the shot. Typed text
    // matches real suggestions verbatim (see seed-pitch-data.ts CAMERA_LENSES)
    // so the chips read as plausible seeded gear, not placeholder text.
    name: "lens-picker",
    route: "/onboarding/camera",
    file: "lens-picker.png",
    selector: '[data-shot="camera-picker"]',
    prepare: async (page) => {
      await page.getByRole("button", { name: "Continue" }).click();
      const lensField = page.locator("#camera-lens");
      await lensField.fill("FE 85mm f/1.4 GM");
      await lensField.press("Enter");
      await lensField.fill("FE 24-70mm f/2.8 GM II");
      await lensField.press("Enter");
      await lensField.click();
    },
    overlaySelector: "#camera-lens-listbox",
  },
  {
    // /app default (empty) state — the "What are you shooting?" chips down
    // through the composer bar, sidebar and top banners excluded. Two
    // independent in-flow siblings, so the union-box mechanism stands in for
    // an "overlay" here (no absolutely positioned overflow involved).
    name: "app-scene",
    route: "/app",
    file: "app-scene.png",
    selector: '[data-shot="app-empty-state"]',
    overlaySelector: '[data-shot="app-composer"]',
  },
  {
    // /app with the seeded session loaded — captures only the AssistantResponse
    // "ok" block (SettingsCubes + ResponsePanels + ResponseActions), not the
    // user message bubble above it. getByTitle matches the sidebar button's
    // title attribute, which is stable regardless of the row's relative-time
    // text ("3m ago" etc.) drifting between runs. Scoped to `aside` because
    // MobileDrawer always mounts a second copy of Sidebar (for its slide-out
    // animation) even at desktop viewport, so the same title exists twice.
    name: "app-settings",
    route: "/app",
    file: "app-settings.png",
    selector: '[data-shot="app-settings"]',
    prepare: async (page) => {
      await page.locator("aside").getByTitle(SEEDED_SESSION_TITLE).click();
      await page.locator('[data-shot="app-settings"]').waitFor({ state: "visible" });
    },
  },
];

async function main(): Promise<void> {
  await ensureAuthState();

  const browser = await chromium.launch();
  try {
    for (const shot of SHOTS) {
      const { context, page } = await newAuthedPage(browser);
      try {
        await page.goto(`${BASE_URL}${shot.route}`, { waitUntil: "networkidle" });
        await freeze(page);
        if (shot.prepare) {
          await shot.prepare(page);
          await freeze(page);
        }
        await captureShot(page, shot.selector, shot.file, shot.overlaySelector);
        console.log(`✓ ${shot.name} -> pitch/screenshots/${shot.file}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
