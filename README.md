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

When deployed over HTTPS, the app is also a Progressive Web App. Open in Chrome on Android → menu → **Install app** / **Add to home screen**. The manifest at `/manifest.webmanifest` and the icons under `public/icons/` drive the installed-app branding.

### App icons

Replace `resources/icon.png` (1024×1024) and optionally `resources/splash.png` (2732×2732) with your brand artwork. To regenerate every Android density variant after `cap:add`:

```bash
npx @capacitor/assets generate --android
```
