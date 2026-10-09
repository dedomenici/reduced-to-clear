// English labels for non-Latin store names (public/names.js) and the OSM name:en / brand:en ingest (src/osm.js).
const test = require('node:test');
const assert = require('node:assert');
const { storeLabel, englishFor, hasNonLatin } = require('../public/names');
const { elementToStore, chainFor } = require('../src/osm');

test('non-Latin names get the English chain/name alongside; Latin names and unknown chains are left alone', () => {
  assert.strictEqual(storeLabel('全聯福利中心', 'PX Mart'), '全聯福利中心 (PX Mart)');
  assert.strictEqual(storeLabel('全聯福利中心 高雄中正店', 'PX Mart', 'PX Mart Kaohsiung Zhongzheng'), '全聯福利中心 高雄中正店 (PX Mart Kaohsiung Zhongzheng)', 'OSM name:en wins');
  assert.strictEqual(storeLabel('イオン', 'AEON'), 'イオン (AEON)');
  assert.strictEqual(storeLabel('이마트 성수점', 'E-mart'), '이마트 성수점 (E-mart)');
  assert.strictEqual(storeLabel('ท็อปส์ มาร์เก็ต', 'Tops'), 'ท็อปส์ มาร์เก็ต (Tops)');
  assert.strictEqual(storeLabel('ВкусВилл', 'VkusVill'), 'ВкусВилл (VkusVill)');
  assert.strictEqual(storeLabel('義美食品', '義美食品'), '義美食品', 'unknown chain: no invented translation');
  assert.strictEqual(storeLabel('7-ELEVEN 統一超商', '7-Eleven'), '7-ELEVEN 統一超商', 'English already in the name');
  assert.strictEqual(storeLabel('Tesco Express', 'Tesco'), 'Tesco Express');
  assert.strictEqual(storeLabel('Café São Paulo', 'Other'), 'Café São Paulo');
  assert.strictEqual(englishFor('全家', 'Other'), null);
  assert.ok(hasNonLatin('高雄')); assert.ok(!hasNonLatin('Crème brûlée 2'));
});

test('OSM ingest keeps name:en (else brand:en) as name_en; chain mapping still canonical', () => {
  const s = elementToStore({ type: 'node', id: 1, lat: 22.6273, lon: 120.3014, tags: { shop: 'supermarket', brand: '全聯福利中心', name: '全聯福利中心 高雄中正店', 'name:en': 'PX Mart Zhongzheng' } }, 'x');
  assert.strictEqual(s.name_en, 'PX Mart Zhongzheng'); assert.strictEqual(s.chain, 'PX Mart'); assert.strictEqual(s.country, 'TW');
  const b = elementToStore({ type: 'node', id: 2, lat: 25.04, lon: 121.54, tags: { shop: 'convenience', brand: '萊爾富', 'brand:en': 'Hi-Life', name: '萊爾富 大安店' } }, 'x');
  assert.strictEqual(b.name_en, 'Hi-Life'); assert.strictEqual(chainFor({ brand: '萊爾富' }), 'Hi-Life');
  assert.strictEqual(elementToStore({ type: 'node', id: 3, lat: 25.04, lon: 121.54, tags: { shop: 'supermarket', name: '里仁' } }, 'x').name_en, null);
});
