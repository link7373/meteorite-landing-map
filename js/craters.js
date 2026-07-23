'use strict';

/* ═══════════════════════════════════════════════════
   craters.js — Earth Impact Crater data + markers
   Source: PASSC Earth Impact Database via GitHub
   ═══════════════════════════════════════════════════ */

const CRATER_CSV_URL =
  'https://raw.githubusercontent.com/cjwinchester/earth-impact-data/main/earth-impact-craters.csv';

/** Parse a simple CSV string into array of objects (no quoted-field edge cases in this dataset) */
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
    return obj;
  });
}

/** Marker size from crater diameter (km), log scale, clamped */
function getCraterSize(diamKm) {
  const d = parseFloat(diamKm);
  if (!d || isNaN(d)) return 14;
  return Math.max(12, Math.min(Math.log10(d + 1) * 18, 52));
}

/** Build popup HTML for a crater record */
function buildCraterPopup(c) {
  const coords = `${Math.abs(c.lat).toFixed(3)}°${c.lat >= 0 ? 'N' : 'S'}, ${Math.abs(c.lng).toFixed(3)}°${c.lng >= 0 ? 'E' : 'W'}`;
  const age    = c.age_millions_years_ago ? `${escapeHtml(c.age_millions_years_ago)} Ma` : 'Unknown';
  const diam   = c.diameter_km ? `${escapeHtml(c.diameter_km)} km` : 'Unknown';
  const rock   = c.target_rock ? escapeHtml(c.target_rock) : '—';
  const link   = c.url
    ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer" class="ebay-link" style="border-color:rgba(161,98,7,0.4);color:var(--brown);">PASSC record →</a>`
    : '';

  return `
    <div class="meteorite-popup crater-popup">
      <div class="popup-header">
        <div class="popup-name">${escapeHtml(c.crater_name)}</div>
        <span class="popup-badge crater-badge">CRATER</span>
      </div>
      <div class="popup-class">${escapeHtml(c.country)}</div>
      <div class="popup-grid">
        <div><span class="popup-stat-label">Diameter</span><span class="popup-stat-value">${diam}</span></div>
        <div><span class="popup-stat-label">Age</span><span class="popup-stat-value">${age}</span></div>
        <div><span class="popup-stat-label">Target Rock</span><span class="popup-stat-value">${rock}</span></div>
      </div>
      <div class="popup-coords">${coords}</div>
      ${link}
    </div>`;
}

/**
 * Return all crater records. Prefers the build-time baked file
 * (data/craters.json — fast, no cross-origin dependency); falls back to a live
 * CSV fetch only if the baked file is missing or unreadable.
 */
async function fetchCraters() {
  try {
    const res = await fetch('/data/craters.json');
    if (res.ok) return await res.json();
  } catch (_) { /* fall through to live CSV */ }
  return fetchCratersLive();
}

/** Fetch + parse all crater records (live fallback) */
async function fetchCratersLive() {
  const res = await fetch(CRATER_CSV_URL);
  if (!res.ok) throw new Error(`Crater CSV fetch error: ${res.status}`);
  const text = await res.text();
  const rows  = parseCSV(text);

  return rows
    .filter(r => r.latitude && r.longitude && r.latitude !== '' && r.longitude !== '')
    .map(r => ({
      crater_name:             r.crater_name,
      country:                 r.country,
      diameter_km:             r.diameter_km,
      age_millions_years_ago:  r.age_millions_years_ago,
      target_rock:             r.target_rock,
      url:                     r.url,
      lat:                     parseFloat(r.latitude),
      lng:                     parseFloat(r.longitude),
    }))
    .filter(r => !isNaN(r.lat) && !isNaN(r.lng));
}

/** Build and return a MarkerClusterGroup for all craters */
function createCraterLayer(craters) {
  const group = L.markerClusterGroup({
    maxClusterRadius: 60,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      const size  = count < 10 ? 28 : count < 50 ? 36 : 46;
      return L.divIcon({
        html: `<div class="crater-cluster" style="width:${size}px;height:${size}px;font-size:${size < 36 ? 10 : 11}px;">${count}</div>`,
        className: '',
        iconSize: [size, size],
      });
    },
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
  });

  for (const c of craters) {
    const size   = getCraterSize(c.diameter_km);
    const icon   = L.divIcon({
      html: `<div class="crater-marker" style="width:${size}px;height:${size}px;"></div>`,
      className: '',
      iconSize:   [size, size],
      iconAnchor: [size / 2, size / 2],
    });
    const m = L.marker([c.lat, c.lng], { icon });
    m.bindPopup(buildCraterPopup(c), { className: 'meteorite-popup-wrap', maxWidth: 280 });
    group.addLayer(m);
  }

  return group;
}

/** Entry point — call from app.js init() */
async function initCraters() {
  const craters = await fetchCraters();
  AppState.craters     = craters;
  AppState.craterLayer = createCraterLayer(craters);
  AppState.map.addLayer(AppState.craterLayer);
  return craters;
}
