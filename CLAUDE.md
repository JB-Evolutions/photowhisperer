# PhotoWhisperer — Claude Code Instructions

## Package manager
Always use pnpm. Never use npm or yarn for installs, script execution, or lockfile operations.

## Working directory
/Volumes/Jayden SSD/Claude/PhotoWhisperer/

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
