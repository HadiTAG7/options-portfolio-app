# Hadi Capital / هادي كابيتال

Activity descriptor: **إدارة الاستثمار** (investment management).

## Visual system

| Role | Color |
| --- | --- |
| Brand navy | `#062E58` |
| Brand blue | `#0665C7` |
| Brand teal | `#009D8A` |
| Brand paper | `#F4F7FA` |
| Dark app background | `#080C16` |
| Card surface | `#0B111E` |
| Filled button blue | `#075BB7` |

The button blue is darker than the brand accent so small white labels remain legible. Gains and positive status indicators use teal; losses and destructive actions retain red. Allocation charts keep distinct series colors.

The interface uses the existing bundled **Thmanyah Sans** for Arabic and Latin headings and UI. Financial values retain the existing monospace font stack. The app remains Arabic RTL.

`public/brand/hadi-capital-mark.svg` is a vector interpretation of the supplied small raster emblem, with four ascending rounded columns and its open lower arc. `public/brand/hadi-capital-icon.svg` adds a light tile for browser-tab legibility. The shared `BrandLockup` component presents the Arabic name, English name and activity descriptor. The SVG interpretation can be replaced with an original vector master if one becomes available.

The dark interface uses near-black navy surfaces sampled from the provided dashboard reference: background `#080C16` and cards `#0B111E`. Blue navigation/actions and teal financial indicators carry the Hadi Capital identity. On mobile, navigation opens in a drawer; on desktop it retains the persistent collapsible sidebar. Existing report templates use the new name and palette.

## Validation

- Production build and TypeScript compilation pass.
- Apply this identity to the current production branch `claude/write-app-prompt-8V4uK`, which uses the existing Firebase data and authentication integration.
- Preserve data hooks, backend configuration, partner calculations, API behavior, currency selection, authentication and the light-theme option.
- Confirm authenticated portfolio and partner pages render actual records after release. A successful build or a styled page alone does not confirm data connectivity.

Email delivery is not exercised by visual verification.
