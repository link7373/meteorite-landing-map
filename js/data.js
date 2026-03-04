'use strict';

/* ═══════════════════════════════════════════════════
   data.js — NASA API fetch + data cleaning
   ═══════════════════════════════════════════════════ */

const DATA_URL = '/data/meteorites.json';

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
 * Load the pre-processed meteorite dataset.
 * Returns a Promise<Array<Meteorite>> where each Meteorite is:
 *   { id, name, recclass, mass, fall, year, lat, lng }
 */
async function fetchMeteorites() {
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} — ${response.statusText}`);
  }
  return response.json();
}
