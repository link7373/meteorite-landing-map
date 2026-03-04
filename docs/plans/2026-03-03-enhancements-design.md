# Meteorite Map Enhancements — Design Doc
**Date:** 2026-03-03
**Status:** Approved

---

## Overview

Six features added to the existing static Meteorite Landing Map site. No build step, no framework, no backend. All features are pure HTML/CSS/JS with CDN libraries where needed.

---

## Feature 1 — GitHub Actions Auto-Update

**Purpose:** Keep `data/meteorites.json` fresh automatically without manual intervention.

**Implementation:**
- `.github/workflows/update-data.yml` — cron schedule: `0 0 1 * *` (1st of every month)
- `scripts/process_data.py` — standalone Python script that downloads the NASA legacy CSV, cleans it (filter invalid coords, nametype=Valid, extract fields), and writes `data/meteorites.json`
- Workflow: download → convert → diff against existing file → commit + push only if changed → Cloudflare auto-deploys

**Files:**
- `.github/workflows/update-data.yml` (new)
- `scripts/process_data.py` (new)

---

## Feature 2 — URL Deep Linking

**Purpose:** Share a filtered map view via URL params.

**Params:** `?year=1900-2000&fall=Fell&mass=large&class=L5,H6`

**Implementation:**
- On page load (in `app.js`), read URL params and pre-populate `AppState.filters` before `initFilters()` runs; also set the UI controls to match
- On Apply Filters, call `history.replaceState()` to update URL without page reload
- On Reset Filters, clear URL params

**Files:**
- `js/app.js` — read params on init, pass to `initFilters`
- `js/filters.js` — accept initial filter values, call `updateURL()` on apply/reset
- `js/url.js` (new) — `readURLParams()` and `writeURLParams()` utilities

---

## Feature 3 — Timeline Animation

**Purpose:** Animated playback of meteorite landings by year, with falling meteor CSS animations.

**UI:** A fixed bar above the stats bar containing:
- Year label (large, monospace)
- Scrubber slider (noUiSlider, single handle)
- Play/Pause button, Reset button
- Speed selector: 1× / 5× / 10×
- Toggle button in sidebar + clock icon on map to show/hide the bar

**Playback logic:**
- `setInterval` increments `currentYear` by 1 each tick (tick interval = 800ms at 1×, 160ms at 5×, 80ms at 10×)
- Map shows all meteorites with `year <= currentYear`
- At end of range, auto-pause
- Dragging scrubber pauses auto-play, updates map immediately

**Falling meteor animation:**
- Only when playing at 1× speed AND fewer than 15 new markers appear in a tick
- New markers use `L.divIcon` with class `marker-falling` instead of `L.circleMarker`
- CSS `@keyframes meteor-fall`: `translateY(-60px) rotate(-45deg)` → `translateY(0) rotate(0)` over 500ms, followed by a radial pulse (`@keyframes impact-pulse`) over 200ms
- After 700ms, swap to normal `L.circleMarker` (remove divIcon, add circleMarker at same coords)
- At 5×/10× or when scrubbing: instant appearance, no animation

**Files:**
- `js/timeline.js` (new)
- `css/style.css` — add `@keyframes meteor-fall`, `@keyframes impact-pulse`, `.marker-falling` styles
- `index.html` — add timeline bar HTML, timeline toggle button

---

## Feature 4 — Heatmap Toggle

**Purpose:** Density heatmap as an alternative to the cluster view.

**Implementation:**
- Add `Leaflet.heat` via CDN (`https://unpkg.com/leaflet.heat/dist/leaflet-heat.js`)
- Toggle button near zoom controls (flame icon): switches between cluster mode and heatmap mode
- In heatmap mode: hide `AppState.markerLayer`, show `L.heatLayer` built from `AppState.filtered` coords; mass used as intensity weight (log scale, clamped)
- In cluster mode: show `AppState.markerLayer`, remove heatmap layer
- Heatmap rebuilds on filter change when in heatmap mode
- Button has active/inactive visual state

**Files:**
- `js/map.js` — `toggleHeatmap()`, `buildHeatLayer()`
- `css/style.css` — heatmap toggle button styles
- `index.html` — heatmap toggle button, Leaflet.heat CDN script

---

## Feature 5 — Classification Guide Modal

**Purpose:** Explain meteorite classifications inline with Wikipedia integration.

**Tooltip:** Hover any `recclass` value (in popup, filter checkboxes, search results) → small tooltip with one-liner from a local lookup table.

**Modal:** Click classification → modal opens with:
- Classification name + structured explanation (type, group, subgroup) from lookup table
- Wikipedia summary fetched from `https://en.wikipedia.org/api/rest_v1/page/summary/{title}` (CORS-friendly, no key)
- "Read more on Wikipedia →" link
- Graceful fallback if no Wikipedia article found

**Lookup table:** ~30 most common classes (L5, H6, LL3, Iron IVA, etc.) mapping to display name, one-liner, and Wikipedia article title.

**Files:**
- `js/classification.js` (new) — lookup table, tooltip init, modal open/close, Wikipedia fetch
- `css/style.css` — tooltip and modal styles
- `index.html` — modal HTML skeleton

---

## Feature 6 — "Surprise Me" Button

**Purpose:** Fly to a random meteorite from the current filtered set.

**UI:** Small floating button (🎲) below the zoom controls.

**Logic:**
- Pick random item from `AppState.filtered`
- Call existing `flyToMeteorite(id)` from `search.js`
- If `AppState.filtered` is empty, show brief "No meteorites to surprise you with!" toast

**Files:**
- `js/app.js` — `surpriseMe()` function + button event listener
- `css/style.css` — surprise button styles
- `index.html` — surprise button element

---

## File Change Summary

| File | Change |
|------|--------|
| `index.html` | Add timeline bar, heatmap toggle btn, surprise btn, modal skeleton, Leaflet.heat CDN |
| `css/style.css` | Timeline bar, falling meteor keyframes, heatmap btn, modal, surprise btn, tooltip |
| `js/app.js` | Read URL params on init, `surpriseMe()` |
| `js/filters.js` | Accept initial values, call `updateURL()` on apply/reset |
| `js/map.js` | `toggleHeatmap()`, `buildHeatLayer()`, animated marker support |
| `js/url.js` | New — `readURLParams()`, `writeURLParams()` |
| `js/timeline.js` | New — full timeline playback logic + animation coordination |
| `js/classification.js` | New — lookup table, tooltip, modal, Wikipedia fetch |
| `.github/workflows/update-data.yml` | New — monthly cron auto-update |
| `scripts/process_data.py` | New — CSV → JSON conversion script |

---

## Constraints

- No build step, no npm, no framework
- All new JS loaded as plain `<script>` tags in dependency order
- Mobile must remain usable (timeline bar collapses on small screens)
- No new API keys required (Wikipedia REST API is free and keyless)
