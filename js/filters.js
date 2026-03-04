'use strict';

/* ═══════════════════════════════════════════════════
   filters.js — filter panel UI and filter logic
   ═══════════════════════════════════════════════════ */

const MASS_RANGES = {
  all:     () => true,
  tiny:    m => m.mass !== null && m.mass < 1,
  small:   m => m.mass !== null && m.mass >= 1      && m.mass < 100,
  medium:  m => m.mass !== null && m.mass >= 100    && m.mass < 1000,
  large:   m => m.mass !== null && m.mass >= 1000   && m.mass < 100000,
  xlarge:  m => m.mass !== null && m.mass >= 100000 && m.mass < 1e6,
  massive: m => m.mass !== null && m.mass >= 1e6,
};

let _yearSlider   = null;
let _yearSliderMin = 0;
let _yearSliderMax = 9999;

/** Set up all filter UI and wire events */
function initFilters(meteorites, initialValues = {}) {
  _initYearSlider(meteorites, initialValues);
  _initMassButtons(initialValues);
  _initFallToggle(initialValues);
  _initClassCheckboxes(meteorites, initialValues);
  _initSidebarToggle();

  document.getElementById('apply-filters').addEventListener('click', applyFilters);
  document.getElementById('reset-filters').addEventListener('click', resetFilters);

  updateFilterCount(meteorites.length, meteorites.length);
}

function _initYearSlider(meteorites, initialValues) {
  const years = meteorites.filter(m => m.year !== null).map(m => m.year);
  _yearSliderMin = Math.min(...years);
  _yearSliderMax = Math.max(...years);

  const startMin = initialValues.yearMin ?? _yearSliderMin;
  const startMax = initialValues.yearMax ?? _yearSliderMax;

  const sliderEl = document.getElementById('year-slider');
  _yearSlider = noUiSlider.create(sliderEl, {
    start:  [startMin, startMax],
    connect: true,
    range:  { min: _yearSliderMin, max: _yearSliderMax },
    step:   1,
    tooltips: false,
    format: { to: v => Math.round(v), from: v => Number(v) },
  });

  const minEl = document.getElementById('year-min-val');
  const maxEl = document.getElementById('year-max-val');

  minEl.textContent = startMin;
  maxEl.textContent = startMax;

  _yearSlider.on('update', values => {
    minEl.textContent = values[0];
    maxEl.textContent = values[1];
  });
}

function _initMassButtons(initialValues) {
  const initial = initialValues.massCategory || 'all';
  document.querySelectorAll('.mass-btn').forEach(b => {
    const isActive = b.dataset.mass === initial;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  document.getElementById('mass-buttons').addEventListener('click', e => {
    const btn = e.target.closest('.mass-btn');
    if (!btn) return;
    document.querySelectorAll('.mass-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
  });
}

function _initFallToggle(initialValues) {
  const initial = initialValues.fallType || 'both';
  document.querySelectorAll('.fall-btn').forEach(b => {
    const isActive = b.dataset.fall === initial;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  document.getElementById('fall-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.fall-btn');
    if (!btn) return;
    document.querySelectorAll('.fall-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
  });
}

function _initClassCheckboxes(meteorites, initialValues) {
  const initialClasses = initialValues.classes || [];

  // Count occurrences per class
  const counts = {};
  meteorites.forEach(m => {
    counts[m.recclass] = (counts[m.recclass] || 0) + 1;
  });

  // Top 15 by count
  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  const container = document.getElementById('class-filters');
  top.forEach(([cls, count]) => {
    const safeId = `cls-${cls.replace(/[^a-z0-9]/gi, '-')}`;
    const item = document.createElement('label');
    item.className = 'class-item';
    item.htmlFor = safeId;
    item.innerHTML =
      `<input type="checkbox" id="${escapeHtml(safeId)}" value="${escapeHtml(cls)}" aria-label="Filter by ${escapeHtml(cls)}">` +
      `<span class="cls-name cls-trigger" data-class="${escapeHtml(cls)}">${escapeHtml(cls)}</span>` +
      `<span class="class-count">${count.toLocaleString()}</span>`;
    const checkbox = item.querySelector('input');
    if (initialClasses.includes(cls)) checkbox.checked = true;
    container.appendChild(item);
  });
}

function _initSidebarToggle() {
  const toggleBtn = document.getElementById('sidebar-toggle');
  const closeBtn  = document.getElementById('sidebar-close');

  toggleBtn.addEventListener('click', () => {
    document.body.classList.add('sidebar-open');
    toggleBtn.setAttribute('aria-expanded', 'true');
    closeBtn.focus();
  });

  closeBtn.addEventListener('click', () => {
    document.body.classList.remove('sidebar-open');
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.focus();
  });

  // Keyboard — Escape closes sidebar
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('sidebar-open')) {
      document.body.classList.remove('sidebar-open');
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.focus();
    }
  });
}

/** Read UI state and trigger a filter update */
function applyFilters() {
  const vals = _yearSlider.get();

  const selectedMass = document.querySelector('.mass-btn.active')?.dataset.mass || 'all';
  const selectedFall = document.querySelector('.fall-btn.active')?.dataset.fall || 'both';
  const checkedClasses = Array.from(
    document.querySelectorAll('#class-filters input:checked')
  ).map(cb => cb.value);

  AppState.filters = {
    yearMin:      parseInt(vals[0]),
    yearMax:      parseInt(vals[1]),
    massCategory: selectedMass,
    fallType:     selectedFall,
    classes:      checkedClasses,
  };

  AppState.onFilterChange();
  if (typeof writeURLParams === 'function') writeURLParams(AppState.filters);
}

/** Reset all filters to defaults */
function resetFilters() {
  _yearSlider.set([_yearSliderMin, _yearSliderMax]);

  document.querySelectorAll('.mass-btn').forEach(b => {
    const isAll = b.dataset.mass === 'all';
    b.classList.toggle('active', isAll);
    b.setAttribute('aria-pressed', isAll ? 'true' : 'false');
  });

  document.querySelectorAll('.fall-btn').forEach(b => {
    const isBoth = b.dataset.fall === 'both';
    b.classList.toggle('active', isBoth);
    b.setAttribute('aria-pressed', isBoth ? 'true' : 'false');
  });

  document.querySelectorAll('#class-filters input').forEach(cb => {
    cb.checked = false;
  });

  AppState.filters = {
    yearMin: null, yearMax: null,
    massCategory: 'all',
    fallType: 'both',
    classes: [],
  };

  AppState.onFilterChange();
  if (typeof writeURLParams === 'function') writeURLParams({});
}

/**
 * Apply all active filters to the full dataset.
 * Returns the filtered subset.
 */
function getFilteredMeteorites(all, filters) {
  const massFn = MASS_RANGES[filters.massCategory] || MASS_RANGES.all;

  return all.filter(m => {
    // Year
    if (m.year !== null) {
      if (filters.yearMin && m.year < filters.yearMin) return false;
      if (filters.yearMax && m.year > filters.yearMax) return false;
    }
    // Mass category
    if (filters.massCategory !== 'all' && !massFn(m)) return false;
    // Fall type
    if (filters.fallType !== 'both' && m.fall !== filters.fallType) return false;
    // Classification
    if (filters.classes.length > 0 && !filters.classes.includes(m.recclass)) return false;

    return true;
  });
}

/** Update the visible/total count displayed in the sidebar footer */
function updateFilterCount(visible, total) {
  const el = document.getElementById('filter-count');
  if (el) {
    el.textContent = `${visible.toLocaleString()} / ${total.toLocaleString()} meteorites`;
  }
}
