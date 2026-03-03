'use strict';

/* ═══════════════════════════════════════════════════
   data.js — NASA API fetch + data cleaning
   ═══════════════════════════════════════════════════ */

const NASA_URL = 'https://data.nasa.gov/resource/y77d-th95.json?$limit=50000';

/**
 * Shared utility — available to all files loaded after data.js
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Fetch and clean the NASA meteorite dataset.
 * Returns a Promise<Array<Meteorite>> where each Meteorite is:
 *   { id, name, recclass, mass, fall, year, lat, lng }
 */
async function fetchMeteorites() {
  const response = await fetch(NASA_URL);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} — ${response.statusText}`);
  }

  const raw = await response.json();

  return raw
    .filter(m => m.nametype === 'Valid')
    .filter(m => {
      const lat = parseFloat(m.reclat);
      const lng = parseFloat(m.reclong);
      // Skip missing coordinates (0,0 is a sentinel for "unknown")
      return !isNaN(lat) && !isNaN(lng) && !(lat === 0 && lng === 0);
    })
    .map(m => ({
      id:       m.id,
      name:     m.name || 'Unknown',
      recclass: m.recclass || 'Unknown',
      mass:     m.mass ? parseFloat(m.mass) : null,
      fall:     m.fall || 'Unknown',
      year:     m.year ? new Date(m.year).getFullYear() : null,
      lat:      parseFloat(m.reclat),
      lng:      parseFloat(m.reclong),
    }));
}
