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

### Outside the UK (added 9 Oct 2026; only sourced times are used in the app)
| Country / chain | Retailer statement | Reported times |
|---|---|---|
| **IE – Tesco, Aldi, Lidl, M&S, SuperValu** | — | Tesco "6pm and onwards"; Aldi 9am (when stores open); Lidl 8am (when stores open); M&S "30 minutes before stores close"; SuperValu "more likely on weekends when big deliveries arrive". "The exact timings are subject to change, and differ from store to store." Aldi: 30% off in the morning on items dated today, 75% off on any still there in the evening. [Irish Mirror, 17 May 2022 https://www.irishmirror.ie/whats-on/food-drink-news/tesco-lidl-ms-supervalu-aldi-26983224] |
| **AU – Woolworths** | Availability "will vary from day to day and store to store based on stock levels and demand". | Staff on Reddit: chilled and meat first markdown 2–4pm for items one or two days out; "usually from 6pm onward" further same-day markdowns up to 80%; produce around 9–10am. A second worker: "go in around 7pm". [7NEWS, 29 Nov 2022 https://7news.com.au/lifestyle/food/woolworths-worker-reveals-the-exact-time-supermarket-staff-reduce-fresh-meat-and-dairy-c-9002995] |
| **AU – Coles** | No set time; depends on "stock on hand, delivery schedules and team member rostering". | One shopper finds markdowns in "the final hour of the day". [Yahoo Finance AU https://au.finance.yahoo.com/news/coles-shopper-saves-1000-a-year-after-discovering-supermarket-secret-that-works-every-time-012754391.html] |

#### Global megacities (research pass, 9 Oct 2026)
Local-language searches (Japanese, Korean, Traditional/Simplified Chinese, Thai, French, German, Spanish, Dutch, Russian, Turkish, Portuguese). **Every chain says times vary by store.** "Confidence" is about the source: *medium* = chain statement or a named-chain news report; *low* = blogs, shopper or staff anecdotes, or self-media; *high* = a published, system-driven scheme (e.g. Taiwan's convenience-store apps). Rows go into `seeds/chain-predictions.json` only when a source gives a time (or states that a chain has no set time). Stores are matched through the OSM brand in local script (`src/osm.js` BRANDS, e.g. 全聯→PX Mart, イオン→AEON, 이마트→E-mart; `이마트24` and `イオンモール` deliberately excluded).

| City / country | Chain | Reported times | Conf. | Source |
|---|---|---|---|---|
| **Taipei / Kaohsiung (TW)**, national chains, so the same rules apply in both cities | PX Mart 全聯 | Next-day-expiry fresh items 20% off from opening (08:00); same-day 40% off from ~16:00; PX Pay 惜食地圖 shows per-store 20/40%-off items 18:00–22:00; hot bento 40% off ~13:00 and ~19:00 | medium | [TVBS 健康2.0](https://health.tvbs.com.tw/life/348845), [食尚玩家 2026](https://supertaste.tvbs.com.tw/esg/358542), [TVBS新聞](https://news.tvbs.com.tw/life/2885478) |
| | Carrefour 家樂福 | Deli: last batch ~17:00, staged markdowns from ~18–19:00 down to 50% off (Carrefour info). Many outlets repeat "熟食 17:00–21:00 8→5折" | medium | [食尚玩家 2026](https://supertaste.tvbs.com.tw/esg/358542), [TVBS](https://health.tvbs.com.tw/life/348845) |
| | 7-Eleven i珍食 | 35% off within 8 h of expiry: 10:00–17:00 and 20:00–03:00; 20% off 19:00–19:59; OPEN POINT i地圖 | high | [Money101 2026](https://www.money101.com.tw/blog/%E8%B6%85%E5%95%86-%E9%AE%AE%E9%A3%9F-%E7%89%B9%E5%83%B9%E6%99%82%E6%AE%B5) |
| | FamilyMart 友善食光 | 30% off within 7 h of expiry, typically from 10:00 (light meals) and 17:00 (all); 全家 app 地圖趣 | high | [Money101 2026](https://www.money101.com.tw/blog/%E8%B6%85%E5%95%86-%E9%AE%AE%E9%A3%9F-%E7%89%B9%E5%83%B9%E6%99%82%E6%AE%B5) |
| | Hi-Life 萊爾富 | Renamed 即食救援: selected fresh food 30% off 17:00–23:59 | high | [ETtoday 2026-09-08](https://www.ettoday.net/news/20260908/3233560.htm) |
| | OK Mart | 40% off ~16:30–22:30 | low | [BALIMAN (blog)](https://baliman.tw/blog/post/convenience-store-clearance-time) |
| | Simple Mart 美廉社 | Date-based, not clock-based: short-dated items down to 40% of price, on time-controlled e-price cards | medium | [食尚玩家 2026](https://supertaste.tvbs.com.tw/esg/358542) |
| | Mia C'bon | Deli/fresh food from ~19:00, deepening in stages | low | [上報](https://www.upmedia.mg/tw/lifestyle/deals/227655) |
| | RT-Mart 大潤發 (TW), Jasons, Costco TW | **No reliable data.** RT-Mart: evening stickers exist but no time is published. Costco: anecdotal near-closing deli clearance only | — | — |
| | Taichung / Tainan | No city-specific differences found (the chains run national schemes) | — | — |
| **Tokyo / Osaka (JP)** | AEON, Ito-Yokado, Life, Seiyu, Maruetsu, OK | First stickers ~15:00 (OK), ~17:00 (AEON, Ito-Yokado, Life, Maruetsu) or ~18:00 (Seiyu). Half price ~18–19 (OK), ~19–20 (Maruetsu), ~19:30 to close (Ito-Yokado), ~19–21 (Life; blogs differ), ~20:00 to close (Seiyu; 24h stores ~22–23), ~1–1.5 h before close (AEON; ~21:00 at large stores) | low | [サイフハック](https://saifu-hack.com/495/), [710to58](https://710to58.com/column/hangaku-time/), [AEON one-store stats](https://takamap.hatenablog.jp/entry/2025/05/03/175524) |
| | Depachika | For 20:00 closing: ~19:00 20–30%, deeper towards 19:30–19:45. Not added (department stores aren't in the OSM supermarket query) | low | blogs |
| | Osaka | No Kansai-specific chain times found; the national chains above apply | — | — |
| **Seoul (KR)** | E-mart | Usually from 19:00 (3 h before close), up to 40% off (company) | medium | [이데일리](https://www.edaily.co.kr/News/Read?mediaCodeNo=257&newsId=02263206645552240) |
| | Lotte Mart / Lotte Super | Usually from 18:00 (sometimes 17:00), up to 40% off (company) | medium | same |
| | Homeplus | **No reliable data** (only secondary blogs) | — | — |
| **Hong Kong** | ParknShop/TASTE/Fusion; AEON; YATA | Deli ~19:30–20:00 (TASTE bakeries 3 for HK$10 / 20% off after 20:00); AEON ~19:30–20:00; YATA from ~20:00. Wellcome: **no reliable data**. Market Place: ~20:30 (one article; not added) | low | [U Food](https://ufood.com.hk/restaurant/news/detail/20091336/) |
| **Singapore** | Cold Storage; FairPrice; Don Don Donki | Cold Storage roast meats half price from ~19:00 (previously 21:00); FairPrice roast/bento evening, some outlets from ~17:00; Donki ready-to-eat 20–50% from ~20:00. Sheng Siong: **no reliable data** | low | [SilverStreak, Oct 2024](https://silverstreak.sg/use-everyday-food-deals-to-fight-inflation/) |
| **Shanghai / Beijing (CN)** | Hema 盒马; Yonghui 永辉 | Hema: online clearance 19:00, deli/sushi ~30% off 20:00, 50–70% off after 21:00. Yonghui: first stickers 19:30, main clearance 20:30–21:30. Walmart / RT-Mart CN: claims seen but not added | low | [新浪 (self-media)](https://www.sina.cn/gc/article/nipsvwy0524715.html) |
| **Bangkok (TH)** | Tops, Big C, Lotus's, MaxValu, 7-Eleven | Tops 13–15 and 19–21; Big C 15:00 30%, 17:00 50%, 19–19:30 up to 75%; Lotus's bakery 17–18; MaxValu 17–18:30 30%, 20–21 50–80%; 7-Eleven next-day-expiry 50% from ~18:00 | low | [Thairath](https://www.thairath.co.th/lifestyle/food/2945030), [Brandage](http://www.brandage.com/article/47335), [Sanook](https://www.sanook.com/campus/1432639/) |
| **Paris (FR)** | Carrefour | Relabelling rounds 8:30–9:15 and 14:00–14:45 (−30 to −50%). Monoprix, Franprix, Auchan: **no reliable data** | low | [Marmiton](https://www.marmiton.org/actus-supermarches/horaire-reduction-50-carrefour-voici-le-moment-ideal-pour-faire-vos-courses-et-profiter-de-belles-remises-sur-les-produits-frais-s4135627.html) |
| **Berlin / Munich (DE)** | Kaufland; Rewe; Aldi Nord; Lidl; Edeka | Kaufland: fruit, veg and bakery reduced "daily shortly before closing". Rewe: up to 30%, no set time, not specifically at closing. Aldi Nord: not time-based (30% bins; bakery leftovers €0.50). Lidl: Rettertüte, no time. Edeka: **no reliable data** | medium | [WA/RUHR24, Oct 2023](https://www.wa.de/verbraucher/kunden-reduziert-sparen-einkaufen-uhrzeit-rabatt-ladenschluss-geld-aldi-lidl-rewe-supermarkt-zr-92552303.html) |
| **Madrid (ES)** | Mercadona; Lidl | Mercadona: yellow labels before closing (~20:30–21:00), more on Saturdays (shopper). Lidl: stickers before opening, or from a 19:00 check (go ~19:30–20:00); 50% same-day, 25% next-day (store manager) | low | [ABC 2025](https://www.abc.es/recreo/mercadona-indica-dia-hora-rebajan-precio-productos-20250408080000-nt.html), [Trendencias 2024](https://www.trendencias.com/gourmet/responsable-tienda-lidl-desvela-truco-para-comprar-barato-hora-a-que-vas) |
| **Rome / Milan (IT)** | — | **No reliable chain-specific data** (generic "18:30–19:00 until close" advice only) | — | — |
| **Amsterdam (NL)** | Albert Heijn; Jumbo | AH: algorithmic e-label markdowns rising 25→40→70% through the day, deepest towards closing; no clock times. Jumbo: **no reliable data** | medium | [AH press release](https://nieuws.ah.nl/dynamisch-afprijzen-zorgt-voor-minder-voedselverspilling/) |
| **Moscow (RU)** | VkusVill | Green price tags: officially no schedule, each store decides. Pyaterochka, Perekrestok: **no reliable data** | medium | [VkusVill FAQ](https://vkusvill.ru/faq/kogda-poyavlyayutsya-skidki-zelyenyy-tsennik-vo-vkusville/) |
| **New York / LA / Chicago (US)** | Trader Joe's; Whole Foods; Kroger | TJ's: no near-date markdowns, unsold food donated (spokesperson). Whole Foods: 50% off, morning of the day before sell-by (shopper guide). Kroger: weekday mornings before 10:00, rotisserie ~18:30–19:00 (blog). Safeway, Wegmans: **no reliable data** | low–medium | [Krazy Coupon Lady](https://thekrazycouponlady.com/tips/store-hacks/shelf-life-savings-these-stores-mark-down-items-near-their-best-by-date), [Scavenger](https://scavenger.ai/blog/kroger-clearance-schedule) |
| **Toronto (CA)** | Loblaws, Metro, Sobeys | **No reliable times.** Loblaw cut end-of-day stickers from 50% to 30% (2024) and uses Flashfood | — | [CityNews 2024](https://kitchener.citynews.ca/2024/01/16/loblaws-reduced-discounts-match-competitors-while-retaining-higher-margin-experts/) |
| **Sydney / Melbourne (AU)** | Woolworths, Coles | See the table above. Aldi AU: **no reliable data** | — | — |
| **Istanbul, Mexico City, São Paulo, Buenos Aires, Lagos, Cairo, Johannesburg, Dubai, Jakarta, Manila, Mumbai/Delhi** | — | **No reliable data.** Only opening hours, weekly flyers or generic "go before closing" advice. Dubai and Johannesburg results were unsourced blog generalities; Mexico's "7–9am" claims were generic US-style advice. These cities use the generic estimate | — | — |

Everywhere else (and for chains with no timed row) the app uses the **generic low-confidence estimate**: the last 2 hours before the store's OSM closing time. That rests on the UK pattern above (Aldi and M&S near closing [Which?], Lidl a few hours before [Which?], Tesco 30–60 min before close [Mirror 2026]) and is labelled as a generic guess.

### OpenStreetMap / Overpass fair use (for on-demand store fetching)
- Overpass public instances: "users are expected to send a maximum of about 10000 requests per day and keep their download volume below about 1 GB per day". Problematic behaviour includes "Stiching bounding boxes to scrape the full data of the complete world" and "Setting up an app for more than just OSM mappers and relying on the public instances as backend". Rate-limited requests get HTTP 429; resource-limited ones get 504. https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
- What the app does: tiles are fetched only where users look, cached for 30 days, one request at a time, a daily cap of 500, per-IP caps, backoff, and a User-Agent. That's suitable for the private prototype. A public launch should use its own Overpass instance or periodic extracts.

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
