'use strict';

/* ═══════════════════════════════════════════════════
   stats.js — live-updating statistics bar
   ═══════════════════════════════════════════════════ */

/**
 * Recalculate and render all stat values from the given meteorite array.
 * @param {Array}  meteorites  - meteorites currently in the viewport
 * @param {number} [filterTotal] - total matching active filters (denominator); defaults to allMeteorites.length
 * formatMass() is defined in map.js (loaded before stats.js).
 */
function updateStats(meteorites, filterTotal) {
  const total    = meteorites.length;
  const totalAll = filterTotal !== undefined ? filterTotal : AppState.allMeteorites.length;

  // ── Visible count ──
  _setText('stat-total', `${total.toLocaleString()} / ${totalAll.toLocaleString()}`);

  // ── Heaviest ──
  const withMass = meteorites.filter(m => m.mass !== null);
  const heaviest = withMass.length
    ? withMass.reduce((a, b) => a.mass > b.mass ? a : b)
    : null;

  const heaviestEl = document.getElementById('stat-heaviest');
  if (heaviestEl) {
    if (heaviest) {
      heaviestEl.textContent = `${heaviest.name} (${formatMass(heaviest.mass)})`;
      heaviestEl.title       = heaviest.name;
    } else {
      heaviestEl.textContent = '—';
      heaviestEl.title       = '';
    }
  }

  // ── Oldest ──
  const withYear = meteorites.filter(m => m.year !== null);
  const oldest   = withYear.length
    ? withYear.reduce((a, b) => a.year < b.year ? a : b)
    : null;

  const oldestEl = document.getElementById('stat-oldest');
  if (oldestEl) {
    if (oldest) {
      oldestEl.textContent = `${oldest.name} (${oldest.year})`;
      oldestEl.title       = oldest.name;
    } else {
      oldestEl.textContent = '—';
      oldestEl.title       = '';
    }
  }

  // ── Fell / Found ──
  let fellCount = 0, foundCount = 0;
  for (const m of meteorites) {
    if (m.fall === 'Fell')  fellCount++;
    else if (m.fall === 'Found') foundCount++;
  }
  _setText('stat-fell',  fellCount.toLocaleString());
  _setText('stat-found', foundCount.toLocaleString());

  // Keep the sidebar filter count in sync
  if (typeof updateFilterCount === 'function') {
    updateFilterCount(total, totalAll);
  }
}

function _setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
