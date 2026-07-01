-- 012_soft_delete.sql
-- Adds deleted_at to public.users for soft-delete with 7-day grace period (Option C).
-- NULL = active account. Non-null = deletion requested at that timestamp.
--
-- Gate: middleware (src/middleware.ts) checks this column on every /app/* and
-- /account/* request. Within grace → /account/restore. Past grace → blocked.
-- Past-grace accounts are permanently blocked in v1; no automatic purge exists
-- (hard-delete sweep deferred to a future cron — see PRE-LAUNCH-KILLLIST.md).
--
-- No new RLS policy needed: "Users update own row" (010_display_name.sql) covers
-- writes to this column by the authenticated user via the request-scoped client.
-- The restore route clears it (SET deleted_at = NULL) under the same policy.
--
-- No index: always queried by user_id (PK); a deleted_at index would only serve
-- a bulk past-grace sweep query that does not exist in v1.

ALTER TABLE public.users
  ADD COLUMN deleted_at TIMESTAMPTZ;
