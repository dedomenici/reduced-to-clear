# Reduced to Clear — Research Notes

Compiled 9 Oct 2026. All figures below are quoted/paraphrased from the cited sources; nothing is invented. Where sources disagree, both are given. **Every chain told Which? there are no fixed national times (or only loose "morning/evening" patterns), so all "times" here are indicative and store-dependent.**

---

## 1. Live / public reduced-to-clear data sources

| Source | What it is | Usable as a live feed? |
|---|---|---|
| **Olio – Reduced Food section** | Shows yellow-sticker items "sourced straight from each retailer's own systems" from participating stores (Iceland, Budgens, Co-op, Morrisons Daily, Nisa, Spar). ~300 UK stores. Store/distance filters, watchlist, daily alerts. | No public API. Closest existing competitor. https://olioapp.com/en/olio-updates/introducing-our-new-deals-section-on-olio/ , https://help.olioapp.com/en/articles/12240815-reduced-food |
| **Gander** | Real-time reduced-to-clear listings fed by retailers. Play Store listing says coverage is limited (N. Ireland, Channel Islands, Coventry, SW Wales per search summary). | No public API. https://play.google.com/store/apps/details?id=co.gander.app |
| **LiveCheaper "Yellow-sticker radar"** | Crowdsourced: neighbours report markdown *windows* per branch; one report = "unverified", several households = confirmed. Businesses cannot edit their own times. | Closest crowdsourced analogue; useful design reference (verification threshold). No API found. https://livecheaper.co.uk/radar |
| **Too Good To Go** | Surplus "Surprise Bags", not individual yellow-sticker items. No public developer API (developer subdomain behind SSO per apis.io). App T&Cs prohibit automated extraction, crawling, scraping. Unofficial wrappers exist (authenticated app endpoints) — not authorised. | **No.** https://www.toogoodtogo.com/en-us/legal/terms-and-conditions-using-the-app , https://apis.io/providers/too-good-to-go/ , https://github.com/wblondel/tgtg-api-wrapper |
| **Karma** | Surplus-food marketplace; launched London 2018; reported June 2026 launch in 125 Waitrose & Partners stores (LinkedIn post). | No public API found. https://karma.life/app , https://www.thegrocer.co.uk/news/karma-food-waste-app-arrives-in-london/563366.article , https://www.linkedin.com/feed/update/urn:li:activity:7476294319260291072 |
| **Reddit** | r/ReducedFoodLondon (dedicated London sub, e.g. 2020 "Tesco insider" timetable), r/UKFrugal, r/LondonFood, r/AskUK threads with anecdotal timings. | Qualitative only. Reddit Data API: non-commercial use within rate limits; commercial use needs written permission/agreement; scraping/bulk collection prohibited without approval. https://redditinc.com/policies/data-api-terms , https://support.reddithelp.com/hc/en-us/articles/14945211791892 |
| **X (Twitter)** | Searched via X API (`search_posts_all`) on 9 Oct 2026 for "yellow sticker"/"reduced to clear" + London/chains. Results were sparse, mostly jokes/replies; no structured store+time reports. One relevant post (8 Oct 2026) explicitly wished maps showed "when local supermarkets put out their best yellow stickers" (https://x.com/DeathlyAcorn/status/2108158980870611180) — demand signal, not data. | **Not a viable data source.** X Developer terms: no scraping/browser automation; stored content must be kept in sync/deleted on removal. |
| **Supermarket APIs** | Tesco's old developer portal APIs are no longer available; no official public API for Tesco or Sainsbury's. Third-party scraping APIs exist (Apify, Unwrangle, Pepesto) but are unofficial. None expose in-store markdowns anyway (markdowns are applied in-store, not online). | **No.** https://dev.to/yappman/how-to-get-tesco-prices-with-an-api-in-2026-4n20 , https://www.pepesto.com/supermarkets/sainsburys/ |
| **OpenStreetMap** (store locations) | `shop=supermarket` with `brand`/`opening_hours` tags; queryable via Overpass. ODbL licence: attribution "© OpenStreetMap contributors" + link to /copyright; derivative databases must stay ODbL. Overpass fair use: cache, rate-limit, identify app. | **Yes — best legal source for store locations/opening hours** (for later store auto-import). https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ , https://osmfoundation.org/wiki/Attribution_Policy |

**Conclusion:** There is no open live yellow-sticker data feed. Retailer-integrated feeds (Olio, Gander) are proprietary. Crowdsourcing (as the brief intends) is the only realistic legal source; OSM is suitable for store location data.

---

## 2. Typical reduction times by chain (indicative, store-dependent)

Key sources:
- **[Which?]** Retailer statements to Which? — https://www.which.co.uk/news/article/best-times-of-day-to-get-yellow-sticker-supermarket-bargains-revealed-aRzv22f0s7Lt (also summarised by Mirror: https://www.mirror.co.uk/money/exact-times-aldi-tesco-sainsburys-34890797)
- **[Mirror 2026]** Mirror, 27 Jan 2026, citing Quote My Wall analysis of retailer comments + shopper/staff reports — https://www.mirror.co.uk/lifestyle/food-drink/best-time-yellow-sticker-discounts-36624226
- **[Mirror-Tesco]** Tesco bakery change — https://www.mirror.co.uk/money/tesco-shoppers-fume-over-big-35304430
- **[SupermarketGuide]** https://supermarketguide.co.uk/how-yellow-stickers-work-at-uk-supermarkets/ (unattributed blog table — lower confidence)
- **[ReducedGrub]** https://reducedgrub.com/what-time-does-iceland-reduce-food/ , https://reducedgrub.com/sunday-supermarket-reduction-times/ (blog — lower confidence)
- **[Scottish Sun]** https://www.thescottishsun.co.uk/money/11003811/exact-time-get-yellow-sticker-bargains/ (anecdotes incl. M&S staff on TikTok)
- **[Reddit]** r/UKFrugal https://www.reddit.com/r/UKFrugal/comments/1rpta0v/supermarket_food_sticker_timings/ ; r/ReducedFoodLondon https://www.reddit.com/r/ReducedFoodLondon/comments/endv08/tesco_insider_information/ ; r/LondonFood https://www.reddit.com/r/LondonFood/comments/1qjp4qx/when_did_the_reduced_section_become_so_expensive/

| Chain | Official position (Which?) | Reported typical windows |
|---|---|---|
| **Tesco** | No specific times. | After 7pm and 30–60 min before close [Mirror 2026]. Bakery discounts moved from ~5pm to ~7pm, confirmed by Tesco, varies by store [Mirror-Tesco]. Selected Express stores: "CS" items free after 9:30pm (trial from Mar 2025) [Mirror-Tesco; Metro https://metro.co.uk/2026/01/01/tesco-shoppers-just-discovering-little-known-way-get-free-food-25979023/]. 2020 Reddit "insider" timetable: 20% 7–10am, 50% 2–4pm, 75% from 6pm superstores / 7pm Express (old, unverified) [Reddit]. |
| **Sainsbury's** | No specific times. | Best selection 1–3pm, best prices 6:30–8pm [Mirror 2026]. Ex-staff (Local): 1st reduction 1pm, 2nd 5pm, final ~7:30–8pm [Reddit r/UKFrugal]. |
| **Asda** | Usually twice a day — morning and evening. | 9–11am and 7–9pm [Mirror 2026]. Staff comment: next-day-dated stock marked down ~8pm, second markdown ~2pm next day; Sundays ~12pm [Reddit]. |
| **Morrisons** | No specific times. | "Manager-led"; 10am–1pm and 5–8pm [Mirror 2026]. ~5pm [Reddit]. |
| **Co-op** | (not quoted on timing) | ~50% off 5–7pm, lower around 8pm [Mirror 2026]. ~11am and after 6pm [Reddit]. |
| **M&S** | Varies by store, likely near close (Which?). | Best value ~1 hour before close [Mirror 2026]. Conflicting anecdote: M&S manager says stickered overnight → store opening best, re-reduced ~2pm; another says 3–4pm [Scottish Sun]. |
| **Waitrose** | No specific times. | Starts afternoon, deeper towards close [Scottish Sun]; ~1pm first, 6–7pm final [SupermarketGuide]. Sunday final 2–3pm [ReducedGrub]. |
| **Lidl** | First thing, then a few hours before closing; may also reduce during the day. | Opening; and 3–4 hours before close [Mirror 2026]. |
| **Aldi** | Varies by store, likely near close. Perishables 30% or 75% off on last day of life; 30% off damaged ambient. | 7pm–close most frequently [Mirror 2026]. Staff (bank-holiday Saturday): from 5–6pm [Reddit]. Sunday second round shortly after opening [Reddit]. |
| **Iceland** | (not in Which? piece) | Fresh reductions in the morning [Scottish Sun]; first late morning–early afternoon, final from ~3pm, deepest 5–7pm; Sundays from ~1pm [ReducedGrub]. |

General: Sundays (shorter English trading hours) shift reductions earlier [ReducedGrub; Reddit]. Shoppers report discounts shallower than in the past (e.g. "£4.50 → £3.82" at M&S) and some M&S stock diverted to Too Good To Go [Reddit r/LondonFood].

These windows are seeded into the prototype as **"Predicted (chain typical)"** with source links, never presented as facts.

---

## 3. Legal / ToS notes for scraping & data

- **Tesco** website T&Cs: a search summary reported a clause prohibiting bots/crawlers/scrapers/AI tools without prior written consent. My direct fetch of https://www.tesco.com/help/terms-and-conditions/ (9 Oct 2026) rendered section 7 "Intellectual property" empty, so **I could not verify the exact wording** — treat as likely prohibited; check manually.
- **Too Good To Go**: explicit ban on automated extraction, crawling, scraping (link above).
- **Reddit**: commercial use requires agreement; no scraping (link above).
- **X**: no scraping; use paid API; keep stored posts in sync/delete on removal.
- **UK database right** (sui generis) and copyright can protect retailer product databases and photos independently of ToS; browsewrap enforceability is uncertain but not a safe basis (Lexology: https://www.lexology.com/library/detail.aspx?g=ff2eaf8c-57bf-4f6c-b9c9-461d60fcd754).
- **OSM**: free to use under ODbL with attribution (map tiles via tile.openstreetmap.org also subject to the OSMF tile usage policy — use a commercial tile provider at scale).
- **Our own data (UK GDPR)**: user accounts (email), precise location and photos (may contain faces of staff/shoppers, EXIF GPS) are personal data → privacy notice, strip EXIF, moderation/report flow, retention policy. Photos of in-store shelves: some stores restrict photography on premises (house rules, not law).
- **Chain trademarks**: using names descriptively is fine; avoid logos without permission.

**Recommendation:** crowdsource only; optionally approach Olio/retailers for partnership feeds later; import store locations from OSM with attribution.
