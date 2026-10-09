# Reduced to Clear

A crowdsourced map of supermarkets with reduced-to-clear (yellow-sticker) items. Started in London; works anywhere in the world.
Research behind it (data sources, chain reduction times, legal notes): [RESEARCH.md](RESEARCH.md).

## Features
- **Site-wide access gate.** Every page, API and photo sits behind an access password. The password lives in `.env` (`SITE_PASSWORD`) and is checked on the server only. Passing the gate sets a signed, httpOnly cookie that lasts 90 days. Changing the password logs everyone out. Failed attempts are rate-limited.
- **Browse without an account.** Anyone past the gate sees the map and the feed. The feed shows the newest posts first, with how long ago each was posted, the clock time, and the time the items were seen.
- **Your location and what's nearby, anywhere.** The map has no fixed city or bounds. On the first visit it asks for your location and centres there; if you decline, it shows the world map with the latest posts worldwide and a hint to tap "📍 Near me" or search (Nominatim). Your last location is remembered. Pick a radius of 1, 3, 10 or 25 km; posts and stores are filtered by distance.
- **Accounts protect against sabotage.** You must register to post, edit or delete your own posts, or mark a post "all gone". There are also hourly limits (10 posts, 30 all-gone marks), a honeypot field on the sign-up form, and checks that the time seen is within the last 24 hours and not in the future. Each post shows who posted it and who marked it all gone. An "all gone" mark can be undone by the poster or by whoever set it.
- **Post form.** Nearby store (from OpenStreetMap) or a new one (chain list for the country, or "Other" with any name), branch name, address, optional town/city, items, prices/notes, time seen, location (your location or pick on the map), and an optional photo. Posting works at any location. **Country, time zone and currency are worked out offline from the coordinates** and shown in the form (e.g. "France · EUR · Europe/Paris"); the price placeholder uses that currency. **Photos** are stored as BLOBs in the database (`photos` table) when running on Turso, so they work on free hosting with no disk. Locally they default to files in `uploads/`. Before upload, the browser resizes and re-encodes the photo (max 1280px, stepping JPEG quality down) until it fits the **300 KB cap**. The server then checks the real file type (JPEG, PNG or WebP only), **strips EXIF/GPS, XMP, comments and text metadata**, and enforces the cap again. Photos are served only through the gated route `/photos/:key` with `Cache-Control: private, max-age=31536000, immutable` and an ETag (304 on revalidation). Deleting a post deletes its photo, and photos older than `PHOTO_RETENTION_DAYS` (30) are deleted automatically while the post stays. When photos are off (`PHOTOS_ENABLED=false`), the photo controls are hidden and the server accepts posts without photos (any file sent is ignored).
- **Live updates.** New posts arrive over Server-Sent Events (`/api/stream`). If the stream drops, the page checks for new posts every 30 seconds instead. New posts play a ping. Sound is on by default and turning it off with the 🔔 toggle is remembered (browsers still block audio until you interact with the page) and get a red **NEW** sticker. Posts made since your last visit are also marked NEW.
- **First load is local only.** The app loads posts, stores and predictions for your own area: your saved or current location, or London if location is refused, unavailable or unanswered after 12 s. It never loads the worldwide feed or other areas until you pan or zoom the map, search a place or tap "Near me". Panning or zooming then loads the area in view, debounced. When zoomed out past about 50 km, it shows the latest posts everywhere and no store pins.
- **Beep on load.** One checkout beep plays when the app has loaded, if sound is on. It plays straight away if the browser allows audio (Chrome counts the gate form submit as interaction), otherwise on your first tap or key press.
- **English names next to non-Latin store names** (`public/names.js`), e.g. `全聯福利中心 (PX Mart)`, `イオン (AEON)`. The English comes from OSM `name:en`, else `brand:en` (stored as `stores.name_en`), else our known-chain mapping. Nothing is machine-translated, so unknown chains stay as they are. Used on pins, popups, the feed, the post form's nearby-store list and alerts.
- **Logo:** a yellow sticker with our own trolley drawing (inline SVG, `public/icons/trolley.svg`) and the dot-matrix font **Doto** (SIL OFL 1.1; self-hosted Latin subset in `public/fonts/` with its licence). On phones and narrow desktops the text sits on two lines. The PWA icons are rendered from the same artwork by `npm run make-icons`.
- **Local "reductions starting" alerts** (`public/alerts.js`, unit-tested in `test/alerts.test.js`). When a store on your map view starts having reductions, the app plays a short synthesised checkout **beep** (Web Audio, one ~1.35 kHz square blip, no audio sample). That store's pin then **pulses for about 60 seconds** and stays highlighted, and a toast names the store. Two things trigger it: (a) a new community post at the store; (b) the store's predicted window starting now, meaning in the last 10 minutes, store-local time. The toast for (b) is labelled **PREDICTION**. Alerts fire only for stores inside the visible map bounds at city zoom or closer (zoom ≥ 10, or under about 60 km across), never at regional or national zoom. There is at most one beep per 10 seconds, and bursts are merged into one beep. Cities can have many stores, so at most 8 pins pulse at once and the rest are just highlighted. Each store fires once per window (posts: once an hour; predictions: once per predicted window per day). The existing 🔔 toggle controls the sound. Posts outside the local view still get the old two-note ping. `prefers-reduced-motion` turns off the pulse but keeps the highlight.
- **Predictions, always labelled PREDICTION.** These show as dashed purple pins with a "PREDICTION" tag in the popup, plus a week view.
  - *Chain typical:* reduction windows seeded from `seeds/chain-predictions.json`, per country: 10 UK chains, plus Ireland (Tesco, Aldi, Lidl, M&S, SuperValu) and Australia (Woolworths, Coles). Chains in other countries are only added when a published source gives times. Each comes from a source cited in RESEARCH.md and carries a confidence level.
  - *Generic estimate (low confidence):* for any store worldwide with OSM `opening_hours` and no learned or timed chain window, the last 2 hours before that day's closing time. Shown as fainter dotted pins and labelled "Generic estimate". 24-hour stores, past-midnight closing and unparseable hours get no estimate. The parser handles the common forms (`Mo-Sa 07:00-22:00; Su 10:00-16:00`, `24/7`, `off`, several ranges); rules with months, dates, holidays or sunrise are skipped.
  - Times are in the store's local time zone; the popup says so when it differs from yours.
  - *Learned:* once a store has 3 or more community reports, the app builds a day-of-week × hour histogram from the "time seen" values, using the store's local timezone. For a given day it scores each hour as: that day's count + 0.25 × the counts on other days of the same kind (weekday or weekend) + 0.05 × the rest. Hours scoring at least 50% of the peak are grouped into windows. Confidence is low under 6 reports, medium from 6 to 14, and high at 15 or more.
