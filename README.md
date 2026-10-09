# Reduced to Clear

A crowdsourced map of supermarkets with reduced-to-clear (yellow-sticker) items. Built for London first, with the data model ready to go global later.
Research behind it (data sources, chain reduction times, legal notes): [RESEARCH.md](RESEARCH.md).

## Features
- **Site-wide access gate.** Every page, API and photo sits behind an access password. The password lives in `.env` (`SITE_PASSWORD`) and is checked on the server only. Passing the gate sets a signed, httpOnly cookie that lasts 90 days. Changing the password logs everyone out. Failed attempts are rate-limited.
- **Browse without an account.** Anyone past the gate sees the map and the feed. The feed shows the newest posts first, with how long ago each was posted, the clock time, and the time the items were seen.
- **Your location and what's nearby.** Use "📍 Near me" (browser geolocation) or search a postcode or place (Nominatim), then pick a radius of 1, 3, 10 or 25 km. Posts and stores are filtered by distance.
- **Accounts protect against sabotage.** You must register to post, edit or delete your own posts, or mark a post "all gone". There are also hourly limits (10 posts, 30 all-gone marks), a honeypot field on the sign-up form, and checks that the time seen is within the last 24 hours and not in the future. Each post shows who posted it and who marked it all gone. An "all gone" mark can be undone by the poster or by whoever set it.
- **Post form.** Supermarket (chain list or "Other"), branch name, address, items, prices/notes, time seen, location (your location or pick on the map), country and city, and a photo. Before upload, the browser resizes the photo and re-encodes it, which removes EXIF data including GPS. The post's currency comes from the country.
- **Live updates.** New posts arrive over Server-Sent Events (`/api/stream`). If the stream drops, the page checks for new posts every 30 seconds instead. New posts play a ping (turn it on with "🔔 Sound on", because browsers block audio until you interact with the page) and get a red **NEW** sticker. Posts made since your last visit are also marked NEW.
- **Predictions, always labelled PREDICTION.** These show as dashed purple pins with a "PREDICTION" tag in the popup, plus a week view.
  - *Chain typical:* reduction windows for 10 UK chains, seeded from `seeds/chain-predictions.json`. Each comes from a source cited in RESEARCH.md and carries a confidence level.
  - *Learned:* once a store has 3 or more community reports, the app builds a day-of-week × hour histogram from the "time seen" values, using the store's local timezone. For a given day it scores each hour as: that day's count + 0.25 × the counts on other days of the same kind (weekday or weekend) + 0.05 × the rest. Hours scoring at least 50% of the peak are grouped into windows. Confidence is low under 6 reports, medium from 6 to 14, and high at 15 or more.
- **Stores.** About 1,800 London supermarkets were imported from OpenStreetMap (© OpenStreetMap contributors, ODbL). Posts at a store of the same chain within 150 m are attached to that store; otherwise a new store is created.
- **Ready for other countries.** `country`, `city`, `currency` and `timezone` are stored on posts and stores. Add countries and cities in `src/config.js`, and add chain windows to the seeds file with `country` set.

## Mobile & installable (PWA)
- **Phones (≤800 px):**
  - The map fills the screen and the feed is a **bottom sheet**. Tap or drag the handle to open or close it. The handle shows how many reductions are nearby and how many are new.
  - A floating **＋** button opens the post form.
  - The header collapses to icons. The search field takes up the full width of its row.
- **Touch targets** are at least 44 px. Form inputs use 16 px text, so iOS doesn't zoom in. Safe-area insets are respected (`viewport-fit=cover`).
- **Post form** opens full screen with a sticky Post/Cancel bar. **📷 Take photo** uses `accept="image/*" capture="environment"` to open the rear camera. **🖼 Choose photo** picks from the gallery. A preview shows the chosen photo, and you can remove it.
- **"Pick on map"** closes the form and shows a "Tap the map" banner with a Cancel button.
- **PWA:**
  - `manifest.webmanifest` sets standalone display and the theme colour, with icons at 192, 512 and 512 maskable, plus an Apple touch icon and a favicon (`public/icons/`).
  - A minimal `sw.js` shows an offline page. It deliberately caches nothing, so posts stay live and the gate keeps working.
  - The manifest, icons and `sw.js` are the only files served before the access gate. That is required for "Add to Home Screen".
  - Installing needs HTTPS (or localhost).

## Stack
Node 20+, Express, SQLite via `sql.js` (WASM, no native build; the database is saved to `data/rtc.sqlite`), Multer for uploads, bcrypt for passwords, Leaflet with OpenStreetMap tiles. The frontend is plain JavaScript with no build step.

