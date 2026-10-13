# Hadi Capital / هادي كابيتال

Activity descriptor: **إدارة الاستثمار** (investment management).

## Visual system

| Role | Color |
| --- | --- |
| Brand navy | `#062E58` |
| Brand blue | `#0665C7` |
| Brand teal | `#009D8A` |
| Brand paper | `#F4F7FA` |
| Dark app background | `#061727` |
| Card surface | `#0B2036` |
| Filled button blue | `#075BB7` |

The button blue is darker than the brand accent so small white labels remain legible. Gains and positive status indicators use teal; losses and destructive actions retain red. Allocation charts keep distinct series colors.

The interface uses the existing bundled **Thmanyah Sans** for Arabic and Latin headings and UI. Financial values retain the existing monospace font stack. The app remains Arabic RTL.

`public/brand/hadi-capital-mark.svg` is a vector interpretation of the supplied small raster emblem, with four ascending rounded columns and its open lower arc. `public/brand/hadi-capital-icon.svg` adds a light tile for browser-tab legibility. The shared `BrandLockup` component presents the Arabic name, English name and activity descriptor. The SVG interpretation can be replaced with an original vector master if one becomes available.

The dark interface extends the concept palette through navy surfaces, blue navigation/actions and teal financial indicators. On mobile, navigation opens in a drawer; on desktop it retains the persistent collapsible sidebar. Existing report templates use the new name and palette.

## Validation

- Production build and TypeScript compilation pass.
- Browser checks use isolated fictional Supabase responses, not production credentials. The seven UI routes render without browser errors; mobile drawer navigation, Escape, focus return and desktop collapse/expand pass.
- Dashboard viewport checks cover 360, 390, 768, 1024, 1280, 1440 and 1536 pixels.
- The existing lint baseline has eight errors and five warnings. This change introduces no additional errors; it does not refactor unrelated data hooks or calculations.
- The dependency lock file is synchronized with the existing package manifest, which already replaced Resend with Nodemailer.

Production data connectivity and email delivery are not exercised by the visual preview.
