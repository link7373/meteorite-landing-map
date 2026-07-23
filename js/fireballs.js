'use strict';

/* ═══════════════════════════════════════════════════
   fireballs.js — CNEOS fireball data + markers
   NASA/JPL Center for Near Earth Object Studies
   ═══════════════════════════════════════════════════ */

const CNEOS_URL = 'https://ssd-api.jpl.nasa.gov/fireball.api?limit=2000';

/** Convert CNEOS lat/lat-dir/lon/lon-dir to signed decimal degrees */
function parseFireballCoords(lat, latDir, lon, lonDir) {
  if (!lat || !lon) return null;
  const parsedLat = parseFloat(lat) * (latDir === 'S' ? -1 : 1);
  const parsedLon = parseFloat(lon) * (lonDir === 'W' ? -1 : 1);
  if (isNaN(parsedLat) || isNaN(parsedLon)) return null;
  return { lat: parsedLat, lng: parsedLon };
}

/** Marker radius from impact energy (kt), logarithmic, clamped */
function getFireballRadius(energyKt) {
  if (!energyKt) return 8;
  return Math.max(8, Math.min(Math.log10(parseFloat(energyKt) + 1) * 10, 28));
}

/** Build popup HTML for a fireball record */
function buildFireballPopup(f) {
  const coords = `${Math.abs(f.lat).toFixed(2)}°${f.lat >= 0 ? 'N' : 'S'}, ${Math.abs(f.lng).toFixed(2)}°${f.lng >= 0 ? 'E' : 'W'}`;
  const energy  = f.impactE  ? `${parseFloat(f.impactE).toFixed(2)} kt` : 'Unknown';
  const radiated = f.energy  ? `${parseFloat(f.energy).toFixed(2)} × 10¹⁰ J` : 'Unknown';
  const vel     = f.vel      ? `${parseFloat(f.vel).toFixed(1)} km/s` : '—';
  const alt     = f.alt      ? `${parseFloat(f.alt).toFixed(0)} km` : '—';

  return `
    <div class="meteorite-popup fireball-popup">
      <div class="popup-header">
        <div class="popup-name">${escapeHtml(f.date)}</div>
        <span class="popup-badge fireball-badge">FIREBALL</span>
      </div>
      <div class="popup-grid" style="margin-top:10px;">
        <div><span class="popup-stat-label">Impact Energy</span><span class="popup-stat-value">${energy}</span></div>
        <div><span class="popup-stat-label">Velocity</span><span class="popup-stat-value">${vel}</span></div>
        <div><span class="popup-stat-label">Altitude</span><span class="popup-stat-value">${alt}</span></div>
        <div><span class="popup-stat-label">Radiated</span><span class="popup-stat-value">${radiated}</span></div>
      </div>
      <div class="popup-coords">${coords}</div>
      <p class="fireball-note">Detected by US gov sensors — not a confirmed ground recovery.</p>
    </div>`;
}

/**
 * Return all fireball records. Prefers the build-time baked file
 * (data/fireballs.json — fast, no cross-origin dependency); falls back to a
 * live CNEOS fetch only if the baked file is missing or unreadable.
 */
async function fetchFireballs() {
  try {
    const res = await fetch('/data/fireballs.json');
    if (res.ok) return await res.json();
  } catch (_) { /* fall through to live API */ }
  return fetchFireballsLive();
}

/** Fetch + parse all CNEOS fireball records (live fallback) */
async function fetchFireballsLive() {
  const res = await fetch(CNEOS_URL);
  if (!res.ok) throw new Error(`CNEOS API error: ${res.status}`);
  const json = await res.json();

  const fields = json.fields;
  const data   = json.data;
  if (!Array.isArray(fields) || !Array.isArray(data)) {
    throw new Error('CNEOS API returned unexpected shape');
  }
  const dateIdx    = fields.indexOf('date');
  const energyIdx  = fields.indexOf('energy');
  const impactIdx  = fields.indexOf('impact-e');
  const latIdx     = fields.indexOf('lat');
  const latDirIdx  = fields.indexOf('lat-dir');
  const lonIdx     = fields.indexOf('lon');
  const lonDirIdx  = fields.indexOf('lon-dir');
  const altIdx     = fields.indexOf('alt');
  const velIdx     = fields.indexOf('vel');

  const result = [];
  for (const row of data) {
    const coords = parseFireballCoords(row[latIdx], row[latDirIdx], row[lonIdx], row[lonDirIdx]);
    if (!coords) continue;
    result.push({
      date:    row[dateIdx],
      energy:  row[energyIdx],
      impactE: row[impactIdx],
      alt:     row[altIdx],
      vel:     row[velIdx],
      lat:     coords.lat,
      lng:     coords.lng,
    });
  }
  return result;
}

/** Build and return a MarkerClusterGroup for all fireballs */
function createFireballLayer(fireballs) {
  const group = L.markerClusterGroup({
    maxClusterRadius: 40,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      const size  = count < 10 ? 28 : count < 100 ? 36 : 46;
      return L.divIcon({
        html: `<div class="fireball-cluster" style="width:${size}px;height:${size}px;font-size:${size < 36 ? 10 : 11}px;">${count}</div>`,
        className: '',
        iconSize: [size, size],
      });
    },
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
  });

  for (const f of fireballs) {
    const radius = getFireballRadius(f.impactE);
    const marker = L.divIcon({
      html: `<div class="fireball-marker" style="width:${radius}px;height:${radius}px;"></div>`,
      className: '',
      iconSize:   [radius, radius],
      iconAnchor: [radius / 2, radius / 2],
    });
    const m = L.marker([f.lat, f.lng], { icon: marker });
    m.bindPopup(buildFireballPopup(f), { className: 'meteorite-popup-wrap', maxWidth: 280 });
    group.addLayer(m);
  }

  return group;
}

/** Entry point — call from app.js init() */
async function initFireballs() {
  const fireballs = await fetchFireballs();
  AppState.fireballs     = fireballs;
  AppState.fireballLayer = createFireballLayer(fireballs);
  AppState.map.addLayer(AppState.fireballLayer);
  return fireballs;
}
