# Authentication & RLS lockdown — cutover runbook

This app previously ran with **no authentication** and **fully open RLS**
(`using(true) with check(true)` for the `anon` role), which meant anyone with
the public site URL could read, edit, or delete every investor's data via the
Supabase REST API. This change adds email/password auth and locks the database
so only authenticated users can access data.

## What changed in the code

- `src/app/login/page.tsx` — email/password login screen.
- `src/hooks/use-auth.ts` + `src/components/auth/auth-guard.tsx` — session
  tracking and a client-side guard wrapped around `AppShell`, so every app
  page redirects to `/login` without a session.
- `src/components/layout/top-bar.tsx` — a sign-out button.
- `src/app/api/reports/send-monthly/route.ts` — now requires a valid
  `Authorization: Bearer <access_token>` and reads the DB as that
  authenticated user (was an unauthenticated endpoint).
- `supabase/migrations/015_lock_rls_to_authenticated.sql` — replaces the
  anon-open policies with **authenticated-only** policies and revokes anon
  `EXECUTE` on `recalculate_ownership()`.

> The database RLS (migration 015) is the real security boundary. The
> client-side guard is only for UX — even if it is bypassed, the anon role is
> denied at the database.

## ⚠️ Cutover order — do this exactly to avoid locking yourself out

Migration 015 denies the `anon` role. If you run it **before** an admin user
exists and the login-enabled build is live, the app will correctly show no
data (because you are not yet authenticated). So:

1. **Enable email auth.** Supabase dashboard → **Authentication → Providers →
   Email → enable.**
2. **Create your admin user(s).** Supabase dashboard → **Authentication →
   Users → Add user** (email + password). If "Confirm email" is enabled,
   either confirm the address or turn confirmation off while you set up.
3. **Deploy this branch** (the build that contains `/login`).
4. **Log in once** at `/login` to confirm auth works and you can see data.
5. **Run migration 015** (`supabase/migrations/015_lock_rls_to_authenticated.sql`)
   in the Supabase SQL editor. From here on, the anon key can read/write
   nothing; only logged-in users can.
6. Verify: open the site in a logged-out/incognito window → you should be
   redirected to `/login` and, if you hit the REST API directly with the anon
   key, get empty/denied responses.

### Rollback (if needed)

Re-running migration 008 + 009 restores the previous `anon, authenticated`
policies. Nothing in 015 deletes data, so a rollback only widens access again.

## Recommended follow-up (not done here)

- Add a **server-only `SUPABASE_SERVICE_ROLE_KEY`** (never `NEXT_PUBLIC_`) and
  move server routes to it, so trusted server code has its own credential.
- Consider per-role policies if you later add non-admin users.

---

## Management-fee alignment (fee = 20%)

You confirmed **20%** is the correct management fee. New partners already get
20% (`addPartner` in `src/hooks/use-partners.ts`). Older partners were
backfilled to ~1.25% (from `management_fee_rate`) by migration 002, so their
stored `managementFeePercent` may still read 1.25.

This is **not changed automatically** — it edits existing partner records, so
it is yours to run when ready. To review who is on a non-20% fee:

```sql
select id, name, "managementFeePercent", management_fee_rate
from public.partners
where archived_at is null
  and coalesce("managementFeePercent", management_fee_rate) is distinct from 20;
```

To set all active partners to 20% (optional — review the list above first):

```sql
update public.partners
   set "managementFeePercent" = 20
 where archived_at is null
   and "managementFeePercent" is distinct from 20;
```

You can also change any single partner's fee from the app's **Edit Partner**
dialog, which writes `managementFeePercent` directly.
