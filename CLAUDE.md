# PhotoWhisperer — Claude Code Instructions

## Package manager
Always use pnpm. Never use npm or yarn for installs, script execution, or lockfile operations.

## Working directory
/Volumes/Jayden SSD/Claude/PhotoWhisperer/

## Database migrations
Migration files live in `supabase/migrations/`. Numbered to match arch-spec-v3.1.md §8.
Gaps at 002 and 003 are intentional — those numbers are reserved for tier-rename
migrations that would have existed on a v3.0 → v3.1 upgrade path. This project
started fresh (no v3.0 schema), so they are permanently skipped on disk.

**To apply migrations:** `supabase db push` from the project root. Requires the
brew-installed Supabase CLI (`/opt/homebrew/bin/supabase`), which must be logged
in (`supabase login`) and linked to project ref `ifalgbjwpmtpjaxdaidp`. The CLI
prompts for the database password (separate from the access token) — find it at
Supabase dashboard → Project Settings → Database → Database password.

**Creating test users:** Do NOT insert directly into `auth.users`. Use Supabase
dashboard → Authentication → Users → Add user, with "Auto Confirm User" checked.
The `handle_new_user` trigger (defined in `006_credit_balances.sql`) automatically
inserts into `public.users`, `public.subscriptions` (tier='snapshot'), and
`public.credit_balances` (credits_remaining=0). The trigger uses `SECURITY DEFINER`
with `search_path` pinned to `public`. It fires `AFTER INSERT ON auth.users`.

**Quota function:** `check_and_increment_quota_with_credits(user_id, month, year,
tier_limit)` atomically increments `usage_tracking` and consumes from
`credit_balances` when the monthly limit is exceeded. Tier limit values live in
`TIER_LIMITS` in `src/lib/quota.ts`: snapshot=5, portrait=500, studio=2000.

**Test script:** `supabase/test-phase2.sql` — re-runnable (resets state at top
before assertions). Substitute the test user's UUID before running in the SQL Editor.

**RLS UPDATE policies:** Every `FOR UPDATE` RLS policy must have BOTH a `USING` and a `WITH CHECK` clause with the same condition (typically `auth.uid() = user_id`). `USING` controls which rows can be targeted by the UPDATE; `WITH CHECK` controls what values can be written after the update. Without `WITH CHECK`, a user could update their own row and set `user_id` to point at another user's UUID, overwriting that user's data. Apply this pattern to every UPDATE policy in every migration.

## Reference docs
Read these before starting any phase of work:
- `arch-spec-v3.1.md` — system architecture, DB schema, API contracts
- `screen-spec-v1.md` — UI/UX spec, every screen and state
- `build-steps-v2.md` — phase roadmap and scope boundaries

## Tailwind
Tailwind v4 only. Never suggest or use Tailwind v3 patterns (`tailwind.config.js`, `@apply`, `theme()` function, `extend` blocks). All configuration is CSS-first via `@theme` in `src/app/globals.css`.

## Design tokens
All colors, spacing, and typography must come from the CSS variables defined in `src/app/globals.css`. Do not improvise values or use hardcoded hex colors. Match the tokens exactly.

## Stable code
`src/api/` and `src/calculator/` are treated as stable. Do not modify files in these directories unless a build phase explicitly calls for it.

## Tests
Run `pnpm exec vitest run` before every commit. All 27 tests must pass. Do not modify test files to make tests pass.

## Commit messages
No Co-Authored-By lines. No AI attribution of any kind. Write commit messages as if authored by the project team.

## Risky operations
Before any `rm -rf`, mass `git rm`, database migration, or schema-altering operation, list the affected files/rows and stop to wait for explicit user confirmation. Do not chain risky operations into a single command.

## External SSD note
Working directory is on an external SSD that may unmount during system sleep. If a shell command returns "Working directory was deleted; shell cwd recovered" — just re-issue the command with the full `cd "/Volumes/Jayden SSD/Claude/PhotoWhisperer"` prefix. Not a real error.

## Secrets
Real secrets (Supabase sb_secret keys, Stripe secret keys, Anthropic API key) live ONLY in `.env.local` (gitignored) and Vercel project env vars. Never commit `.env.local`. Never use `NEXT_PUBLIC_` prefix on any secret-class key — that prefix exposes the value to the browser bundle.

## Phase boundaries
Do not pre-create files, folders, or scaffolding from the architecture spec that aren't required by the current build phase. Structure grows organically as phases need it. The full spec §8 file tree is the END state, not the starting state.
