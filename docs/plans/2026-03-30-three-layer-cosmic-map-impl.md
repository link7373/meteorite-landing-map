# Three-Layer Cosmic Map Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add CNEOS Fireball and Earth Impact Crater layers to the map, each with distinct visuals, clustering, popups, and a fireball count in the stats bar.

**Architecture:** Two new JS modules (`fireballs.js`, `craters.js`) each fetch their data source, build a `L.MarkerClusterGroup`, and expose an `init*()` function. `app.js` fetches all three datasets in parallel via `Promise.all`, adds both new layers to the map, and wires the fireball count into the stats bar. No framework, no build step — plain script tags in load order.

**Tech Stack:** Leaflet 1.9.4, Leaflet.markercluster 1.5.3, vanilla JS, CSS custom properties, NASA CNEOS API, GitHub raw CSV.

---

### Task 1: CSS variables and fireball/crater keyframe animation

**Files:**
- Modify: `css/style.css` (after existing `--cyan-bg` variable block, and after cluster icon styles)

**Step 1: Add color variables**

In `css/style.css`, after `--cyan-bg: rgba(6, 182, 212, 0.10);` add:

```css
  --rose:      #f43f5e;
  --rose-dim:  rgba(244, 63, 94, 0.55);
  --rose-glow: rgba(244, 63, 94, 0.20);
  --rose-bg:   rgba(244, 63, 94, 0.10);

  --brown:     #a16207;
  --brown-dim: rgba(161, 98, 7, 0.55);
  --brown-glow:rgba(161, 98, 7, 0.20);
  --brown-bg:  rgba(161, 98, 7, 0.10);
```

**Step 2: Add fireball pulse animation and marker styles**

After the `.cluster-lg` block in `css/style.css`, add:

```css
/* ═══════════════════════════════════════════════════
   FIREBALL MARKERS
   ═══════════════════════════════════════════════════ */
.fireball-marker {
  position: relative;
  border-radius: 50%;
  background: var(--rose);
  box-shadow: 0 0 6px var(--rose-glow);
}
.fireball-marker::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid var(--rose);
  animation: fireball-pulse 2s ease-out infinite;
}
@keyframes fireball-pulse {
  0%   { transform: scale(1);   opacity: 0.9; }
  100% { transform: scale(2.2); opacity: 0; }
}

/* ═══════════════════════════════════════════════════
   CRATER MARKERS
   ═══════════════════════════════════════════════════ */
.crater-marker {
  border-radius: 50%;
  background: transparent;
  border: 3px solid var(--brown);
  box-shadow: inset 0 0 6px rgba(161,98,7,0.3), 0 0 8px var(--brown-glow);
}

/* ── Fireball cluster icons ── */
.fireball-cluster {
  background: var(--panel-bg);
  border: 1px solid rgba(244, 63, 94, 0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--mono);
  font-weight: 500;
  color: var(--rose);
  backdrop-filter: blur(10px);
}

/* ── Crater cluster icons ── */
.crater-cluster {
  background: var(--panel-bg);
  border: 1px solid rgba(161, 98, 7, 0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--mono);
  font-weight: 500;
  color: var(--brown);
  backdrop-filter: blur(10px);
}
```

**Step 3: Bump CSS version in index.html**

Change `css/style.css?v=10` → `css/style.css?v=11`

**Step 4: Verify in preview**

Start preview server if not running. Reload. No console errors expected (CSS-only change). Screenshot to confirm map still loads.

**Step 5: Commit**

```bash
git add css/style.css index.html
git commit -m "feat: add CSS variables and marker styles for fireballs and craters"
```

---

### Task 2: Create js/fireballs.js

**Files:**
- Create: `js/fireballs.js`

**Step 1: Write the file**