- **Stores anywhere, from OpenStreetMap on demand** (© OpenStreetMap contributors, ODbL; attributed on the map and in the feed). When someone looks at an area the app hasn't seen, the server fetches `shop=supermarket` (plus branded `shop=convenience`) for the surrounding 0.25° tiles from the Overpass API and caches them in the database (`osm_tiles`, refreshed after 30 days). The client shows "Loading supermarkets…" and asks again while a fetch is running. Fair use, per the Overpass guidelines (https://dev.overpass-api.de/overpass-doc/en/preface/commons.html: about 10,000 requests and 1 GB per day at most):
  - one request at a time with a 2 s gap; at most 4 new tiles per page load; 30 new tiles per IP per hour; 500 Overpass requests per day in total
  - a failed tile is retried after 1, 3, 10, 30, then 60 minutes; an endpoint that answers 429 or 504 (load shedding) is skipped for 60 s and the next endpoint is tried. Queries declare a small `[timeout:25][maxsize:64MiB]` so busy servers admit them sooner. If OSM is unavailable the page says so and retries.
  - a `User-Agent: ReducedToClear/1.0 (+<site URL>)` header; fallback public instances (maps.mail.ru, private.coffee, kumi.systems) tried in order. An endpoint that's unreachable is skipped for 5 minutes. On 9 Oct 2026, overpass-api.de refused connections from Render, so the live site uses the fallbacks.
  - The same guidelines say that an app for the general public shouldn't rely on the public Overpass servers as its backend. That's fine for this private prototype with caching, but see "Before going public".
  - ~1,800 London stores are still seeded on first start so London works with no Overpass calls. Posts at a store of the same chain within 150 m are attached to that store; otherwise a new store is created.
