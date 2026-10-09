/* Reduced to Clear – megacity shortcuts shown in international mode (world view). Click one to fly in and load it. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RTC_CITIES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // [name, lat, lng]
  const CITIES = [
    ['London', 51.5074, -0.1278], ['Paris', 48.8566, 2.3522], ['Berlin', 52.52, 13.405], ['Madrid', 40.4168, -3.7038],
    ['Amsterdam', 52.3676, 4.9041], ['Dublin', 53.3498, -6.2603], ['Istanbul', 41.0082, 28.9784],
    ['New York', 40.7128, -74.006], ['Toronto', 43.6532, -79.3832], ['Mexico City', 19.4326, -99.1332], ['São Paulo', -23.5505, -46.6333],
    ['Tokyo', 35.6762, 139.6503], ['Osaka', 34.6937, 135.5023], ['Seoul', 37.5665, 126.978], ['Taipei', 25.033, 121.5654],
    ['Kaohsiung', 22.6273, 120.3014], ['Hong Kong', 22.3193, 114.1694], ['Shanghai', 31.2304, 121.4737], ['Beijing', 39.9042, 116.4074],
    ['Singapore', 1.3521, 103.8198], ['Bangkok', 13.7563, 100.5018], ['Mumbai', 19.076, 72.8777], ['Dubai', 25.2048, 55.2708],
    ['Sydney', -33.8688, 151.2093], ['Melbourne', -37.8136, 144.9631], ['Lagos', 6.5244, 3.3792], ['Johannesburg', -26.2041, 28.0473],
  ].map(([name, lat, lng]) => ({ name, lat, lng }));
  const WORLD = { lat: 25, lng: 10, zoom: 2 };
  const CITY_ZOOM = 13;
  return { CITIES, WORLD, CITY_ZOOM };
});