```js
'use strict';

/* ═══════════════════════════════════════════════════
   fireballs.js — CNEOS fireball data + markers
   NASA/JPL Center for Near Earth Object Studies
   ═══════════════════════════════════════════════════ */

const CNEOS_URL = 'https://ssd-api.jpl.nasa.gov/fireball.api?limit=2000';

/** Convert CNEOS lat/lat-dir/lon/lon-dir to signed decimal degrees */
function parseFireballCoords(lat, latDir, lon, lonDir) {
  if (!lat || !lon) return null;
  const parsedLat = parseFloat(lat) * (latDir === 'S' ? -1 : 1);
  const parsedLon = parseFloat(lon) * (lonDir === 'W' ? -1 : 1);
  if (isNaN(parsedLat) || isNaN(parsedLon)) return null;
  return { lat: parsedLat, lng: parsedLon };
}

/** Marker radius from impact energy (kt), logarithmic, clamped */
function getFireballRadius(energyKt) {
  if (!energyKt) return 8;
  return Math.max(8, Math.min(Math.log10(parseFloat(energyKt) + 1) * 10, 28));
}

/** Build popup HTML for a fireball record */
function buildFireballPopup(f) {
  const coords = `${Math.abs(f.lat).toFixed(2)}°${f.lat >= 0 ? 'N' : 'S'}, ${Math.abs(f.lng).toFixed(2)}°${f.lng >= 0 ? 'E' : 'W'}`;
  const energy  = f.impactE  ? `${parseFloat(f.impactE).toFixed(2)} kt` : 'Unknown';
  const radiated = f.energy  ? `${parseFloat(f.energy).toFixed(2)} × 10¹⁰ J` : 'Unknown';
  const vel     = f.vel      ? `${parseFloat(f.vel).toFixed(1)} km/s` : '—';
  const alt     = f.alt      ? `${parseFloat(f.alt).toFixed(0)} km` : '—';

  return `
    <div class="meteorite-popup fireball-popup">
      <div class="popup-header">
        <div class="popup-name">${escapeHtml(f.date)}</div>
        <span class="popup-badge fireball-badge">FIREBALL</span>
      </div>
      <div class="popup-grid" style="margin-top:10px;">
        <div><span class="popup-stat-label">Impact Energy</span><span class="popup-stat-value">${energy}</span></div>
        <div><span class="popup-stat-label">Velocity</span><span class="popup-stat-value">${vel}</span></div>
        <div><span class="popup-stat-label">Altitude</span><span class="popup-stat-value">${alt}</span></div>
        <div><span class="popup-stat-label">Radiated</span><span class="popup-stat-value">${radiated}</span></div>
      </div>
      <div class="popup-coords">${coords}</div>
      <p class="fireball-note">Detected by US gov sensors — not a confirmed ground recovery.</p>
    </div>`;
}

/** Fetch + parse all CNEOS fireball records */
async function fetchFireballs() {
  const res = await fetch(CNEOS_URL);
  if (!res.ok) throw new Error(`CNEOS API error: ${res.status}`);
  const json = await res.json();

  const fields = json.fields;
  const dateIdx    = fields.indexOf('date');
  const energyIdx  = fields.indexOf('energy');
  const impactIdx  = fields.indexOf('impact-e');
  const latIdx     = fields.indexOf('lat');
  const latDirIdx  = fields.indexOf('lat-dir');
  const lonIdx     = fields.indexOf('lon');
  const lonDirIdx  = fields.indexOf('lon-dir');
  const altIdx     = fields.indexOf('alt');
  const velIdx     = fields.indexOf('vel');

  const result = [];
  for (const row of json.data) {
    const coords = parseFireballCoords(row[latIdx], row[latDirIdx], row[lonIdx], row[lonDirIdx]);
    if (!coords) continue;
    result.push({
      date:    row[dateIdx],
      energy:  row[energyIdx],
      impactE: row[impactIdx],
      alt:     row[altIdx],
      vel:     row[velIdx],
      lat:     coords.lat,
      lng:     coords.lng,
    });
  }
  return result;
}

/** Build and return a MarkerClusterGroup for all fireballs */
function createFireballLayer(fireballs) {
  const group = L.markerClusterGroup({
    maxClusterRadius: 40,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      const size  = count < 10 ? 28 : count < 100 ? 36 : 46;
      return L.divIcon({
        html: `<div class="fireball-cluster" style="width:${size}px;height:${size}px;font-size:${size < 36 ? 10 : 11}px;">${count}</div>`,
        className: '',
        iconSize: [size, size],
      });
    },
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
  });

  for (const f of fireballs) {
    const radius = getFireballRadius(f.impactE);
    const marker = L.divIcon({
      html: `<div class="fireball-marker" style="width:${radius}px;height:${radius}px;"></div>`,
      className: '',
      iconSize:   [radius, radius],
      iconAnchor: [radius / 2, radius / 2],
    });
    const m = L.marker([f.lat, f.lng], { icon: marker });
    m.bindPopup(buildFireballPopup(f), { className: 'meteorite-popup-wrap', maxWidth: 280 });
    group.addLayer(m);
  }

  return group;
}

/** Entry point — call from app.js init() */
async function initFireballs() {
  const fireballs = await fetchFireballs();
  AppState.fireballs     = fireballs;
  AppState.fireballLayer = createFireballLayer(fireballs);
  AppState.map.addLayer(AppState.fireballLayer);
  return fireballs;
}
```

