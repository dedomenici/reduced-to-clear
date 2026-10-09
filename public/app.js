/* Reduced to Clear – client */
(() => {
  const $ = s => document.querySelector(s);
  const { t, money, countryName } = window.I18N;
  I18N.apply();
  // No default city: start at the user's saved/current location; otherwise show the world and the latest posts everywhere.
  const st = {
    user: null, cfg: null, posts: new Map(), newIds: new Set(),
    center: JSON.parse(localStorage.getItem('rtc_center') || 'null'),
    radius: Number(localStorage.getItem('rtc_radius') || 3),
    sound: localStorage.getItem('rtc_sound') === '1',
    lastVisit: localStorage.getItem('rtc_last_visit') || new Date(0).toISOString(),
    picking: false,
  };
  localStorage.setItem('rtc_last_visit', new Date().toISOString());

  async function api(url, opts = {}) {
    const r = await fetch(url, { credentials: 'same-origin', ...opts });
    if (r.status === 401) {
      const j = await r.clone().json().catch(() => ({}));
      if (j.error === 'site_locked') { location.href = '/gate'; throw new Error('locked'); }
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || r.statusText); e.status = r.status; throw e; }
    return j;
  }
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v != null) n.setAttribute(k, v); }
    for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  };
  const hhmm = h => h == null ? '' : `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  const clock = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dayClock = iso => { const d = new Date(iso); const today = new Date().toDateString() === d.toDateString(); return (today ? '' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ' ') + clock(iso); };
  function ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return t('justNow'); if (s < 3600) return t('minAgo', { n: Math.floor(s / 60) });
    if (s < 86400) return t('hAgo', { n: Math.floor(s / 3600) }); return t('dAgo', { n: Math.floor(s / 86400) });
  }
  const myTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // ---------- Map ----------
  const map = L.map('map', { worldCopyJump: true }); // no maxBounds: the whole world is available
  if (st.center) map.setView([st.center.lat, st.center.lng], 14); else map.setView([25, 10], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  const postLayer = L.layerGroup().addTo(map);
  const predLayer = L.layerGroup().addTo(map);
  let youMarker = null, radiusCircle = null;
  function drawCenter() {
    if (youMarker) youMarker.remove(); if (radiusCircle) radiusCircle.remove();
    if (!st.center) return;
    youMarker = L.circleMarker([st.center.lat, st.center.lng], { radius: 7, color: '#1d1d1b', fillColor: '#2b8aef', fillOpacity: 1 }).addTo(map).bindTooltip(t('you'));
    radiusCircle = L.circle([st.center.lat, st.center.lng], { radius: st.radius * 1000, color: '#2b8aef', weight: 1, fillOpacity: 0.03 }).addTo(map);
  }
  function setCenter(lat, lng, zoom) {
    st.center = { lat, lng }; localStorage.setItem('rtc_center', JSON.stringify(st.center));
    map.setView([lat, lng], zoom || Math.max(map.getZoom(), 14)); drawCenter(); showHint(null); load();
  }
  function showHint(text) { const h = $('#map-hint'); h.hidden = !text; h.textContent = text || ''; }
  map.on('click', e => {
    if (st.picking) { setPostLocation(e.latlng.lat, e.latlng.lng); endPicking(); $('#dlg-post').showModal(); }
  });

  // ---------- Feed ----------
  function renderAll() {
    const showGone = $('#show-gone').checked;
    const list = [...st.posts.values()].filter(p => showGone || !p.all_gone_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const feed = $('#feed'); feed.replaceChildren();
    postLayer.clearLayers();
    const active = list.filter(p => !p.all_gone_at).length, fresh = list.filter(p => st.newIds.has(p.id) && !p.all_gone_at).length;
    const sum = $('#sheet-summary'); sum.replaceChildren(t(st.center ? 'reductionsNearby' : 'reductionsWorldwide', { n: active }));
    if (fresh) sum.append(el('span', { class: 'new-count' }, t('newCount', { n: fresh })));
    if (!list.length) feed.append(el('li', { class: 'muted' }, t(st.center ? 'noneNearby' : 'noneWorldwide')));
    for (const p of list) {
      feed.append(renderPost(p));
      const cls = p.all_gone_at ? 'gone' : st.newIds.has(p.id) ? 'new' : '';
      const m = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: `<div class="pin ${cls}"></div>`, iconSize: [26, 26], iconAnchor: [13, 26] }) });
      m.bindPopup(() => renderPost(p, true)); m.addTo(postLayer);
    }
  }
  function renderPost(p, compact) {
    const isNew = st.newIds.has(p.id);
    const li = el('li', { class: 'post' + (p.all_gone_at ? ' gone' : ''), id: compact ? null : 'post-' + p.id, onclick: () => { if (isNew) { st.newIds.delete(p.id); renderAll(); } } },
      isNew && !p.all_gone_at ? el('span', { class: 'new-badge' }, t('newBadge')) : null,
      el('h3', {}, `${p.store_name}`, p.all_gone_at ? el('span', { class: 'gone-badge' }, t('allGoneBadge')) : null),
      el('div', { class: 'items' }, p.items),
      p.price_note ? el('div', { class: 'small' }, p.price_note, p.currency && p.currency !== 'XXX' ? el('span', { class: 'muted' }, ` (${p.currency})`) : null) : null,
      p.photo_url && !compact ? el('img', { src: p.photo_url, alt: t('photoAlt'), loading: 'lazy' }) : null,
      el('div', { class: 'meta' },
        t('posted', { ago: ago(p.created_at), when: dayClock(p.created_at), author: p.author, seen: clock(p.seen_at) }),
        p.distance_km != null ? t('km', { km: p.distance_km }) : '', p.updated_at ? t('edited') : '',
        p.all_gone_at ? (p.gone_by_name ? t('markedGoneBy', { ago: ago(p.all_gone_at), name: p.gone_by_name }) : t('markedGone', { ago: ago(p.all_gone_at) })) : ''),
    );
    const actions = el('div', { class: 'actions' });
    if (!p.all_gone_at) actions.append(el('button', { onclick: e => { e.stopPropagation(); markGone(p); } }, t('allGone')));
    else if (st.user && (p.mine || p.all_gone_by === st.user.id)) actions.append(el('button', { onclick: e => { e.stopPropagation(); undoGone(p); } }, t('stillThere')));
    if (p.mine) {
      actions.append(el('button', { onclick: e => { e.stopPropagation(); editPost(p); } }, t('edit')));
      actions.append(el('button', { onclick: e => { e.stopPropagation(); deletePost(p); } }, t('delete')));
    }
    actions.append(el('button', { onclick: e => { e.stopPropagation(); setSheet(false); map.setView([p.lat, p.lng], 16); } }, t('showOnMap')));
    li.append(actions);
    return li;
  }
  const needLogin = () => { if (!st.user) { openAuth(false); return true; } return false; };
  async function markGone(p) {
    if (needLogin()) return;
    if (!confirm(t('confirmGone', { store: p.store_name }))) return;
    try { upsert((await api(`/api/posts/${p.id}/gone`, { method: 'POST' })).post); } catch (e) { alert(e.message); }
  }
  async function undoGone(p) { try { upsert((await api(`/api/posts/${p.id}/gone`, { method: 'DELETE' })).post); } catch (e) { alert(e.message); } }
  async function editPost(p) {
    const items = prompt(t('editItems'), p.items); if (items == null) return;
    const price = prompt(t('editNotes'), p.price_note || ''); if (price == null) return;
    try { upsert((await api(`/api/posts/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, price_note: price }) })).post); } catch (e) { alert(e.message); }
  }
  async function deletePost(p) {
    if (!confirm(t('confirmDelete'))) return;
    try { await api(`/api/posts/${p.id}`, { method: 'DELETE' }); st.posts.delete(p.id); renderAll(); } catch (e) { alert(e.message); }
  }
  function upsert(p) { const old = st.posts.get(p.id); if (old) p.mine = old.mine || p.mine; if (p.distance_km == null && old) p.distance_km = old.distance_km; st.posts.set(p.id, p); renderAll(); }

  // ---------- Predictions layer ----------
  const span = w => w.end == null ? t('from', { t: hhmm(w.start) }) : `${hhmm(w.start)}–${hhmm(w.end)}`;
  const hasLearned = pr => !!(pr.learned && pr.learned.windows.length);
  function predText(pr) {
    const parts = [];
    if (hasLearned(pr)) parts.push(t('learned', { windows: pr.learned.windows.map(span).join(', '), n: pr.learned.reports, conf: t('conf_' + pr.learned.confidence) }));
    for (const c of pr.chain) parts.push(t('chainTypical', { text: (c.start != null ? span(c) + ' – ' : '') + c.label }));
    if (pr.generic) parts.push(t('generic', { windows: pr.generic.windows.map(span).join(', ') }));
    return parts;
  }
  const sourcesOf = pr => [...pr.chain.map(c => c.source), pr.generic && pr.generic.source].filter(s => s && s.url);
  function renderStores(stores) {
    predLayer.clearLayers();
    if (!$('#show-pred').checked) return;
    for (const s of stores) {
      const pr = s.prediction;
      if (!hasLearned(pr) && !pr.chain.length && !pr.generic) continue;
      const kind = hasLearned(pr) ? 'learned' : pr.chain.length ? '' : 'generic';
      const m = L.marker([s.lat, s.lng], { icon: L.divIcon({ className: '', html: `<div class="pred-pin ${kind}" title="${t('prediction')}"></div>`, iconSize: [18, 18] }) });
      m.bindTooltip(t('predTooltip', { name: s.name }));
      m.bindPopup(() => {
        const div = el('div', {}, el('span', { class: 'pred-label' }, t('prediction')), el('h3', {}, s.name), el('div', { class: 'small muted' }, t('predFor', { day: pr.day })));
        if (s.timezone && s.timezone !== myTz) div.append(el('div', { class: 'small muted' }, t('predLocalTime', { tz: s.timezone })));
        for (const x of predText(pr)) div.append(el('div', { class: 'small' }, '• ' + x));
        for (const src of sourcesOf(pr)) div.append(el('div', { class: 'small' }, t('source'), el('a', { href: src.url, target: '_blank', rel: 'noopener' }, src.title)));
        div.append(el('button', { onclick: () => showWeek(s.id) }, t('weekView')));
        return div;
      });
      m.addTo(predLayer);
    }
  }
  async function showWeek(id) {
    const { store, week } = await api(`/api/stores/${id}/predictions`);
    const body = $('#pred-body'); body.replaceChildren(el('span', { class: 'pred-label' }, t('prediction')), el('h2', {}, store.name),
      el('p', { class: 'small muted' }, t('weekIntro')));
    if (store.timezone && store.timezone !== myTz) body.append(el('p', { class: 'small muted' }, t('predLocalTime', { tz: store.timezone })));
    const tb = el('table', { class: 'week' });
    for (const d of week) tb.append(el('tr', {}, el('td', {}, el('b', {}, d.day)), el('td', {}, ...predText(d).map(x => el('div', {}, x)))));
    body.append(tb); $('#dlg-pred').showModal();
  }

  // ---------- Loading ----------
  // With a location: nearby posts + stores (stores for a new area are fetched from OpenStreetMap on demand; the
  // server answers "pending" while that runs and we ask again shortly). Without one: latest posts worldwide.
  const postsQuery = () => st.center ? `lat=${st.center.lat}&lng=${st.center.lng}&radius_km=${st.radius}&include_gone=1` : 'include_gone=1';
  let loadSeq = 0, storeRetry = null;
  async function load() {
    const seq = ++loadSeq; clearTimeout(storeRetry);
    const { posts } = await api('/api/posts?' + postsQuery());
    if (seq !== loadSeq) return;
    st.posts = new Map(posts.map(p => [p.id, p]));
    for (const p of posts) if (p.created_at > st.lastVisit && !p.mine) st.newIds.add(p.id);
    renderAll();
    if (st.center) loadStores(seq, 0); else { st.stores = []; renderStores([]); areaStatus(null); }
  }
  function areaStatus(text) { const a = $('#area-status'); a.hidden = !text; a.textContent = text || ''; }
  async function loadStores(seq, attempt) {
    areaStatus(attempt === 0 ? null : t('storesLoading'));
    const slow = setTimeout(() => seq === loadSeq && areaStatus(t('storesLoading')), 1200);
    const r = await api(`/api/stores?lat=${st.center.lat}&lng=${st.center.lng}&radius_km=${st.radius}`).catch(() => ({ stores: [] }));
    clearTimeout(slow);
    if (seq !== loadSeq) return;
    st.stores = r.stores; renderStores(r.stores);
    if (r.pending && attempt < 6) { areaStatus(t('storesLoading')); storeRetry = setTimeout(() => loadStores(seq, attempt + 1), 4000); }
    else areaStatus(r.limited ? t('storesLimited') : null);
  }
  const inRadius = p => {
    if (!st.center) { p.distance_km = null; return true; }
    const R = 6371, r = x => x * Math.PI / 180, dLat = r(p.lat - st.center.lat), dLng = r(p.lng - st.center.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(st.center.lat)) * Math.cos(r(p.lat)) * Math.sin(dLng / 2) ** 2;
    p.distance_km = Math.round(2 * R * Math.asin(Math.sqrt(h)) * 100) / 100; return p.distance_km <= st.radius;
  };

  // ---------- Live: SSE with polling fallback ----------
  function ping() {
    if (!st.sound) return;
    try {
      const ctx = ping.ctx || (ping.ctx = new (window.AudioContext || window.webkitAudioContext)());
      [880, 1320].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; o.type = 'sine';
        const t = ctx.currentTime + i * 0.15; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.3);
      });
    } catch { /* audio unavailable */ }
  }
  function onNewPost(p) {
    if (st.posts.has(p.id) || !inRadius(p)) return;
    if (st.user && p.user_id === st.user.id) p.mine = true;
    else { st.newIds.add(p.id); ping(); document.title = t('newTitle'); }
    st.posts.set(p.id, p); renderAll();
  }
  let pollTimer = null;
  function startLive() {
    const es = new EventSource('/api/stream');
    es.addEventListener('open', () => { $('#live-status').textContent = t('live'); clearInterval(pollTimer); pollTimer = null; });
    es.addEventListener('post', e => onNewPost(JSON.parse(e.data)));
    es.addEventListener('update', e => { const p = JSON.parse(e.data); if (st.posts.has(p.id)) { p.mine = st.posts.get(p.id).mine; upsert(p); } });
    es.addEventListener('delete', e => { st.posts.delete(JSON.parse(e.data).id); renderAll(); });
    es.addEventListener('error', () => {
      $('#live-status').textContent = t('reconnecting');
      if (!pollTimer) pollTimer = setInterval(async () => {
        const { posts } = await api('/api/posts?' + postsQuery()).catch(() => ({ posts: [] }));
        for (const p of posts) { if (!st.posts.has(p.id)) onNewPost(p); else upsert(p); }
      }, 30000);
    });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = t('appName'); });
  setInterval(renderAll, 60000); // refresh "x min ago"

  // ---------- Location controls ----------
  function locate(quiet) {
    if (!navigator.geolocation) { if (!quiet) alert(t('noGeo')); return; }
    if (quiet) showHint(t('locating'));
    navigator.geolocation.getCurrentPosition(pos => setCenter(pos.coords.latitude, pos.coords.longitude, 15),
      err => { if (quiet) showHint(t('locateHint')); else alert(t('locationFailed', { msg: err.message })); }, { enableHighAccuracy: true, timeout: 10000 });
  }
  $('#btn-locate').onclick = () => locate(false);
  $('#place-form').onsubmit = async e => {
    e.preventDefault(); const q = $('#place').value.trim(); if (!q) return;
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q)).then(r => r.json());
      if (!r.length) return alert(t('placeNotFound')); setCenter(Number(r[0].lat), Number(r[0].lon), 15);
    } catch { alert(t('searchFailed')); }
  };
  $('#radius').value = String(st.radius);
  $('#radius').onchange = () => { st.radius = Number($('#radius').value); localStorage.setItem('rtc_radius', st.radius); drawCenter(); load(); };
  $('#show-gone').onchange = renderAll;
  $('#show-pred').onchange = () => renderStores(st.stores || []);
  function soundBtn() { $('#btn-sound').replaceChildren(st.sound ? '🔔' : '🔇', el('span', { class: 'lbl' }, ' ' + t(st.sound ? 'soundOn' : 'soundOff'))); }
  $('#btn-sound').onclick = () => { st.sound = !st.sound; localStorage.setItem('rtc_sound', st.sound ? '1' : '0'); soundBtn(); ping(); };

  // ---------- Auth ----------
  let registering = false;
  function setUser(u) {
    st.user = u; $('#who').textContent = u ? t('hi', { name: u.display_name }) : t('guest');
    $('#btn-login').hidden = !!u; $('#btn-logout').hidden = !u;
  }
  function openAuth(reg) {
    registering = reg; $('#auth-title').textContent = t(reg ? 'register' : 'login'); $('#auth-submit').textContent = t(reg ? 'register' : 'login');
    $('#auth-toggle').textContent = t(reg ? 'haveAccount' : 'noAccount');
    document.querySelectorAll('.reg-only').forEach(n => n.hidden = !reg); $('#auth-err').textContent = ''; $('#dlg-auth').showModal();
  }
  $('#btn-login').onclick = () => openAuth(false);
  $('#auth-toggle').onclick = e => { e.preventDefault(); openAuth(!registering); };
  $('#auth-cancel').onclick = () => $('#dlg-auth').close();
  $('#auth-form').onsubmit = async e => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target));
    try {
      const { user } = await api(registering ? '/api/register' : '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fd) });
      setUser(user); $('#dlg-auth').close(); load();
    } catch (err) { $('#auth-err').textContent = err.message; }
  };
  $('#btn-logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); setUser(null); load(); };

  // ---------- Post form ----------
  function setPostLocation(lat, lng) {
    const f = $('#post-form'); f.lat.value = lat; f.lng.value = lng;
    $('#loc-text').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    fillNearbyStores(lat, lng); fillGeo(lat, lng);
  }
  // Country, currency and time zone are computed on the server from the coordinates (offline lookup).
  async function fillGeo(lat, lng) {
    const g = await api(`/api/geo?lat=${lat}&lng=${lng}`).catch(() => null); if (!g) return;
    const known = g.country !== 'ZZ', cur = g.currency !== 'XXX' ? g.currency : null;
    $('#loc-detected').textContent = t('detected', { country: known ? countryName(g.country) : '—', currency: cur || '—', tz: g.timezone });
    $('#price-note').placeholder = cur ? t('pricePlaceholder', { a: money(0.5, cur), b: money(1, cur) }) : '';
    const sel = $('#chain-select'), prev = sel.value;
    sel.replaceChildren(...g.chains.map(c => el('option', { value: c }, c)), el('option', { value: 'Other' }, t('other')));
    if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
    $('#chain-other-wrap').hidden = sel.value !== 'Other';
  }
  async function fillNearbyStores(lat, lng) {
    const sel = $('#store-select'); sel.replaceChildren(el('option', { value: '' }, t('newStore')));
    const { stores } = await api(`/api/stores?lat=${lat}&lng=${lng}&radius_km=0.5`).catch(() => ({ stores: [] }));
    for (const s of stores.slice(0, 30)) sel.append(el('option', { value: s.id }, `${s.name} (${Math.round(s.distance_km * 1000)} m)`));
  }
  $('#store-select').onchange = () => { $('#new-store-fields').hidden = !!$('#store-select').value; };
  $('#chain-select').onchange = () => { $('#chain-other-wrap').hidden = $('#chain-select').value !== 'Other'; };
  $('#btn-new').onclick = $('#fab-post').onclick = () => {
    if (needLogin()) return;
    setPhoto(null);
    const f = $('#post-form'); f.reset(); $('#post-err').textContent = ''; $('#new-store-fields').hidden = false; $('#chain-other-wrap').hidden = true;
    const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); f.seen_local.value = now.toISOString().slice(0, 16);
    const c = st.center || map.getCenter(); setPostLocation(c.lat, c.lng); $('#dlg-post').showModal();
  };
  $('#post-cancel').onclick = () => $('#dlg-post').close();
  $('#loc-here').onclick = () => navigator.geolocation.getCurrentPosition(p => setPostLocation(p.coords.latitude, p.coords.longitude), e => alert(e.message), { enableHighAccuracy: true });
  $('#loc-pick').onclick = () => { $('#dlg-post').close(); setSheet(false); st.picking = true; document.body.classList.add('picking'); $('#pick-banner').hidden = false; };
  function endPicking() { st.picking = false; document.body.classList.remove('picking'); $('#pick-banner').hidden = true; }
  $('#pick-cancel').onclick = () => { endPicking(); $('#dlg-post').showModal(); };
  $('#post-x').onclick = () => $('#dlg-post').close();
  // Photo: "Take photo" (capture=environment opens the camera on phones) or "Choose photo" (gallery/files).
  function setPhoto(file) {
    st.photoFile = file || null; const box = $('#photo-preview');
    if (!file) { box.replaceChildren(t('noPhoto')); $('#photo-camera').value = ''; $('#photo-gallery').value = ''; return; }
    const img = el('img', { alt: t('photoPreview') }); img.src = URL.createObjectURL(file);
    box.replaceChildren(img, el('div', {}, el('button', { type: 'button', onclick: () => setPhoto(null) }, t('removePhoto'))));
  }
  $('#photo-camera').onchange = e => setPhoto(e.target.files[0]);
  $('#photo-gallery').onchange = e => setPhoto(e.target.files[0]);
  async function shrinkPhoto(file) {
    // Re-encode via canvas: resizes, strips EXIF (incl. GPS) and fits the server's size cap (default 300KB)
    // by stepping JPEG quality down, then dimensions, until it fits.
    if (!file || !file.size) return null;
    const maxBytes = (st.cfg && st.cfg.maxPhotoBytes) || 300 * 1024;
    const img = await createImageBitmap(file).catch(() => null); if (!img) return file;
    let dim = 1280;
    for (let attempt = 0; attempt < 8; attempt++) {
      const scale = Math.min(1, dim / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      for (const q of [0.82, 0.7, 0.6, 0.5]) {
        const blob = await new Promise(res => c.toBlob(b => res(b), 'image/jpeg', q));
        if (blob && blob.size <= maxBytes) return blob;
      }
      dim = Math.round(dim * 0.75);
    }
    throw new Error(t('shrinkFailed'));
  }
  $('#post-form').onsubmit = async e => {
    e.preventDefault(); const f = e.target; $('#post-err').textContent = '';
    const fd = new FormData(f); fd.delete('seen_local');
    fd.set('seen_at', new Date(f.seen_local.value).toISOString());
    try {
      const photo = await shrinkPhoto(st.photoFile); if (photo) fd.set('photo', photo, 'photo.jpg');
      const { post } = await api('/api/posts', { method: 'POST', body: fd });
      post.mine = true; inRadius(post); st.posts.set(post.id, post); renderAll(); $('#dlg-post').close(); setSheet(true);
    } catch (err) { $('#post-err').textContent = err.message; }
  };
  $('#pred-close').onclick = () => $('#dlg-pred').close();

  // ---------- Mobile bottom sheet ----------
  const sheet = $('#sheet'), handle = $('#sheet-handle');
  function setSheet(open) { sheet.classList.toggle('open', open); handle.setAttribute('aria-expanded', String(open)); sheet.style.transform = ''; }
  let drag = null, moved = false;
  handle.addEventListener('click', () => { if (!moved) setSheet(!sheet.classList.contains('open')); moved = false; });
  handle.addEventListener('pointerdown', e => {
    if (!matchMedia('(max-width: 800px)').matches) return;
    drag = { y0: e.clientY, open: sheet.classList.contains('open'), h: sheet.getBoundingClientRect().height, peek: handle.offsetHeight };
    moved = false; handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', e => {
    if (!drag) return; const dy = e.clientY - drag.y0; if (Math.abs(dy) > 6) moved = true; if (!moved) return;
    sheet.classList.add('dragging');
    const closedY = drag.h - drag.peek, base = drag.open ? 0 : closedY;
    sheet.style.transform = `translateY(${Math.min(closedY, Math.max(0, base + dy))}px)`;
  });
  const endDrag = e => {
    if (!drag) return; sheet.classList.remove('dragging');
    if (moved) { const dy = e.clientY - drag.y0; setSheet(drag.open ? dy < 60 : dy < -60); }
    drag = null;
  };
  handle.addEventListener('pointerup', endDrag); handle.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', () => map.invalidateSize());
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

  // ---------- Boot ----------
  (async () => {
    soundBtn(); drawCenter();
    const [{ user }, cfg] = await Promise.all([api('/api/me'), api('/api/config')]);
    st.cfg = cfg; setUser(user);
    $('#photo-fieldset').hidden = !cfg.photosEnabled;
    const predLabel = el('span', { class: 'pred-label' }, t('prediction'));
    const [before, after] = t('footer').split('{pred}');
    $('#footer-note').replaceChildren(before, predLabel, after || '');
    const [a1, a2] = t('attribution').split('{osm}');
    $('#attribution').replaceChildren(a1, el('a', { href: (cfg.attribution && cfg.attribution.url) || 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener' }, 'OpenStreetMap'), a2 || '');
    if (!st.center) { showHint(t('locateHint')); locate(true); } // first visit: ask for the user's location
    await load(); startLive();
  })();
})();
