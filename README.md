This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Mobile (Android APK)

The same codebase ships as an Android APK via Capacitor.

### Build the APK in the cloud (recommended)

1. In GitHub Settings → Secrets and variables → Actions, add two repository secrets:
   - `SUPABASE_URL` — same value as `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_ANON_KEY` — same value as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
2. Open the **Actions** tab → **Android APK** → **Run workflow**.
3. Download the `app-debug-apk` artifact when the run finishes. Sideload `app-debug.apk` onto an Android device (Settings → Apps → Install unknown apps → enable for your file manager).

The APK is unsigned (debug). For Play Store distribution, swap `assembleDebug` for `assembleRelease` in `.github/workflows/android-apk.yml` and add a signing-key step.

### Build the APK locally

```bash
# 1. Build the static export (writes to ./out)
npm run build:mobile

# 2. First time only — generate the android/ project
npm run cap:add

# 3. Copy the bundle into the Android project
npm run cap:sync

# 4. Open in Android Studio (build / run from there)
npm run cap:open
```

### PWA install (no APK needed)

When deployed over HTTPS, the app can be installed from Chrome on Android → menu → **Install app** / **Add to home screen**. The manifest at `/manifest.webmanifest` and the icons under `public/icons/` drive the installed-app branding.

**Scope note:** this is a home-screen install (manifest only) — there is **no service worker**, so the browser-installed version does not cache the shell and needs a connection to load. The Capacitor APK does not have this limitation: its bundle (HTML/JS/fonts/icons) ships inside the APK, so the shell opens offline and only the Supabase data calls need a network.

### App icons

Replace `resources/icon.png` (1024×1024) and optionally `resources/splash.png` (2732×2732) with your brand artwork. To regenerate every Android density variant after `cap:add`:

```bash
npx @capacitor/assets generate --android
```

## ⚠️ Security model (read before distributing the APK)

The app talks to Supabase with the **anon key**, and the current RLS policies (see `supabase/migrations/008` / `009`) grant that key **full read/write/delete** on `partners`, `trades`, `transactions`, and `active_stocks`. That was an acceptable dev-stage shortcut for a private web deployment, but note:

- The anon key is **baked into every APK and every web bundle**. Anyone who obtains the APK file can extract the key and read or modify the fund's entire books with any HTTP client.
- The `/api/reports/send-monthly` endpoint emails partner statements. Set the `REPORT_SECRET` env var in your deployment and send the same value in the `x-report-secret` header to lock it; without the env var the endpoint is open.

Before distributing the APK beyond trusted devices, move to Supabase Auth with owner-scoped RLS policies (each request authenticated, policies keyed to `auth.uid()`), and rotate the anon key afterwards.

### Enabling partner logins (the fix)

The code for authenticated access ships dormant. Activation order matters — flipping the switch early locks everyone out:

1. **Set `SUPABASE_SERVICE_ROLE_KEY`** in the web host's env (Supabase → Project Settings → API → service_role; never `NEXT_PUBLIC_`, never in the APK) and **deploy**. Nothing changes yet (`NEXT_PUBLIC_AUTH_ENFORCED` unset → app behaves as before; `/login` exists but is not required).
2. **Create accounts from the app**: Settings → **حسابات الشركاء** — one row per partner with a status badge. Enter an email, generate a password, click **إنشاء وربط**. Create the **GP's own account first** (a bootstrap rule allows exactly that before any account exists); every later action requires the GP to be signed in. Save each generated password — it is shown once.
   *(Fallback: manual Dashboard + linking SQL, documented in `supabase/migrations/013_auth_and_rls.sql`.)*
3. **Run `supabase/migrations/013_auth_and_rls.sql`** — replaces the permissive anon policies: authenticated partners read everything (`transactions`: own rows only), **only the GP writes**, anon reads nothing.
4. **Rebuild & redeploy** web with env `NEXT_PUBLIC_AUTH_ENFORCED=1`. For the APK: add a GitHub **Repository Variable** named `AUTH_ENFORCED` with value `1`, rerun the Android APK workflow, and distribute the new build. The app now requires sign-in; the GP gets the full terminal, each LP lands on their own details page (their stake, positions, and account statement).
5. **Rotate the anon key** after confirming everything works.
