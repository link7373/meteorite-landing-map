'use strict';

/* ═══════════════════════════════════════════════════
   url.js — URL param read/write for filter deep linking
   Loaded after filters.js, before app.js.
   ═══════════════════════════════════════════════════ */

const VALID_MASS = ['all','tiny','small','medium','large','xlarge','massive'];
const VALID_FALL = ['both','Fell','Found'];

/**
 * Read filter state from the current URL search params.
 * Returns a partial filters object (only keys present in URL).
 */
function readURLParams() {
  const params = new URLSearchParams(window.location.search);
  const out = {};

  const year = params.get('year');
  if (year) {
    const parts = year.split('-');
    const min = parseInt(parts[0]);
    const max = parseInt(parts[1]);
    if (!isNaN(min)) out.yearMin = min;
    if (!isNaN(max)) out.yearMax = max;
  }

  const fall = params.get('fall');
  if (fall && VALID_FALL.includes(fall)) out.fallType = fall;

  const mass = params.get('mass');
  if (mass && VALID_MASS.includes(mass)) out.massCategory = mass;

  const cls = params.get('class');
  if (cls) out.classes = cls.split(',').map(c => c.trim()).filter(Boolean);

  return out;
}

/**
 * Write current filter state to the URL (no page reload).
 */
function writeURLParams(filters) {
  const params = new URLSearchParams();

  if (filters.yearMin != null || filters.yearMax != null) {
    params.set('year', `${filters.yearMin ?? ''}-${filters.yearMax ?? ''}`);
  }
  if (filters.fallType && filters.fallType !== 'both') {
    params.set('fall', filters.fallType);
  }
  if (filters.massCategory && filters.massCategory !== 'all') {
    params.set('mass', filters.massCategory);
  }
  if (filters.classes && filters.classes.length > 0) {
    params.set('class', filters.classes.join(','));
  }

  const search = params.toString();
  history.replaceState(null, '', search ? `?${search}` : window.location.pathname);
}
