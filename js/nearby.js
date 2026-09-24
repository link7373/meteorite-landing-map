'use strict';

/* ═══════════════════════════════════════════════════
   nearby.js — "Meteorites Near Me"
   Geolocates the visitor (or uses the map center), then lists the
   closest meteorites, fireballs, and craters within a radius.
   Location is never written to the URL automatically — only the
   explicit "Copy link" action builds a ?near= link, rounded to ~1 km.
   Loaded before app.js.
   ═══════════════════════════════════════════════════ */

const NEAR_RADII      = [50, 250, 1000];   // km
const NEAR_DEFAULT_R  = 250;
const NEAR_LIST_LIMIT = 30;

let _nearOrigin  = null;   // { lat, lng, source: 'gps' | 'map' | 'link' }
let _nearRadius  = NEAR_DEFAULT_R;
let _nearOverlay = null;   // L.LayerGroup — origin dot + radius circle

/** Great-circle distance in km (haversine). */
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function formatKm(km) {
  if (km < 1)   return '< 1 km';
  if (km < 10)  return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

/**
 * Everything within radiusKm of (lat, lng), nearest first.
 * Meteorites respect the active filters (AppState.filtered) so every
 * result has a marker on the map to fly to.
 */
function findNearby(lat, lng, radiusKm) {
  const out = [];
  for (const m of AppState.filtered) {
    const d = haversineKm(lat, lng, m.lat, m.lng);
    if (d <= radiusKm) out.push({ kind: 'meteorite', rec: m, d });
  }
  for (const f of AppState.fireballs || []) {
    const d = haversineKm(lat, lng, f.lat, f.lng);
    if (d <= radiusKm) out.push({ kind: 'fireball', rec: f, d });
  }
  for (const c of AppState.craters || []) {
    const d = haversineKm(lat, lng, c.lat, c.lng);
    if (d <= radiusKm) out.push({ kind: 'crater', rec: c, d });
  }
  return out.sort((a, b) => a.d - b.d);
}

/* ── Rendering ── */

function _nearItemHTML(item, idx) {
  const { kind, rec, d } = item;
  let dot, title, sub;
  if (kind === 'meteorite') {
    dot   = rec.fall === 'Fell' ? 'fell' : 'found';
    title = escapeHtml(rec.name);
    const verb = rec.fall === 'Fell' ? 'fell' : 'found';
    sub = `${escapeHtml(rec.recclass)} · ${formatMass(rec.mass)}${rec.year ? ` · ${verb} ${rec.year}` : ''}`;
  } else if (kind === 'fireball') {
    dot   = 'fireball';
    title = `Fireball ${escapeHtml(String(rec.date).slice(0, 10))}`;
    sub   = rec.impactE ? `${parseFloat(rec.impactE).toFixed(2)} kt impact energy` : 'Atmospheric bolide';
  } else {
    dot   = 'crater';
    title = `${escapeHtml(rec.crater_name)} crater`;
    sub   = `${rec.diameter_km ? `${escapeHtml(rec.diameter_km)} km wide` : 'Impact structure'}` +
            `${rec.age_millions_years_ago ? ` · ${escapeHtml(rec.age_millions_years_ago)} Ma` : ''}`;
  }
  return `
    <li>
      <button class="near-item" data-idx="${idx}">
        <span class="swatch swatch-${dot}" aria-hidden="true"></span>
        <span class="near-item-text">
          <span class="near-item-title">${title}</span>
          <span class="near-item-sub">${sub}</span>
        </span>
        <span class="near-item-dist mono">${formatKm(d)}</span>
      </button>
    </li>`;
}

function _plural(n, word) {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
}

let _nearResults = [];

function renderNearby(fly = true) {
  const body = document.getElementById('near-body');
  if (!_nearOrigin) return;

  _nearResults = findNearby(_nearOrigin.lat, _nearOrigin.lng, _nearRadius);
  const counts = { meteorite: 0, fireball: 0, crater: 0 };
  _nearResults.forEach(r => counts[r.kind]++);

  const where = _nearOrigin.source === 'gps' ? 'of you' : 'of this point';
  const filtered = AppState.filtered.length < AppState.allMeteorites.length;

  if (!_nearResults.length) {
    // Nothing in range — point to the single closest meteorite instead
    let closest = null;
    for (const m of AppState.filtered) {
      const d = haversineKm(_nearOrigin.lat, _nearOrigin.lng, m.lat, m.lng);
      if (!closest || d < closest.d) closest = { kind: 'meteorite', rec: m, d };
    }
    _nearResults = closest ? [closest] : [];
    body.innerHTML = `
      <p class="near-summary">Nothing recorded within ${_nearRadius.toLocaleString()} km ${where}.</p>
      ${closest ? `<p class="near-note">Closest known meteorite:</p><ul class="near-list">${_nearItemHTML(closest, 0)}</ul>` : ''}`;
  } else {
    const parts = [];
    if (counts.meteorite) parts.push(_plural(counts.meteorite, 'meteorite'));
    if (counts.fireball)  parts.push(_plural(counts.fireball, 'fireball'));
    if (counts.crater)    parts.push(_plural(counts.crater, 'crater'));
    const shown = _nearResults.slice(0, NEAR_LIST_LIMIT);
    body.innerHTML = `
      <p class="near-summary"><strong>${parts.join(' · ')}</strong> within ${_nearRadius.toLocaleString()} km ${where}.</p>
      ${filtered ? '<p class="near-note">Meteorite results reflect your active filters.</p>' : ''}
      <ul class="near-list">${shown.map(_nearItemHTML).join('')}</ul>
      ${_nearResults.length > shown.length ? `<p class="near-note">Showing the nearest ${shown.length}.</p>` : ''}`;
  }

  _drawNearOverlay(fly);
}

function _drawNearOverlay(fly) {
  if (_nearOverlay) _nearOverlay.remove();
  const center = [_nearOrigin.lat, _nearOrigin.lng];
  const circle = L.circle(center, {
    radius: _nearRadius * 1000,
    color: '#06b6d4', weight: 1.5, opacity: 0.7,
    fillColor: '#06b6d4', fillOpacity: 0.05,
    dashArray: '6 6', interactive: false,
  });
  const dot = L.marker(center, {
    icon: L.divIcon({ html: '<div class="near-origin"></div>', className: '', iconSize: [18, 18], iconAnchor: [9, 9] }),
    keyboard: false, interactive: false,
  });
  _nearOverlay = L.layerGroup([circle, dot]).addTo(AppState.map);
  if (fly) {
    // Frame the circle in the part of the map the panel doesn't cover
    const rect   = document.getElementById('near-panel').getBoundingClientRect();
    const mobile = window.matchMedia('(max-width: 768px)').matches;
    AppState.map.flyToBounds(circle.getBounds(), {
      paddingTopLeft:     [mobile ? 20 : rect.right + 20, mobile ? 80 : 40],
      paddingBottomRight: [mobile ? 20 : 40, mobile ? window.innerHeight - rect.top + 20 : 40],
      duration: 1.0,
    });
  }
}

/* ── Focusing a result ── */

/** Find the marker in a cluster group sitting at (lat, lng). */
function _markerAt(group, lat, lng) {
  let found = null;
  group.eachLayer(l => {
    if (found || !l.getLatLng) return;
    const p = l.getLatLng();
    if (Math.abs(p.lat - lat) < 1e-6 && Math.abs(p.lng - lng) < 1e-6) found = l;
  });
  return found;
}

function _focusNearItem(item) {
  if (item.kind === 'meteorite') {
    focusMeteorite(item.rec.id);
    return;
  }
  const group = item.kind === 'fireball' ? AppState.fireballLayer : AppState.craterLayer;
  if (!group) return;
  if (!AppState.map.hasLayer(group)) {
    // Layer is toggled off — switch it back on (and keep the checkbox in sync)
    AppState.map.addLayer(group);
    const cb = document.querySelector(`input[data-layer="${item.kind}s"]`);
    if (cb) cb.checked = true;
  }
  const marker = _markerAt(group, item.rec.lat, item.rec.lng);
  AppState.map.flyTo([item.rec.lat, item.rec.lng], 8, { duration: 1.2 });
  if (marker) {
    setTimeout(() => group.zoomToShowLayer(marker, () => setTimeout(() => marker.openPopup(), 200)), 1350);
  }
}

/* ── Panel state ── */

function _setNearStatus(html) {
  document.getElementById('near-body').innerHTML = html;
}

function openNearPanel() {
  const panel = document.getElementById('near-panel');
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
  document.getElementById('near-btn').classList.add('active');
  document.getElementById('near-btn').setAttribute('aria-pressed', 'true');
}

function closeNearPanel() {
  const panel = document.getElementById('near-panel');
  panel.classList.add('hidden');
  panel.setAttribute('aria-hidden', 'true');
  document.getElementById('near-btn').classList.remove('active');
  document.getElementById('near-btn').setAttribute('aria-pressed', 'false');
  if (_nearOverlay) { _nearOverlay.remove(); _nearOverlay = null; }
  _nearOrigin = null;
}

function setNearOrigin(lat, lng, source) {
  _nearOrigin = { lat, lng, source };
  document.getElementById('near-title').textContent = source === 'gps' ? 'Near you' : 'Near this point';
  openNearPanel();
  renderNearby();
}

function useMapCenter() {
  const c = AppState.map.getCenter();
  setNearOrigin(c.lat, L.Util.wrapNum(c.lng, [-180, 180], true), 'map');
}

function locateUser() {
  openNearPanel();
  document.getElementById('near-title').textContent = 'Near you';
  if (!('geolocation' in navigator)) {
    _setNearStatus(`<p class="near-summary">Your browser can't share its location.</p>
      <button class="near-alt" data-action="center">Search around the map center instead</button>`);
    return;
  }
  _setNearStatus('<p class="near-summary near-pending">Finding your location…</p>');
  navigator.geolocation.getCurrentPosition(
    pos => setNearOrigin(pos.coords.latitude, pos.coords.longitude, 'gps'),
    err => {
      const msg = err.code === err.PERMISSION_DENIED
        ? 'Location access was declined.'
        : 'Couldn’t determine your location.';
      _setNearStatus(`<p class="near-summary">${msg}</p>
        <p class="near-note">Pan the map to any place, then:</p>
        <button class="near-alt" data-action="center">Search around the map center</button>`);
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
  );
}

/** Build a shareable link — coordinates rounded to 2 dp (~1 km) for privacy. */
function copyNearLink() {
  if (!_nearOrigin) return;
  const params = new URLSearchParams(window.location.search);
  params.set('near', `${_nearOrigin.lat.toFixed(2)},${_nearOrigin.lng.toFixed(2)}`);
  params.set('r', String(_nearRadius));
  params.delete('focus');
  const url = `${location.origin}${location.pathname}?${params}`;
  const done = () => showToast('Link copied — location rounded to ~1 km');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url).then(done, () => window.prompt('Copy this link:', url));
  } else {
    window.prompt('Copy this link:', url);
  }
}

