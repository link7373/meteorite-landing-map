'use strict';

/* ═══════════════════════════════════════════════════
   app.js — global state, initialization, module wiring
   Loaded last — all other modules are already defined.
   ═══════════════════════════════════════════════════ */

const AppState = {
  /** Raw cleaned dataset from NASA (~45k records) */
  allMeteorites: [],

  /** Currently visible subset (after filters) */
  filtered: [],

  /** Leaflet map instance */
  map: null,

  /** L.MarkerClusterGroup */
  markerLayer: null,

  /** id → L.CircleMarker, for O(1) lookup in search + updateMarkers */
  markerMap: new Map(),

  /** Active filter values */
  filters: {
    yearMin:      null,
    yearMax:      null,
    massCategory: 'all',
    fallType:     'both',
    classes:      [],
  },

  /** Called whenever filters change — recomputes and re-renders */
  onFilterChange() {
    AppState.filtered = getFilteredMeteorites(AppState.allMeteorites, AppState.filters);
    updateMarkers(AppState.filtered);
    refreshViewportStats();
    // If timeline is visible, re-render at current year with new filters
    if (typeof _tlActive !== 'undefined' && _tlActive && typeof timelineRefresh === 'function') {
      timelineRefresh();
    }
  },
};

/* ── Viewport stats helpers ── */
function getViewportMeteorites() {
  if (!AppState.map) return AppState.filtered;
  const bounds = AppState.map.getBounds();
  return AppState.filtered.filter(m => bounds.contains([m.lat, m.lng]));
}

function refreshViewportStats() {
  updateStats(getViewportMeteorites(), AppState.filtered.length);
}

/* ── Toast helper ── */
let _toastTimer = null;
function showToast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  if (!el) return;
  clearTimeout(_toastTimer);
  el.textContent = msg;
  el.classList.remove('hidden', 'fading');
  _toastTimer = setTimeout(() => {
    el.classList.add('fading');
    setTimeout(() => el.classList.add('hidden'), 400);
  }, duration);
}

/* ── Surprise Me ── */
function surpriseMe() {
  const pool = AppState.filtered;
  if (!pool.length) {
    showToast('No meteorites in the current filter!');
    return;
  }
  const m      = pool[Math.floor(Math.random() * pool.length)];
  const marker = AppState.markerMap.get(m.id);
  if (!marker) return;
  // Fly to a comfortable regional zoom, then de-cluster and open popup
  AppState.map.flyTo([m.lat, m.lng], 6, { animate: true, duration: 1.2 });
  setTimeout(() => {
    AppState.markerLayer.zoomToShowLayer(marker, () => {
      setTimeout(() => marker.openPopup(), 200);
    });
  }, 1400);
}

/* ── About Modal ── */
function toggleAbout() {
  const modal = document.getElementById('about-modal');
  const isHidden = modal.classList.contains('hidden');
  modal.classList.toggle('hidden', !isHidden);
  modal.setAttribute('aria-hidden', isHidden ? 'false' : 'true');
}

document.getElementById('about-btn').addEventListener('click', toggleAbout);
document.getElementById('about-modal-close').addEventListener('click', toggleAbout);
document.getElementById('about-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) toggleAbout();
});

document.getElementById('surprise-btn').addEventListener('click', surpriseMe);
document.getElementById('heatmap-toggle').addEventListener('click', toggleHeatmap);
document.getElementById('home-btn').addEventListener('click', () => {
  AppState.map.flyTo([20, 10], 2, { animate: true, duration: 1.0 });
});

/* ── Loading UI helpers ── */

function showLoading(text) {
  const overlay  = document.getElementById('loading-overlay');
  const textEl   = document.getElementById('loading-text');
  const barWrap  = document.querySelector('.loading-bar-wrap');
  const retryBtn = document.getElementById('retry-btn');

  overlay.classList.remove('fade-out');
  overlay.style.display = '';
  if (textEl)   textEl.textContent = text;
  if (barWrap)  barWrap.style.display = '';
  if (retryBtn) retryBtn.classList.add('hidden');
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  overlay.classList.add('fade-out');
  setTimeout(() => { overlay.style.display = 'none'; }, 520);
}

function showError(err) {
  const textEl   = document.getElementById('loading-text');
  const barWrap  = document.querySelector('.loading-bar-wrap');
  const retryBtn = document.getElementById('retry-btn');

  if (textEl)   textEl.textContent = `Could not load data: ${err.message}`;
  if (barWrap)  barWrap.style.display = 'none';
  if (retryBtn) retryBtn.classList.remove('hidden');
}

/* ── Main initialization ── */

async function init() {
  showLoading('Fetching meteorite data…');

  try {
    // Phase 1 — fetch + clean data
    AppState.allMeteorites = await fetchMeteorites();
    AppState.filtered      = AppState.allMeteorites;

    // Phase 2 — map + markers
    AppState.map         = initMap();
    AppState.markerLayer = createMarkerLayer(AppState.allMeteorites);
    AppState.map.addLayer(AppState.markerLayer);

    // Phase 3–5 — filters, stats, search
    const urlFilters = typeof readURLParams === 'function' ? readURLParams() : {};
    initFilters(AppState.allMeteorites, urlFilters);

    // Apply URL filters to AppState immediately
    if (Object.keys(urlFilters).length > 0) {
      AppState.filters = { ...AppState.filters, ...urlFilters };
      AppState.filtered = getFilteredMeteorites(AppState.allMeteorites, AppState.filters);
      updateMarkers(AppState.filtered);
    }

    initSearch();
    if (typeof initClassificationGuide === 'function') initClassificationGuide();
    initTimeline(AppState.allMeteorites);

    // Update stats whenever the viewport changes
    AppState.map.on('moveend zoomend', refreshViewportStats);
    refreshViewportStats();

    hideLoading();
  } catch (err) {
    console.error('[MeteoriteMap] init error:', err);
    showError(err);
  }
}

/* ── Retry handler ── */
document.getElementById('retry-btn').addEventListener('click', () => {
  // Clear stale state before retrying
  AppState.markerMap.clear();
  AppState.allMeteorites = [];
  AppState.filtered      = [];

  if (AppState.markerLayer) {
    AppState.markerLayer.clearLayers();
    AppState.markerLayer = null;
  }

  init();
});

/* ── Kick off on DOM ready ──
   Scripts are at the bottom of <body>, so DOM is already parsed.
   Using 'DOMContentLoaded' as a safe fallback. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