## Run
```bash
cd reduced-to-clear
npm install
cp .env.example .env        # then set SITE_PASSWORD
npm start                   # http://localhost:3000 — on first start ~1,800 London stores are seeded from seeds/stores-london.json
```
Environment settings (see `.env.example`):
- `SITE_PASSWORD` (required; the server refuses to start without it)
- `SITE_SECRET` (optional; otherwise a random one is generated in `DATA_DIR/secret`)
- `PORT` (default 3000; hosting platforms set this for you)
- `DATA_DIR` (default `./data`; holds the database, secret and, when set, uploads)
- `DB_FILE` and `UPLOADS_DIR` (optional overrides)

Store data:
- `npm run import-osm` refreshes stores from OpenStreetMap (Overpass).
- `npm run export-stores` rewrites `seeds/stores-london.json` from the database.
- The seed file is only imported when the stores table is empty.

## Deploy

### Render (blueprint included: `render.yaml`)
1. In Render, go to **New → Blueprint** and connect GitHub. Pick this repository and keep the `main` branch.
2. Render reads `render.yaml`. When asked for **SITE_PASSWORD**, enter the gate password. `SITE_SECRET` is generated for you.
3. Click **Apply**. Render runs `npm ci --omit=dev` and then `npm start`, and checks `/healthz`. On first boot it seeds the stores onto the disk at `/var/data`.
4. Open `https://reduced-to-clear.onrender.com` (or whatever URL Render assigns) and enter the password.
5. Later commits to `main` deploy automatically. To change the password, edit **Environment → SITE_PASSWORD** and save; this redeploys and logs everyone out of the gate.

**Free vs paid:**
- The blueprint uses a paid plan with a 1 GB persistent disk, so posts, accounts and photos are kept.
- Render's free web services **cannot attach disks**. On free, set `plan: free`, remove the `disk:` block and `DATA_DIR`. All user data is then lost whenever the service restarts, redeploys or sleeps after inactivity. Stores re-seed automatically.
- A disk also limits the service to one instance and disables zero-downtime deploys, which is fine at this scale.
- The longer-term fix is to move to Postgres and object storage (for example S3 or R2) for photos.

### Railway (alternative)
1. Go to **New Project → Deploy from GitHub repo** and pick this repository. Nixpacks detects Node, runs `npm ci`, then `npm start`. `PORT` is set automatically.
2. Under **Variables**, add `SITE_PASSWORD`, `SITE_SECRET` (any long random string) and `DATA_DIR=/data`.
3. Right-click the service, choose **Attach Volume** and set the mount path to `/data`.
4. Under **Settings → Networking**, click **Generate Domain**.

## Test
```bash
npm test                    # API tests on an in-memory DB (gate, auth, posting+photo, SSE, edit/gone permissions, validation, rate limits, predictions, timezone/DST)
npm run test:ui             # headless Chrome (desktop): gate → register → post → second browser gets live NEW post → all gone
npm run test:mobile         # 390x844 touch emulation: layout, touch targets, bottom sheet, full-screen form, camera input, PWA; writes test/screenshot-mobile*.png
```
The browser tests start their own server on a spare port using a **copy** of `data/rtc.sqlite`, so real data is never touched. Uploaded test photos are removed afterwards. They need Chrome (`CHROME_PATH`, default `/usr/bin/google-chrome`).

## API (all routes need the gate cookie)
| Method | Path | Notes |
|---|---|---|
| POST | /gate | form field `password` |
| POST | /api/register, /api/login, /api/logout · GET /api/me | session cookie |
| GET | /api/posts?lat&lng&radius_km&hours=48&include_gone=1 | newest first |
| POST | /api/posts | multipart; login required |
| PATCH/DELETE | /api/posts/:id | own posts only |
| POST/DELETE | /api/posts/:id/gone | login required |
| GET | /api/stores?lat&lng&radius_km&at | stores with today's prediction |
| GET | /api/stores/:id/predictions | 7-day prediction view |
| GET | /api/stream | SSE: `post`, `update`, `delete` |

## Before going public (not done in prototype)
- Email verification and/or phone or OAuth sign-in; reporting and moderation; trust scores (for example, LiveCheaper-style multi-report verification).
- HTTPS with `secure` cookies, CSRF tokens (cookies are SameSite=Lax for now), and image scanning and storage on S3 or similar.
- A commercial tile provider instead of tile.openstreetmap.org (OSMF tile usage policy), plus Postgres/PostGIS for scale.
- A UK GDPR privacy notice and retention policy for accounts, locations and photos.