- **Offline geography.** Country from `@rapideditor/country-coder` (boundary data bundled), time zone from `@photostructure/tz-lookup`, currency from a CLDR-derived table (`seeds/country-currency.json`, rebuilt with `node scripts/build-currency.js`). No external lookups. At sea the country is `ZZ` and the currency `XXX`.
- **Low database reads.** Stores and posts carry a grid `cell` (0.1° × 0.1°) with indexes, and bounding-box queries become a few `cell BETWEEN` ranges plus an exact lat/lng filter (with antimeridian wrap). The old lat/lng index scanned a latitude band around the whole planet, so it was dropped. Tests check the query plan uses the cell indexes. OSM tile status is kept in memory as well as in the database.
- **i18n-ready.** All client UI text is in `public/i18n.js` (`en`), with `{placeholders}`, plural forms (Intl.PluralRules), the locale picked from the browser, and money/country names formatted with `Intl`. To add a language, add a block. Server error messages and the gate page are still English.

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
| `PHOTOS_ENABLED` | on with `db` storage, off with `disk` | `false` turns photos off. With disk storage, set `true` only if `UPLOADS_DIR` is persistent. |
| `PHOTO_STORAGE` | `db` if Turso is set, else `disk` | `db` = BLOB table in the database; `disk` = files in `UPLOADS_DIR`. |
| `MAX_PHOTO_KB` | 300 | Per-photo cap, measured after metadata is stripped. |
| `PHOTO_RETENTION_DAYS` | 30 | Older photos are deleted (the post stays). |
| `OSM_ON_DEMAND` | on | `false` turns off on-demand Overpass fetching. |
| `OVERPASS_URLS` | overpass-api.de, maps.mail.ru (VK), overpass.private.coffee, overpass.kumi.systems | Comma-separated public Overpass endpoints, tried in order. |
| `OVERPASS_MIN_INTERVAL_MS` / `OVERPASS_DAILY_MAX` / `OSM_NEW_TILES_PER_IP_HOUR` | 2000 / 500 / 30 | Rate limits. |
| `OSM_CACHE_DAYS` / `OSM_WAIT_MS` | 30 / 8000 | Tile refresh age, and how long `/api/stores` waits for a fetch before answering "pending". |
| `PUBLIC_URL` | `RENDER_EXTERNAL_URL` | Used in the Overpass User-Agent. |
| `PORT` | 3000 | Set automatically by hosting platforms. |
| `DATA_DIR`, `DB_FILE`, `UPLOADS_DIR` | `./data`, `DATA_DIR/rtc.sqlite`, `./uploads` | Local storage paths. |

Store data:
- Stores for any area load on demand (above). `npm run import-osm -- --bbox s,w,n,e` bulk-imports an area (default: Greater London).
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
3. Click **Apply**. The build runs `npm ci --omit=dev`, the app starts with `npm start`, and `/healthz` is checked. The first boot logs `DB: libsql-remote (schema v3) · photos enabled (db) · hosted mode` and `Seeded 1803 stores`.
4. Open the `https://<service>.onrender.com` URL and enter the password.
5. Later pushes to `main` deploy automatically. Values marked `sync: false` are only asked for on first creation; change them later under **Environment**.

**Free-tier trade-offs:**
- **Cold starts:** Render's free service sleeps after 15 minutes without incoming requests. The next visit takes about a minute to wake it. There are 750 free instance hours per month per workspace, which is enough for one always-on service.
- **No data loss:** all posts, accounts and predictions live in Turso, so restarts, redeploys and sleeping don't lose data. Live-update clients reconnect on their own.
- **Photos live in Turso:** the free plan has no persistent disk, so photos are stored in the database. At the full 300 KB cap, Turso's 5 GB free storage holds roughly 16,000 photos (most shrunk phone photos are smaller), and the 30-day retention keeps usage bounded. Photos are cached by browsers (`immutable`), so repeat views don't hit the database. To turn photos off, set `PHOTOS_ENABLED=false` in Render's Environment tab.
- **Turso limits:** if a free-plan limit is exceeded, Turso blocks the database until the next month or until you upgrade. That's far beyond this app's expected use.

