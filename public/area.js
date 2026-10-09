/* Reduced to Clear – which area to load when the user pans/zooms or searches.
   International is OFF by default: only the user's local area (their location, or London) and anything within
   ~50 km of it is fetched. Further away (or zoomed out past ~50 km) nothing new loads until "Go international" is on. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RTC_AREA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const LOCAL_LIMIT_KM = 50, WORLD_RADIUS_KM = 50;
  function kmBetween(a, b) {
    const R = 6371, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  // The area a view asks for: centre + radius (at least the user's radius), or "world" when zoomed out past ~50 km.
  function areaForView(center, halfDiagKm, minRadius) {
    const radius = Math.max(minRadius, Math.ceil(halfDiagKm * 10) / 10);
    return radius > WORLD_RADIUS_KM ? { world: true } : { lat: center.lat, lng: center.lng, radius };
  }
  const isLocal = (home, point) => !!home && kmBetween(home, point) <= LOCAL_LIMIT_KM;
  // 'load' | 'skip' (already loaded) | 'blocked' (international off and the area is beyond ~50 km of home)
  function decide({ home, cur, next, intl }) {
    if (!intl && (next.world || !isLocal(home, next))) return 'blocked';
    if (cur && cur.world && next.world) return 'skip';
    if (cur && !cur.world && !next.world && next.radius <= cur.radius && kmBetween(cur, next) + next.radius <= cur.radius) return 'skip';
    return 'load';
  }
  return { kmBetween, areaForView, isLocal, decide, LOCAL_LIMIT_KM };
});