**Step 2: Add popup styles for fireball badge and note**

In `css/style.css`, after the `.popup-badge.found` rule, add:

```css
.popup-badge.fireball-badge { background: var(--rose-bg); color: var(--rose); border: 1px solid var(--rose-dim); }
.popup-badge.crater-badge   { background: var(--brown-bg); color: var(--brown); border: 1px solid var(--brown-dim); }

.fireball-note {
  font-size: 0.72rem;
  color: var(--text-dim);
  font-style: italic;
  margin-top: 8px;
  line-height: 1.4;
}
```

**Step 3: Add `fireballs.js` script tag to index.html**

After `<script src="js/timeline.js?v=3"></script>`, add:

```html
<script src="js/fireballs.js?v=1"></script>
```

**Step 4: Commit**

```bash
git add js/fireballs.js css/style.css index.html
git commit -m "feat: add fireballs.js with CNEOS data fetch, markers, and popup"
```

---

### Task 3: Create js/craters.js

**Files:**
- Create: `js/craters.js`

**Step 1: Write the file**

```js
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

/** Fetch + parse all crater records */
async function fetchCraters() {
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
```

**Step 2: Add `craters.js` script tag to index.html**

After `<script src="js/fireballs.js?v=1"></script>`, add:

```html
<script src="js/craters.js?v=1"></script>
```

**Step 3: Commit**

```bash
git add js/craters.js index.html
git commit -m "feat: add craters.js with PASSC CSV fetch, markers, and popup"
```

---

### Task 4: Wire both layers into app.js

**Files:**
- Modify: `js/app.js`

**Step 1: Add new AppState properties**

In `app.js`, inside the `AppState` object after `markerMap: new Map(),`, add:

```js
  /** CNEOS fireball records */
  fireballs: [],
  /** L.MarkerClusterGroup for fireballs */
  fireballLayer: null,
  /** Impact crater records */
  craters: [],
  /** L.MarkerClusterGroup for craters */
  craterLayer: null,
```

**Step 2: Update init() to fetch all three in parallel**

Replace the existing `init()` function body. Change:
```js
    AppState.allMeteorites = await fetchMeteorites();
```
to:
```js
    showLoading('Fetching meteorite, fireball, and crater data…');
    const [meteorites] = await Promise.all([
      fetchMeteorites(),
      initFireballs().catch(err => console.warn('[Fireballs] failed:', err)),
      initCraters().catch(err => console.warn('[Craters] failed:', err)),
    ]);
    AppState.allMeteorites = meteorites;
```

Note: `initFireballs()` and `initCraters()` both add their layers to the map internally, so they just need to be awaited. The `.catch()` ensures a failure in one layer doesn't break the whole app.

Also remove the separate `showLoading('Fetching meteorite data…')` call at the top of `init()` since the new parallel call handles it.

**Step 3: Update the fireball count in stats after init**

After `refreshViewportStats();` in `init()`, add:

