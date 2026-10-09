/* Reduced to Clear – client */
(() => {
  const $ = s => document.querySelector(s);
  const LONDON = { lat: 51.5072, lng: -0.1276 };
  const st = {
    user: null, cfg: null, posts: new Map(), newIds: new Set(),
    center: JSON.parse(localStorage.getItem('rtc_center') || 'null') || LONDON,
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
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return Math.floor(s / 86400) + ' d ago';
  }

  // ---------- Map ----------
  const map = L.map('map').setView([st.center.lat, st.center.lng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  const postLayer = L.layerGroup().addTo(map);
  const predLayer = L.layerGroup().addTo(map);
  let youMarker = null, radiusCircle = null;
  function drawCenter() {
    if (youMarker) youMarker.remove(); if (radiusCircle) radiusCircle.remove();
    youMarker = L.circleMarker([st.center.lat, st.center.lng], { radius: 7, color: '#1d1d1b', fillColor: '#2b8aef', fillOpacity: 1 }).addTo(map).bindTooltip('You');
    radiusCircle = L.circle([st.center.lat, st.center.lng], { radius: st.radius * 1000, color: '#2b8aef', weight: 1, fillOpacity: 0.03 }).addTo(map);
  }
  function setCenter(lat, lng, zoom) {
    st.center = { lat, lng }; localStorage.setItem('rtc_center', JSON.stringify(st.center));
    map.setView([lat, lng], zoom || map.getZoom()); drawCenter(); load();
  }
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
    const sum = $('#sheet-summary'); sum.replaceChildren(`${active} reduction${active === 1 ? '' : 's'} nearby`);
    if (fresh) sum.append(el('span', { class: 'new-count' }, `${fresh} new`));
    if (!list.length) feed.append(el('li', { class: 'muted' }, 'No reductions reported nearby in the last 48 hours. Spotted some? Post them!'));
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
      isNew && !p.all_gone_at ? el('span', { class: 'new-badge' }, 'NEW') : null,
      el('h3', {}, `${p.store_name}`, p.all_gone_at ? el('span', { class: 'gone-badge' }, 'ALL GONE') : null),
      el('div', { class: 'items' }, p.items),
      p.price_note ? el('div', { class: 'small' }, p.price_note) : null,
      p.photo_url && !compact ? el('img', { src: p.photo_url, alt: 'Photo of reduced items', loading: 'lazy' }) : null,
      el('div', { class: 'meta' },
        `Posted ${ago(p.created_at)} (${dayClock(p.created_at)}) by ${p.author} · seen ${clock(p.seen_at)}`,
        p.distance_km != null ? ` · ${p.distance_km} km` : '', p.updated_at ? ' · edited' : '',
        p.all_gone_at ? ` · marked all gone ${ago(p.all_gone_at)}${p.gone_by_name ? ' by ' + p.gone_by_name : ''}` : ''),
    );
    const actions = el('div', { class: 'actions' });
    if (!p.all_gone_at) actions.append(el('button', { onclick: e => { e.stopPropagation(); markGone(p); } }, '🚫 All gone'));
    else if (st.user && (p.mine || p.all_gone_by === st.user.id)) actions.append(el('button', { onclick: e => { e.stopPropagation(); undoGone(p); } }, '↩ Still there'));
    if (p.mine) {
      actions.append(el('button', { onclick: e => { e.stopPropagation(); editPost(p); } }, '✏️ Edit'));
      actions.append(el('button', { onclick: e => { e.stopPropagation(); deletePost(p); } }, '🗑 Delete'));
    }
    actions.append(el('button', { onclick: e => { e.stopPropagation(); setSheet(false); map.setView([p.lat, p.lng], 16); } }, '🗺 Map'));
    li.append(actions);
    return li;
  }
  const needLogin = () => { if (!st.user) { openAuth(false); return true; } return false; };
  async function markGone(p) {
    if (needLogin()) return;
    if (!confirm(`Mark "${p.store_name}" reductions as all gone?`)) return;
    try { upsert((await api(`/api/posts/${p.id}/gone`, { method: 'POST' })).post); } catch (e) { alert(e.message); }
  }
  async function undoGone(p) { try { upsert((await api(`/api/posts/${p.id}/gone`, { method: 'DELETE' })).post); } catch (e) { alert(e.message); } }
  async function editPost(p) {
    const items = prompt('Edit items', p.items); if (items == null) return;
    const price = prompt('Edit prices / notes', p.price_note || ''); if (price == null) return;
    try { upsert((await api(`/api/posts/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, price_note: price }) })).post); } catch (e) { alert(e.message); }
  }
  async function deletePost(p) {
    if (!confirm('Delete this post?')) return;
    try { await api(`/api/posts/${p.id}`, { method: 'DELETE' }); st.posts.delete(p.id); renderAll(); } catch (e) { alert(e.message); }
  }
  function upsert(p) { const old = st.posts.get(p.id); if (old) p.mine = old.mine || p.mine; if (p.distance_km == null && old) p.distance_km = old.distance_km; st.posts.set(p.id, p); renderAll(); }

  // ---------- Predictions layer ----------
  function predText(pr) {
    const parts = [];
    if (pr.learned && pr.learned.windows.length) parts.push(`Learned: ${pr.learned.windows.map(w => hhmm(w.start) + '–' + hhmm(w.end)).join(', ')} (${pr.learned.reports} reports, ${pr.learned.confidence} confidence)`);
    for (const c of pr.chain) parts.push(`Chain typical: ${c.start != null ? hhmm(c.start) + '–' + hhmm(c.end) + ' – ' : ''}${c.label}`);
    return parts;
  }
  function renderStores(stores) {
    predLayer.clearLayers();
    if (!$('#show-pred').checked) return;
    for (const s of stores) {
      const pr = s.prediction;
      if (!(pr.learned && pr.learned.windows.length) && !pr.chain.length) continue;
      const learned = !!(pr.learned && pr.learned.windows.length);
      const m = L.marker([s.lat, s.lng], { icon: L.divIcon({ className: '', html: `<div class="pred-pin ${learned ? 'learned' : ''}" title="Prediction"></div>`, iconSize: [18, 18] }) });
      m.bindTooltip(`PREDICTION · ${s.name}`);
      m.bindPopup(() => {
        const div = el('div', {}, el('span', { class: 'pred-label' }, 'PREDICTION'), el('h3', {}, s.name), el('div', { class: 'small muted' }, `Estimated reduction times for ${pr.day} — not confirmed`));
        for (const t of predText(pr)) div.append(el('div', { class: 'small' }, '• ' + t));
        for (const c of pr.chain) if (c.source && c.source.url) div.append(el('div', { class: 'small' }, 'Source: ', el('a', { href: c.source.url, target: '_blank', rel: 'noopener' }, c.source.title)));
        div.append(el('button', { onclick: () => showWeek(s.id) }, 'Week view'));
        return div;
      });
      m.addTo(predLayer);
    }
  }
  async function showWeek(id) {
    const { store, week } = await api(`/api/stores/${id}/predictions`);
    const body = $('#pred-body'); body.replaceChildren(el('span', { class: 'pred-label' }, 'PREDICTION'), el('h2', {}, store.name),
      el('p', { class: 'small muted' }, 'Estimated from community reports at this store (learned) and chain-typical times from press/shopper reports. Always check in store.'));
    const t = el('table', { class: 'week' });
    for (const d of week) t.append(el('tr', {}, el('td', {}, el('b', {}, d.day)), el('td', {}, ...predText(d).map(x => el('div', {}, x)))));
    body.append(t); $('#dlg-pred').showModal();
  }

  // ---------- Loading ----------
  async function load() {
    const q = `lat=${st.center.lat}&lng=${st.center.lng}&radius_km=${st.radius}`;
    const [{ posts }, { stores }] = await Promise.all([
      api(`/api/posts?${q}&include_gone=1`),
      api(`/api/stores?${q}`),
    ]);
    st.posts = new Map(posts.map(p => [p.id, p]));
    for (const p of posts) if (p.created_at > st.lastVisit && !p.mine) st.newIds.add(p.id);
    st.stores = stores;
    renderAll(); renderStores(stores);
  }
  const inRadius = p => {
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
    else { st.newIds.add(p.id); ping(); document.title = '(NEW) Reduced to Clear'; }
    st.posts.set(p.id, p); renderAll();
  }
  let pollTimer = null;
  function startLive() {
    const es = new EventSource('/api/stream');
    es.addEventListener('open', () => { $('#live-status').textContent = '● Live'; clearInterval(pollTimer); pollTimer = null; });
    es.addEventListener('post', e => onNewPost(JSON.parse(e.data)));
    es.addEventListener('update', e => { const p = JSON.parse(e.data); if (st.posts.has(p.id)) { p.mine = st.posts.get(p.id).mine; upsert(p); } });
    es.addEventListener('delete', e => { st.posts.delete(JSON.parse(e.data).id); renderAll(); });
    es.addEventListener('error', () => {
      $('#live-status').textContent = '○ Reconnecting… (polling every 30s)';
      if (!pollTimer) pollTimer = setInterval(async () => {
        const q = `lat=${st.center.lat}&lng=${st.center.lng}&radius_km=${st.radius}&include_gone=1`;
        const { posts } = await api('/api/posts?' + q).catch(() => ({ posts: [] }));
        for (const p of posts) { if (!st.posts.has(p.id)) onNewPost(p); else upsert(p); }
      }, 30000);
    });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = 'Reduced to Clear'; });
  setInterval(renderAll, 60000); // refresh "x min ago"

  // ---------- Location controls ----------
  $('#btn-locate').onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(
    pos => setCenter(pos.coords.latitude, pos.coords.longitude, 15), err => alert('Could not get location: ' + err.message), { enableHighAccuracy: true, timeout: 10000 }) : alert('Geolocation not supported');
  $('#place-form').onsubmit = async e => {
    e.preventDefault(); const q = $('#place').value.trim(); if (!q) return;
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q)).then(r => r.json());
      if (!r.length) return alert('Place not found'); setCenter(Number(r[0].lat), Number(r[0].lon), 15);
    } catch { alert('Search failed'); }
  };
  $('#radius').value = String(st.radius);
  $('#radius').onchange = () => { st.radius = Number($('#radius').value); localStorage.setItem('rtc_radius', st.radius); drawCenter(); load(); };
  $('#show-gone').onchange = renderAll;
  $('#show-pred').onchange = () => renderStores(st.stores || []);
  function soundBtn() { $('#btn-sound').innerHTML = st.sound ? '🔔<span class="lbl"> Sound on</span>' : '🔇<span class="lbl"> Sound off</span>'; }
  $('#btn-sound').onclick = () => { st.sound = !st.sound; localStorage.setItem('rtc_sound', st.sound ? '1' : '0'); soundBtn(); ping(); };

  // ---------- Auth ----------
  let registering = false;
  function setUser(u) {
    st.user = u; $('#who').textContent = u ? `Hi, ${u.display_name}` : 'Browsing as guest';
    $('#btn-login').hidden = !!u; $('#btn-logout').hidden = !u;
  }
  function openAuth(reg) {
    registering = reg; $('#auth-title').textContent = reg ? 'Register' : 'Log in'; $('#auth-submit').textContent = reg ? 'Register' : 'Log in';
    $('#auth-toggle').textContent = reg ? 'Have an account? Log in' : 'No account? Register';
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
    fillNearbyStores(lat, lng);
  }
  async function fillNearbyStores(lat, lng) {
    const sel = $('#store-select'); sel.replaceChildren(el('option', { value: '' }, '— new / not listed —'));
    const { stores } = await api(`/api/stores?lat=${lat}&lng=${lng}&radius_km=0.5`).catch(() => ({ stores: [] }));
    for (const s of stores.slice(0, 30)) sel.append(el('option', { value: s.id }, `${s.name} (${Math.round(s.distance_km * 1000)} m)`));
  }
  $('#store-select').onchange = () => { $('#new-store-fields').hidden = !!$('#store-select').value; };
  $('#chain-select').onchange = () => { $('#chain-other-wrap').hidden = $('#chain-select').value !== 'Other'; };
  $('#country-select').onchange = fillCities;
  function fillCities() {
    const c = st.cfg.countries[$('#country-select').value];
    $('#city-select').replaceChildren(...Object.keys(c.cities).map(n => el('option', { value: n }, n)));
  }
  $('#btn-new').onclick = $('#fab-post').onclick = () => {
    if (needLogin()) return;
    setPhoto(null);
    const f = $('#post-form'); f.reset(); $('#post-err').textContent = ''; $('#new-store-fields').hidden = false; $('#chain-other-wrap').hidden = true;
    const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); f.seen_local.value = now.toISOString().slice(0, 16);
    fillCities(); setPostLocation(st.center.lat, st.center.lng); $('#dlg-post').showModal();
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
    if (!file) { box.replaceChildren('No photo'); $('#photo-camera').value = ''; $('#photo-gallery').value = ''; return; }
    const img = el('img', { alt: 'Selected photo preview' }); img.src = URL.createObjectURL(file);
    box.replaceChildren(img, el('div', {}, el('button', { type: 'button', onclick: () => setPhoto(null) }, 'Remove photo')));
  }
  $('#photo-camera').onchange = e => setPhoto(e.target.files[0]);
  $('#photo-gallery').onchange = e => setPhoto(e.target.files[0]);
  async function shrinkPhoto(file) {
    // Re-encode via canvas: resizes and strips EXIF (incl. GPS) before upload.
    if (!file || !file.size) return null;
    const img = await createImageBitmap(file).catch(() => null); if (!img) return file;
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.82));
  }
  $('#post-form').onsubmit = async e => {
    e.preventDefault(); const f = e.target; $('#post-err').textContent = '';
    const fd = new FormData(f); fd.delete('seen_local');
    fd.set('seen_at', new Date(f.seen_local.value).toISOString());
    const photo = await shrinkPhoto(st.photoFile); if (photo) fd.set('photo', photo, 'photo.jpg');
    try {
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
    $('#photo-fieldset').hidden = !cfg.photosEnabled; // photos need persistent storage (PHOTOS_ENABLED=true)
    $('#chain-select').replaceChildren(...cfg.chains.map(c => el('option', { value: c }, c)));
    $('#country-select').replaceChildren(...Object.entries(cfg.countries).map(([k, v]) => el('option', { value: k }, v.name)));
    await load(); startLive();
  })();
})();
