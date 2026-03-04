'use strict';

/* ═══════════════════════════════════════════════════
   map.js — Leaflet map, markers, clustering, popups
   ═══════════════════════════════════════════════════ */

let _heatLayer  = null;
let _heatActive = false;

/** Initialize the Leaflet map and return the instance */
function initMap() {
  const map = L.map('map', {
    center: [20, 10],
    zoom: 2,
    minZoom: 2,
    zoomControl: false,
    preferCanvas: false, // CircleMarker works better with SVG for popups
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  // Zoom control — bottom right, above stats bar (margin set in CSS)
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  return map;
}

/** Circle marker radius — logarithmic scale with clamping */
function getMarkerRadius(mass) {
  if (!mass) return 4;
  return Math.max(4, Math.min(Math.log10(mass) * 2.8, 18));
}

/** Marker fill color by fall type */
function getMarkerColor(fall) {
  return fall === 'Fell' ? '#f59e0b' : '#06b6d4';
}

/** Format mass in human-readable units */
function formatMass(g) {
  if (g === null || g === undefined) return 'Unknown';
  if (g < 1)    return `${g.toFixed(2)} g`;
  if (g < 1000) return `${g.toFixed(1)} g`;
  if (g < 1e6)  return `${(g / 1000).toFixed(2)} kg`;
  return `${(g / 1e6).toFixed(3)} t`;
}

/** Format lat/lng as directional strings */
function formatCoords(lat, lng) {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(3)}°${latDir}, ${Math.abs(lng).toFixed(3)}°${lngDir}`;
}

/** Build HTML string for a meteorite popup */
function buildPopupHTML(m) {
  const badgeClass = m.fall === 'Fell' ? 'fell' : 'found';
  return `
    <div class="meteorite-popup">
      <div class="popup-header">
        <h3 class="popup-name">${escapeHtml(m.name)}</h3>
        <span class="popup-badge ${badgeClass}">${escapeHtml(m.fall)}</span>
      </div>
      <div class="popup-class">${escapeHtml(m.recclass)}</div>
      <div class="popup-grid">
        <div class="popup-stat">
          <span class="popup-stat-label">Mass</span>
          <span class="popup-stat-value">${formatMass(m.mass)}</span>
        </div>
        <div class="popup-stat">
          <span class="popup-stat-label">Year</span>
          <span class="popup-stat-value">${m.year !== null ? m.year : 'Unknown'}</span>
        </div>
      </div>
      <div class="popup-coords">${formatCoords(m.lat, m.lng)}</div>
    </div>
  `.trim();
}

/**
 * Create marker cluster group and populate all markers.
 * Stores individual markers in AppState.markerMap for later lookup.
 * Returns the L.MarkerClusterGroup instance.
 */
function createMarkerLayer(meteorites) {
  const clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 60,
    chunkedLoading: true,
    chunkInterval: 150,
    chunkDelay: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      let size = 'sm';
      if (count > 1000) size = 'lg';
      else if (count > 100) size = 'md';

      const dim = size === 'lg' ? 52 : size === 'md' ? 40 : 30;
      const label = count >= 10000
        ? '10k+'
        : count >= 1000
          ? `${(count / 1000).toFixed(1)}k`
          : String(count);

      return L.divIcon({
        html: `<div class="cluster-icon cluster-${size}"><span>${label}</span></div>`,
        className: '',         // prevent Leaflet default cluster styles
        iconSize:   [dim, dim],
        iconAnchor: [dim / 2, dim / 2],
      });
    },
  });

  // Build all markers and register in AppState.markerMap
  const markers = [];
  meteorites.forEach(m => {
    const marker = L.circleMarker([m.lat, m.lng], {
      radius:      getMarkerRadius(m.mass),
      fillColor:   getMarkerColor(m.fall),
      fillOpacity: 0.85,
      color:       'transparent',
      weight:      0,
    });

    marker.bindPopup(buildPopupHTML(m), {
      maxWidth: 280,
      className: '',
    });

    AppState.markerMap.set(m.id, marker);
    markers.push(marker);
  });

  // Bulk add for performance
  clusterGroup.addLayers(markers);
  return clusterGroup;
}

/**
 * Swap visible markers to match the filtered array.
 * Uses the pre-built markerMap for O(1) lookup — no marker recreation.
 */
function updateMarkers(filtered) {
  const visibleIds = new Set(filtered.map(m => m.id));

  AppState.markerLayer.clearLayers();

  const toAdd = [];
  AppState.markerMap.forEach((marker, id) => {
    if (visibleIds.has(id)) toAdd.push(marker);
  });

  AppState.markerLayer.addLayers(toAdd);

  // Rebuild heat layer if active
  if (_heatActive && _heatLayer) {
    _heatLayer.remove();
    _heatLayer = buildHeatLayer(filtered);
    _heatLayer.addTo(AppState.map);
  }
}

/**
 * Build a Leaflet.heat layer from a meteorite array.
 * Mass is used as intensity (log-scaled, clamped 0–1).
 */
function buildHeatLayer(meteorites) {
  const points = meteorites.map(m => {
    const intensity = m.mass ? Math.min(Math.log10(m.mass + 1) / 7, 1) : 0.2;
    return [m.lat, m.lng, intensity];
  });
  return L.heatLayer(points, {
    radius:   18,
    blur:     15,
    maxZoom:  10,
    gradient: { 0.2: '#06b6d4', 0.5: '#f59e0b', 1.0: '#ef4444' },
  });
}

/**
 * Toggle between cluster view and heatmap view.
 */
function toggleHeatmap() {
  _heatActive = !_heatActive;
  const btn = document.getElementById('heatmap-toggle');

  if (_heatActive) {
    AppState.map.removeLayer(AppState.markerLayer);
    _heatLayer = buildHeatLayer(AppState.filtered);
    _heatLayer.addTo(AppState.map);
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
  } else {
    if (_heatLayer) { _heatLayer.remove(); _heatLayer = null; }
    AppState.map.addLayer(AppState.markerLayer);
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
  }
}