### Railway (alternative, has a free trial but not a permanent free tier)
Use the same steps with the same environment variables (`SITE_PASSWORD`, `SITE_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`): **New Project → Deploy from GitHub repo**, add the variables, then **Settings → Networking → Generate Domain**.

## Test
```bash
npm test                    # alert logic unit tests (city-zoom gating, 8-pin pulse cap, bounds incl. antimeridian, store-local 'window starting now', 10 s beep throttle with burst merging, once-per-window, flash→steady) + API tests on an in-memory local SQLite DB (gate, auth, posting, photos as DB BLOBs: EXIF/GPS + PNG text stripping, type sniffing, 300 KB cap, gated route + cache headers/304, delete + retention prune, photo defaults, photos-disabled mode, hosted-mode secret rules, SSE, permissions, validation, rate limits, migrations, seeding, predictions, DST; worldwide: offline country/time zone/currency, grid cells + query plans, on-demand OSM with a stubbed Overpass (caching, User-Agent, per-IP/daily caps, backoff), posting in Paris/Sydney/mid-ocean, AU/IE chain windows, opening_hours parser and generic estimates)
npm run test:libsql         # the same API tests through @libsql/client (the Turso driver) against a local file: URL
npm run test:ui             # headless Chrome (desktop, photos disabled): gate → register → post (photo UI hidden) → second browser gets live NEW post → all gone; then a user in Paris (mock Overpass server): map centres on them, OSM stores + generic prediction pins, form shows "France · EUR · Europe/Paris", post shows EUR; and a user who declines location gets the world view + worldwide feed
npm run test:mobile         # 390x844 touch emulation (photos stored in the DB, served via /photos/:key): layout, touch targets, bottom sheet, full-screen form, camera input, PWA; writes test/screenshot-mobile*.png
```
The browser tests start their own server on a spare port using a **copy** of `data/rtc.sqlite`, so real data is never touched. Uploaded test photos are removed afterwards. They need Chrome (`CHROME_PATH`, default `/usr/bin/google-chrome`).

## API (all routes need the gate cookie)
| Method | Path | Notes |
|---|---|---|
| POST | /gate | form field `password` |
| POST | /api/register, /api/login, /api/logout · GET /api/me | session cookie |
| GET | /api/posts?lat&lng&radius_km&hours=48&include_gone=1 | newest first; without lat/lng: latest worldwide |
| POST | /api/posts | multipart; login required |
| PATCH/DELETE | /api/posts/:id | own posts only |
| POST/DELETE | /api/posts/:id/gone | login required |
| GET | /api/stores?lat&lng&radius_km&at | stores with today's prediction; fetches/caches OSM stores for new areas (`pending: true` while running) |
| GET | /api/geo?lat&lng | offline country, time zone, currency and chain list for a point |
| GET | /api/stores/:id/predictions | 7-day prediction view |
| GET | /api/stream | SSE: `post`, `update`, `delete` |
| GET | /photos/:key | post photo (gated; private immutable cache, ETag/304) |

## Before going public (not done in prototype)
- Email verification and/or phone or OAuth sign-in; reporting and moderation; trust scores (for example, LiveCheaper-style multi-report verification).
- CSRF tokens (cookies are SameSite=Lax and `secure` over HTTPS for now), and photo storage on S3 or R2 with image scanning.
- A commercial tile provider instead of tile.openstreetmap.org (OSMF tile usage policy), plus Postgres/PostGIS for scale.
- Your own Overpass instance or a periodic import from a planet/Geofabrik extract instead of the public Overpass servers (their guidelines discourage general-public apps using them as a backend).
- Translations (strings are ready in `public/i18n.js`), localised server errors, and sourced chain times for more countries.
- A UK GDPR privacy notice and retention policy for accounts, locations and photos.
