# Crawlr

Happy hours and bar deals across Mumbai. See what's on now, nearest first, and plan a bar hop.

Plain static site, no build step: `index.html`, `styles.css`, `app.js`, and the bar list in `data/bars.json`.

## Run locally

```
npx serve .
```

Then open the URL it prints. (Opening `index.html` directly won't load the data file; it needs a local server.)

## Deploy

Import this repo at vercel.com/new. Framework preset: **Other**. No build command, output directory is the repo root. Every push to `main` redeploys.

## Updating bars

Everything lives in `data/bars.json`:

- **bars[]**: one entry per brand, with its `deals` and `outlets`.
- **deals[]**:
  - `days`: 0 = Sunday … 6 = Saturday.
  - `s` / `e`: start and end in 24h `HH:MM`. Times past midnight are fine (`"01:30"`).
  - `tags`: any of `2for1`, `late`, `women`, `perk`.
  - `conf`: `recent` or `older`.
  - `only`: limits a deal to outlets in those areas.
  - `approx`: true when the start time is a guess.
- **outlets[]**:
  - `area` must match a key in `areas`.
  - `ll`: `[lat, lng]`.
  - `status`: `open` (confirmed on Google with hours) or `unconfirmed`.

Bump `updated` when you re-check the list.