```js
    // Update fireball count in stats bar
    if (AppState.fireballs.length) {
      const el = document.getElementById('stat-fireballs');
      if (el) el.textContent = AppState.fireballs.length.toLocaleString();
    }
```

**Step 4: Bump app.js version in index.html**

Change `js/app.js?v=3` → `js/app.js?v=4`

**Step 5: Commit**

```bash
git add js/app.js index.html
git commit -m "feat: wire fireball and crater layers into parallel init"
```

---

### Task 5: Add fireball count to stats bar in index.html

**Files:**
- Modify: `index.html`

**Step 1: Add fireball stat item**

In `index.html`, after the Found stat block:

```html
    <div class="stat-divider" aria-hidden="true"></div>
    <div class="stat-item">
      <span class="stat-label" style="color:var(--rose);">Fireballs</span>
      <span class="stat-value mono" id="stat-fireballs">—</span>
    </div>
```

**Step 2: Verify preview**

Reload the preview. The stats bar should show "Fireballs —" until data loads, then a count (~869).

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add fireball count to stats bar"
```

---

### Task 6: Update meta, title, About modal, and legend

**Files:**
- Modify: `index.html`

**Step 1: Update `<title>` and meta description**

```html
<title>Meteorite Map — Meteorites, Fireballs & Impact Craters</title>
<meta name="description" content="Explore 32,000+ meteorite landings, 800+ detected fireballs, and 189 confirmed impact craters on an interactive map. Data from NASA, JPL, and the Meteoritical Society.">
```

Also update Open Graph title and description to match.

**Step 2: Update About modal description paragraph**

Replace the existing `about-desc` paragraph:

```html
<p class="about-desc">Three layers of Earth's cosmic history on one interactive map: 32,000+ confirmed meteorite landings, 800+ fireball events detected by US government sensors (1988–present), and 189 confirmed ancient impact craters. Filter, search, and explore.</p>
```

**Step 3: Update the Data Source section in About modal**

Replace the existing single data source paragraph with three entries:

```html
<div class="about-section">
  <h3>Data Sources</h3>
  <p><strong style="color:var(--accent);">Meteorites</strong> — <a href="https://data.nasa.gov" target="_blank" rel="noopener noreferrer">NASA Open Data</a> via <a href="https://www.lpi.usra.edu/meteor/metbull.php" target="_blank" rel="noopener noreferrer">The Meteoritical Society</a>. Confirmed falls and finds through 2013.</p>
  <p style="margin-top:8px;"><strong style="color:var(--rose);">Fireballs</strong> — <a href="https://cneos.jpl.nasa.gov/fireballs/" target="_blank" rel="noopener noreferrer">NASA/JPL CNEOS</a>. Bolide events detected by US government sensors, 1988–present. Not confirmed ground recoveries.</p>
  <p style="margin-top:8px;"><strong style="color:var(--brown);">Impact Craters</strong> — <a href="http://www.passc.net/EarthImpactDatabase/" target="_blank" rel="noopener noreferrer">Planetary and Space Science Centre</a>, University of New Brunswick. 189 confirmed impact structures worldwide.</p>
</div>
```

**Step 4: Commit**

```bash
git add index.html
git commit -m "feat: update title, meta, and About modal for three-layer map"
```

---

### Task 7: Final verification and push

**Step 1: Start preview and reload**

```bash
python -m http.server 3000
```

Open `http://localhost:3000` in preview.

**Step 2: Verify each layer visually**

- Fireball markers: rose-colored pulsing dots visible on map
- Crater markers: brown ring outlines visible on map
- Meteorite clusters: amber/cyan dots still present
- Stats bar: shows "Fireballs 869" (or similar count)
- Click a fireball: popup shows date, energy, badge reads "FIREBALL"
- Click a crater: popup shows name, diameter, age, badge reads "CRATER", PASSC link present

**Step 3: Check console for errors**

No errors expected. Warnings for `.catch()` failures are acceptable if CNEOS or GitHub is unreachable.

**Step 4: Push to GitHub**

```bash
git push origin main
```

Cloudflare Pages will deploy automatically.
