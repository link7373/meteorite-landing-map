'use strict';

/* ═══════════════════════════════════════════════════
   minimap.js — lazy locator map for generated detail pages
   Renders <figure class="minimap" data-lat data-lng data-kind data-points>
   Leaflet is only fetched once the figure scrolls near the viewport,
   so it never blocks first paint on the (SEO-critical) detail pages.
   ═══════════════════════════════════════════════════ */

(function () {
  const fig = document.querySelector('.minimap');
  if (!fig) return;

  // Same versions + basemap as the main map (js/map.js)
  const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  const CARTO_KEY   = 'cb1_2qwk_1_029ded84bd641e1954ed765c';
  const COLORS      = { fell: '#f59e0b', found: '#06b6d4', crater: '#a16207' };

  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = LEAFLET_CSS;
    document.head.appendChild(css);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LEAFLET_JS;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function dot(latlng, kind, main) {
    const color = COLORS[kind] || COLORS.found;
    return kind === 'crater'
      ? L.circleMarker(latlng, { radius: main ? 9 : 6, color, weight: 2, fill: false, interactive: false })
      : L.circleMarker(latlng, {
          radius: main ? 8 : 4, stroke: main, color: '#fff', weight: 2,
          fillColor: color, fillOpacity: main ? 1 : 0.75, interactive: false,
        });
  }

  function render() {
    const lat = parseFloat(fig.dataset.lat);
    const lng = parseFloat(fig.dataset.lng);
    let points = [];
    try { points = JSON.parse(fig.dataset.points || '[]'); } catch (_) { /* no neighbours */ }

    const map = L.map(fig, {
      zoomControl: true,
      scrollWheelZoom: false,          // don't hijack page scrolling
      dragging: !L.Browser.mobile,     // one-finger swipes should scroll the page
      tap: false,
      attributionControl: true,
    });
    L.tileLayer(`https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png?key=${CARTO_KEY}`, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    // Frame the record plus its two nearest neighbours so the view stays local
    const here  = L.latLng(lat, lng);
    const close = points.map(p => L.latLng(p[0], p[1]))
      .sort((a, b) => here.distanceTo(a) - here.distanceTo(b)).slice(0, 2);
    const frame = [here, ...close];
    points.forEach(p => dot([p[0], p[1]], p[2], false).addTo(map));
    dot([lat, lng], fig.dataset.kind, true).addTo(map);
    map.fitBounds(frame, { padding: [30, 30], maxZoom: 8 });
    if (map.getZoom() < 3) map.setView([lat, lng], 3);
  }

  function start() {
    loadLeaflet().then(render).catch(() => fig.classList.add('minimap-failed'));
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      if (entries.some(en => en.isIntersecting)) { io.disconnect(); start(); }
    }, { rootMargin: '200px' });
    io.observe(fig);
  } else {
    start();
  }
})();
