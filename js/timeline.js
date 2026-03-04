'use strict';

/* ═══════════════════════════════════════════════════
   timeline.js — year-by-year playback with falling
   meteor animations at 1× speed.
   ═══════════════════════════════════════════════════ */

const TICK_MS    = { 1: 800, 5: 160, 10: 80 };
const MAX_ANIM   = 15;   // max simultaneous falling-meteor animations

let _tlSlider    = null;
let _playing     = false;
let _currentYear = null;
let _minYear     = null;
let _maxYear     = null;
let _speed       = 1;
let _tickTimer   = null;
let _animLayer   = null;   // L.layerGroup for temporary animation markers
let _tlActive    = false;

/* ── Public init ── */
function initTimeline(meteorites) {
  const years = meteorites.filter(m => m.year !== null).map(m => m.year);
  _minYear    = Math.min(...years);
  _maxYear    = Math.max(...years);
  _currentYear = _minYear;

  _initSlider();
  _initButtons();

  document.getElementById('timeline-toggle').addEventListener('click', _toggleTimeline);
}

/* ── Slider ── */
function _initSlider() {
  const el = document.getElementById('tl-slider');
  _tlSlider = noUiSlider.create(el, {
    start:  _minYear,
    range:  { min: _minYear, max: _maxYear },
    step:   1,
    tooltips: false,
    format: { to: v => Math.round(v), from: v => Number(v) },
  });

  _tlSlider.on('slide', values => {
    _pause();
    _setYear(parseInt(values[0]));
  });
}

/* ── Buttons ── */
function _initButtons() {
  document.getElementById('tl-play').addEventListener('click', () => {
    if (_playing) _pause(); else _play();
  });

  document.getElementById('tl-reset').addEventListener('click', () => {
    _pause();
    _setYear(_minYear);
  });

  document.querySelectorAll('.tl-speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _speed = parseInt(btn.dataset.speed);
      document.querySelectorAll('.tl-speed-btn').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      if (_playing) { clearInterval(_tickTimer); _tickTimer = setInterval(_tick, TICK_MS[_speed]); }
    });
  });
}

/* ── Show / hide ── */
function _toggleTimeline() {
  _tlActive = !_tlActive;
  const bar = document.getElementById('timeline-bar');
  const btn = document.getElementById('timeline-toggle');

  if (_tlActive) {
    bar.classList.remove('hidden');
    document.body.classList.add('timeline-open');
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    // Create animation layer
    _animLayer = L.layerGroup().addTo(AppState.map);
    // Render map at minYear
    _setYear(_minYear);
  } else {
    _pause();
    bar.classList.add('hidden');
    document.body.classList.remove('timeline-open');
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
    if (_animLayer) { _animLayer.clearLayers(); _animLayer.remove(); _animLayer = null; }
    // Restore normal filtered view
    AppState.onFilterChange();
  }
}

/* ── Playback ── */
function _play() {
  if (_currentYear >= _maxYear) _setYear(_minYear);
  _playing = true;
  _setPlayIcon(true);
  _tickTimer = setInterval(_tick, TICK_MS[_speed]);
}

function _pause() {
  _playing = false;
  clearInterval(_tickTimer);
  _tickTimer = null;
  _setPlayIcon(false);
}

function _setPlayIcon(playing) {
  const btn = document.getElementById('tl-play');
  btn.querySelector('.icon-play').classList.toggle('hidden', playing);
  btn.querySelector('.icon-pause').classList.toggle('hidden', !playing);
  btn.setAttribute('aria-label', playing ? 'Pause timeline' : 'Play timeline');
}

function _tick() {
  if (_currentYear >= _maxYear) {
    _pause();
    return;
  }
  const prevYear = _currentYear;
  _setYear(_currentYear + 1, prevYear);
}

/* ── Core year setter ── */
function _setYear(year, prevYear = null) {
  _currentYear = year;
  document.getElementById('tl-year').textContent = year;
  _tlSlider.set(year, false);  // update handle silently

  // Get the base filtered set (respects all sidebar filters EXCEPT year)
  const baseFilters = { ...AppState.filters, yearMin: null, yearMax: null };
  const allVisible  = getFilteredMeteorites(AppState.allMeteorites, baseFilters)
                        .filter(m => m.year === null || m.year <= year);

  // Determine new meteorites for animation (only at 1× speed, when playing)
  let toAnimate = [];
  if (_playing && _speed === 1 && prevYear !== null) {
    toAnimate = allVisible.filter(m => m.year === year);
    if (toAnimate.length > MAX_ANIM) toAnimate = [];  // too many — skip anim
  }

  updateMarkers(allVisible);
  updateStats(allVisible);

  // Play falling animations
  if (toAnimate.length > 0) {
    toAnimate.forEach(m => _animateFall(m));
  }
}

/* ── Falling meteor animation ── */
function _animateFall(m) {
  if (!_animLayer || !AppState.map) return;

  const icon = L.divIcon({
    className: '',
    html: `<div class="marker-anim-wrap"><div class="marker-anim-dot"></div></div>`,
    iconSize:   [12, 12],
    iconAnchor: [6, 6],
  });

  const marker = L.marker([m.lat, m.lng], { icon, interactive: false, keyboard: false });
  _animLayer.addLayer(marker);

  // Remove after animation completes (500ms fall + 250ms pulse + buffer)
  setTimeout(() => {
    if (_animLayer) _animLayer.removeLayer(marker);
  }, 900);
}

/* ── Public refresh (called from app.js onFilterChange when timeline is active) ── */
function timelineRefresh() {
  if (_tlActive && _currentYear !== null) _setYear(_currentYear);
}
