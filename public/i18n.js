/* Reduced to Clear – UI strings (i18n-ready).
   To add a language: copy the `en` block to a new key (e.g. `fr`), translate the values, keep {placeholders}.
   The locale is picked from the browser (navigator.languages) with English as the fallback. Plural forms use
   Intl.PluralRules: give "key_one"/"key_other" (and other CLDR categories as needed). */
(() => {
  const MESSAGES = {
    en: {
      appName: 'Reduced to Clear',
      nearMe: 'Near me', useMyLocation: 'Use my location', searchPlaceholder: 'Postcode, town or place…', searchLabel: 'Search for a place', go: 'Go',
      radius: 'Radius', soundOn: 'Sound on', soundOff: 'Sound off', toggleSound: 'Toggle ping sound', pingTitle: 'Ping on new posts',
      login: 'Log in', loginOrRegister: ' / Register', logout: 'Log out', register: 'Register', guest: 'Browsing as guest', hi: 'Hi, {name}',
      postReductions: 'Post reductions', postReductionsBtn: '+ Post reductions', showGone: 'show "all gone"', showPredictions: 'show predictions',
      feedLabel: 'Reductions feed', reductionsNearby_one: '{n} reduction nearby', reductionsNearby_other: '{n} reductions nearby',
      reductionsWorldwide_one: '{n} recent reduction worldwide', reductionsWorldwide_other: '{n} recent reductions worldwide',
      newCount: '{n} new', noneNearby: 'No reductions reported nearby in the last 48 hours. Spotted some? Post them!',
      noneWorldwide: 'No reductions reported in the last 48 hours.',
      footer: 'Posts are community reports; check in store. {pred} pins (dashed purple, or faint for generic estimates) are estimates, not confirmed reductions.',
      attribution: 'Map and store data © {osm} contributors (ODbL).',
      locateHint: 'Showing the latest posts worldwide. Tap 📍 or search for a place to see reductions near you.',
      locating: 'Finding your location…', storesLoading: 'Loading supermarkets for this area from OpenStreetMap…',
      storesUnavailable: 'OpenStreetMap is busy right now, so some supermarkets for this area are missing. Trying again shortly.',
      storesLimited: 'Some supermarkets for this area will load later (OpenStreetMap fair-use limits).',
      allGoneBadge: 'ALL GONE', newBadge: 'NEW', photoAlt: 'Photo of reduced items',
      posted: 'Posted {ago} ({when}) by {author} · seen {seen}', km: ' · {km} km', edited: ' · edited',
      markedGone: ' · marked all gone {ago}', markedGoneBy: ' · marked all gone {ago} by {name}',
      allGone: '🚫 All gone', stillThere: '↩ Still there', edit: '✏️ Edit', delete: '🗑 Delete', showOnMap: '🗺 Map',
      confirmGone: 'Mark "{store}" reductions as all gone?', editItems: 'Edit items', editNotes: 'Edit prices / notes', confirmDelete: 'Delete this post?',
      justNow: 'just now', minAgo: '{n} min ago', hAgo: '{n} h ago', dAgo: '{n} d ago',
      prediction: 'PREDICTION', predTooltip: 'PREDICTION · {name}', predFor: 'Estimated reduction times for {day} — not confirmed',
      predLocalTime: 'Times are local to the store ({tz}).', weekView: 'Week view',
      learned: 'Learned: {windows} ({n} reports, {conf} confidence)', chainTypical: 'Chain typical: {text}', generic: 'Generic estimate: {windows} (low confidence; last 2 hours before closing per OpenStreetMap opening hours)',
      from: 'from {t}', source: 'Source: ', weekIntro: 'Estimated from community reports at this store (learned), chain-typical times from press/shopper reports, or a generic guess from opening hours. Always check in store.',
      conf_low: 'low', conf_medium: 'medium', conf_high: 'high',
      live: '● Live', reconnecting: '○ Reconnecting… (polling every 30s)',
      locationFailed: 'Could not get location: {msg}', noGeo: 'Geolocation not supported', placeNotFound: 'Place not found', searchFailed: 'Search failed',
      authNeeded: 'You need an account to post, edit your posts, or mark items all gone. This keeps the map honest.',
      displayName: 'Display name', email: 'Email', password: 'Password', cancel: 'Cancel', haveAccount: 'Have an account? Log in', noAccount: 'No account? Register',
      close: 'Close', nearbyStore: 'Nearby store (optional)', newStore: '— new / not listed —', supermarket: 'Supermarket', other: 'Other',
      supermarketName: 'Supermarket name', branchName: 'Branch name', branchPlaceholder: 'e.g. Tesco Express Old Street', address: 'Address (optional)',
      whatsReduced: "What's reduced?", itemsPlaceholder: 'e.g. sushi packs 75% off, sourdough loaves 20p, lots of salads',
      priceNotes: 'Prices / notes (optional)', pricePlaceholder: 'e.g. most items {a}–{b}', timeSeen: 'Time seen', location: 'Location',
      pickOnMap: '🗺 Pick on map', useMyLocationBtn: '📍 Use my location', notSet: 'Not set', city: 'Town / city (optional)',
      detected: '{country} · {currency} · {tz}', detectedNote: 'Country, currency and time zone are worked out from the location.',
      photoOptional: 'Photo (optional)', takePhoto: '📷 Take photo', choosePhoto: '🖼 Choose photo', noPhoto: 'No photo', removePhoto: 'Remove photo', photoPreview: 'Selected photo preview',
      post: 'Post', pickBanner: 'Tap the map to set the store location', shrinkFailed: 'Could not shrink photo enough, try another',
      newTitle: '(NEW) Reduced to Clear', you: 'You', mapLabel: 'Map', postFab: 'Post reductions',
    },
  };
  const avail = Object.keys(MESSAGES);
  const pick = () => { for (const l of navigator.languages || [navigator.language || 'en']) { const b = String(l).toLowerCase(); if (MESSAGES[b]) return b; const s = b.split('-')[0]; if (MESSAGES[s]) return s; } return 'en'; };
  const locale = pick();
  const plural = new Intl.PluralRules(locale);
  function t(key, vars = {}) {
    let k = key;
    if (typeof vars.n === 'number') { const pk = `${key}_${plural.select(vars.n)}`; if (MESSAGES[locale][pk] || MESSAGES.en[pk]) k = pk; else if (MESSAGES.en[key + '_other']) k = key + '_other'; }
    const s = MESSAGES[locale][k] ?? MESSAGES.en[k] ?? key;
    return s.replace(/\{(\w+)\}/g, (m, v) => (vars[v] ?? m));
  }
  // Apply to static markup: data-i18n (text), data-i18n-placeholder, data-i18n-aria-label, data-i18n-title
  function apply(root = document) {
    document.documentElement.lang = locale;
    root.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
    for (const attr of ['placeholder', 'aria-label', 'title']) {
      const ds = 'i18n' + attr.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');
      root.querySelectorAll(`[data-i18n-${attr}]`).forEach(n => n.setAttribute(attr, t(n.dataset[ds])));
    }
  }
  const money = (amount, currency) => { try { return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount); } catch { return String(amount); } };
  const countryName = cc => { try { return new Intl.DisplayNames([locale], { type: 'region' }).of(cc); } catch { return cc; } };
  window.I18N = { t, apply, locale, available: avail, money, countryName };
})();
