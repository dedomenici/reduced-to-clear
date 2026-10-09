// Builds seeds/country-currency.json (ISO 3166 alpha-2 -> current ISO 4217 tender currency) from Unicode CLDR
// supplemental currencyData (cldr-core devDependency, Unicode License v3). Run: node scripts/build-currency.js
const fs = require('fs');
const path = require('path');
const data = require('cldr-core/supplemental/currencyData.json').supplemental.currencyData.region;
const out = {};
for (const [region, list] of Object.entries(data)) {
  if (!/^[A-Z]{2}$/.test(region)) continue;
  // current legal tender: has _from, no _to, and not _tender:"false"; pick the most recent _from
  const cur = list.map(o => Object.entries(o)[0])
    .filter(([, v]) => !v._to && v._tender !== 'false')
    .sort((a, b) => String(b[1]._from || '').localeCompare(String(a[1]._from || '')))[0];
  if (cur) out[region] = cur[0];
}
const pkg = require('cldr-core/package.json');
fs.writeFileSync(path.join(__dirname, '..', 'seeds', 'country-currency.json'), JSON.stringify({
  source: `Unicode CLDR ${pkg.version} supplemental/currencyData.json (cldr-core), Unicode License v3 https://www.unicode.org/license.txt`,
  currencies: out,
}, null, 0) + '\n');
console.log(`Wrote ${Object.keys(out).length} country currencies`);
