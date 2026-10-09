# Reduced to Clear

A crowdsourced map of supermarkets with reduced-to-clear (yellow-sticker) items. Built for London first, with the data model ready to go global later.
Research behind it (data sources, chain reduction times, legal notes): [RESEARCH.md](RESEARCH.md).

## Features
- **Site-wide access gate.** Every page, API and photo sits behind an access password. The password lives in `.env` (`SITE_PASSWORD`) and is checked on the server only. Passing the gate sets a signed, httpOnly cookie that lasts 90 days. Changing the password logs everyone out. Failed attempts are rate-limited.
- **Browse without an account.** Anyone past the gate sees the map and the feed. The feed shows the newest posts first, with how long ago each was posted, the clock time, and the time the items were seen.
- **Your location and what's nearby.** Use "📍 Near me" (browser geolocation) or search a postcode or place (Nominatim), then pick a radius of 1, 3, 10 or 25 km. Posts and stores are filtered by distance.
- **Accounts protect against sabotage.** You must register to post, edit or delete your own posts, or mark a post "all gone". There are also hourly limits (10 posts, 30 all-gone marks), a honeypot field on the sign-up form, and checks that the time seen is within the last 24 hours and not in the future. Each post shows who posted it and who marked it all gone. An "all gone" mark can be undone by the poster or by whoever set it.
- **Post form.** Supermarket (chain list or "Other"), branch name, address, items, prices/notes, time seen, location (your location or pick on the map), country and city, and an optional photo. Photos are **only offered when `PHOTOS_ENABLED=true`**, because they need persistent file storage. When photos are off, the photo controls are hidden and the server accepts posts without photos (any file sent is ignored). Before upload, the browser resizes the photo and re-encodes it, which removes EXIF data including GPS. The post's currency comes from the country.
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
- Node 20+, Express 5, bcrypt for passwords, Multer for uploads, and Leaflet with OpenStreetMap tiles. The frontend is plain JavaScript with no build step.
- **Database (one async API in `src/db.js`, with two backends):**
  - **Turso / libSQL** (`@libsql/client`) when `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set. This is the free hosted option.
  - A **local SQLite file** via `sql.js` (WebAssembly, no native build) otherwise, saved to `data/rtc.sqlite`.
  - Both run the same numbered migrations, tracked in a `schema_migrations` table. Both seed stores on first start, using batched writes so seeding is fast against remote Turso. To change the schema, append a migration to `MIGRATIONS` and never edit an applied one.

## Run locally
```bash
cd reduced-to-clear
npm install
cp .env.example .env        # then set SITE_PASSWORD
npm start                   # http://localhost:3000 — on first start ~1,800 London stores are seeded from seeds/stores-london.json
```
The startup log shows the database backend, the schema version, whether photos are on, and whether it's running in local or hosted mode.

Environment settings (see `.env.example`):

| Var | Default | Notes |
|---|---|---|
| `SITE_PASSWORD` | — | **Required.** Password for the access gate. |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | unset | When set, the app uses Turso. If a remote URL is set without a token, the server refuses to start. |
| `SITE_SECRET` | generated | Signs the gate cookie. **Hosted mode** (remote Turso, or running on Render/Railway, or `HOSTED=true`): must be set in the environment. It is never written to disk, and the app refuses to start without it. Locally it is generated into `DATA_DIR/secret` if unset. |
| `PHOTOS_ENABLED` | off | Set to `true` only if uploads go to persistent storage. |
| `PORT` | 3000 | Set automatically by hosting platforms. |
| `DATA_DIR`, `DB_FILE`, `UPLOADS_DIR` | `./data`, `DATA_DIR/rtc.sqlite`, `./uploads` | Local storage paths. |

Store data:
- `npm run import-osm` refreshes stores from OpenStreetMap (Overpass).
- `npm run export-stores` rewrites `seeds/stores-london.json` from the database.
- The seed file is only imported when the stores table is empty.

## Deploy for free (Render free plan + Turso free plan, no subscriptions)

**1. Create the database on Turso** (free plan, no credit card: 5 GB storage, 500 million row reads and 10 million row writes per month, per https://turso.tech/pricing):
```bash
curl -sSfL https://get.tur.so/install.sh | bash      # install the Turso CLI (or use the web dashboard at app.turso.tech)
turso auth signup                                    # or: turso auth login
turso db create reduced-to-clear                     # optionally add --location <id> near London; `turso db locations` lists them
turso db show reduced-to-clear --url                 # → TURSO_DATABASE_URL (libsql://...)
turso db tokens create reduced-to-clear              # → TURSO_AUTH_TOKEN (keep it secret)
```
There's no need to create tables. The app runs its migrations and seeds the stores on first start.

**2. Deploy on Render** (free plan: https://render.com/docs/free):
1. Go to **New → Blueprint**, connect GitHub, and pick `dedomenici/reduced-to-clear` on the `main` branch.
2. Render reads `render.yaml` (free plan, Frankfurt region, no disk). It prompts for **SITE_PASSWORD**, **TURSO_DATABASE_URL** and **TURSO_AUTH_TOKEN**. `SITE_SECRET` is generated automatically.
3. Click **Apply**. The build runs `npm ci --omit=dev`, the app starts with `npm start`, and `/healthz` is checked. The first boot logs `DB: libsql-remote (schema v2) · photos disabled · hosted mode` and `Seeded 1803 stores`.
4. Open the `https://<service>.onrender.com` URL and enter the password.
5. Later pushes to `main` deploy automatically. Values marked `sync: false` are only asked for on first creation; change them later under **Environment**.

**Free-tier trade-offs:**
- **Cold starts:** Render's free service sleeps after 15 minutes without incoming requests. The next visit takes about a minute to wake it. There are 750 free instance hours per month per workspace, which is enough for one always-on service.
- **No data loss:** all posts, accounts and predictions live in Turso, so restarts, redeploys and sleeping don't lose data. Live-update clients reconnect on their own.
- **No photos:** the free plan has no persistent disk, so photos stay off. To add them later, set `PHOTOS_ENABLED=true` with persistent storage (a paid Render disk with `UPLOADS_DIR` on it), or add an object-storage backend such as R2 or S3. The upload code path is kept for this.
- **Turso limits:** if a free-plan limit is exceeded, Turso blocks the database until the next month or until you upgrade. That's far beyond this app's expected use.

### Railway (alternative, has a free trial but not a permanent free tier)
Use the same steps with the same environment variables (`SITE_PASSWORD`, `SITE_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`): **New Project → Deploy from GitHub repo**, add the variables, then **Settings → Networking → Generate Domain**.

## Test
```bash
npm test                    # API tests on an in-memory local SQLite DB (gate, auth, posting+photo, photos-disabled mode, hosted-mode secret rules, SSE, permissions, validation, rate limits, migrations, seeding, predictions, DST)
npm run test:libsql         # the same API tests through @libsql/client (the Turso driver) against a local file: URL
npm run test:ui             # headless Chrome (desktop, photos disabled): gate → register → post (photo UI hidden) → second browser gets live NEW post → all gone
npm run test:mobile         # 390x844 touch emulation (photos enabled): layout, touch targets, bottom sheet, full-screen form, camera input, PWA; writes test/screenshot-mobile*.png
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
- CSRF tokens (cookies are SameSite=Lax and `secure` over HTTPS for now), and photo storage on S3 or R2 with image scanning.
- A commercial tile provider instead of tile.openstreetmap.org (OSMF tile usage policy), plus Postgres/PostGIS for scale.
- A UK GDPR privacy notice and retention policy for accounts, locations and photos.