/** Parse ?near=lat,lng&r=km. Returns { lat, lng, r } or null. */
function readNearParam() {
  const params = new URLSearchParams(window.location.search);
  const near = params.get('near');
  if (!near) return null;
  const [lat, lng] = near.split(',').map(parseFloat);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const r = parseInt(params.get('r'), 10);
  return { lat, lng, r: NEAR_RADII.includes(r) ? r : NEAR_DEFAULT_R };
}

/** Wire up the button + panel. Call once data has loaded. */
function initNearby() {
  const btn   = document.getElementById('near-btn');
  const panel = document.getElementById('near-panel');
  if (!btn || !panel || btn.dataset.bound) return;   // Retry re-runs init()
  btn.dataset.bound = '1';

  btn.addEventListener('click', () => {
    if (!panel.classList.contains('hidden')) closeNearPanel();
    else locateUser();
  });
  document.getElementById('near-close').addEventListener('click', closeNearPanel);
  document.getElementById('near-share').addEventListener('click', copyNearLink);
  document.getElementById('near-recenter').addEventListener('click', useMapCenter);

  const radiusGroup = document.getElementById('near-radius');
  radiusGroup.addEventListener('click', e => {
    const b = e.target.closest('button[data-r]');
    if (!b) return;
    _nearRadius = parseInt(b.dataset.r, 10);
    radiusGroup.querySelectorAll('button').forEach(x => {
      const on = x === b;
      x.classList.toggle('active', on);
      x.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (_nearOrigin) renderNearby();
  });

  panel.addEventListener('click', e => {
    const item = e.target.closest('.near-item');
    if (item) {
      const result = _nearResults[parseInt(item.dataset.idx, 10)];
      if (result) _focusNearItem(result);
      if (window.matchMedia('(max-width: 768px)').matches) panel.classList.add('minimized');
      return;
    }
    if (e.target.closest('[data-action="center"]')) useMapCenter();
  });
  document.getElementById('near-header').addEventListener('click', e => {
    if (!e.target.closest('button')) panel.classList.toggle('minimized');
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel.classList.contains('hidden')) closeNearPanel();
  });

  // Shared link: ?near=lat,lng&r=km
  const shared = readNearParam();
  if (shared) {
    const b = radiusGroup.querySelector(`button[data-r="${shared.r}"]`);
    if (b) b.click();
    // Deferred like ?focus= — flying the map mid-init throws NaN LatLng errors
    setTimeout(() => setNearOrigin(shared.lat, shared.lng, 'link'), 600);
  }

  // Keep the list in sync when filters change
  const prev = AppState.onFilterChange;
  AppState.onFilterChange = function () {
    prev.apply(this, arguments);
    if (_nearOrigin) renderNearby(false);
  };
}
