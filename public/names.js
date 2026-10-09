/* Reduced to Clear – English labels for store names written in non-Latin scripts (CJK, Thai, Hangul, Cyrillic, Arabic…).
   '全聯福利中心' + chain 'PX Mart' -> '全聯福利中心 (PX Mart)'. The English part comes only from OpenStreetMap
   (name:en / brand:en, stored as name_en) or, failing that, our known-chain mapping (the store's canonical chain).
   Nothing is machine-translated: if neither exists the name is shown as is. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RTC_NAMES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const NON_LATIN_LETTER = /(?=\p{L})\P{Script=Latin}/u;
  const hasNonLatin = s => NON_LATIN_LETTER.test(String(s || ''));
  const hasLatin = s => /\p{Script=Latin}/u.test(String(s || ''));
  // English (Latin-script) label for a store, or null.
  function englishFor(name, chain, nameEn) {
    if (!hasNonLatin(name)) return null; // already readable
    for (const c of [nameEn, chain]) {
      const v = String(c || '').trim();
      if (v && hasLatin(v) && !hasNonLatin(v) && v.toLowerCase() !== 'other' && !String(name).toLowerCase().includes(v.toLowerCase())) return v;
    }
    return null;
  }
  function storeLabel(name, chain, nameEn) { const en = englishFor(name, chain, nameEn); return en ? `${name} (${en})` : String(name || ''); }
  return { hasNonLatin, englishFor, storeLabel };
});
