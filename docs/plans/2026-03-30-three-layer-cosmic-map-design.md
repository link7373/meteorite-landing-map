# Design: Three-Layer Cosmic Map

**Date:** 2026-03-30
**Status:** Approved

## Overview

Add two new data layers — CNEOS Fireballs and Earth Impact Craters — alongside the existing meteorite landings. Together the three layers tell a complete story of Earth's cosmic history across radically different timescales.

| Layer | Records | Timescale | Source |
|---|---|---|---|
| Meteorite Landings | ~32k | 860 AD – 2013 | NASA/MetBull (bundled JSON) |
| CNEOS Fireballs | ~869 | 1988 – today | JPL live API |
| Impact Craters | 189 | Millions of years ago | PASSC via GitHub CSV |

---

## Architecture

### New Files

- `js/fireballs.js` — fetches CNEOS API, parses coordinates, creates fireball DivIcon markers + MarkerClusterGroup, exposes `initFireballs()`
- `js/craters.js` — fetches crater CSV from GitHub, parses fields, creates crater DivIcon markers + MarkerClusterGroup, exposes `initCraters()`

### Script Load Order

```
data → map → filters → stats → search → url → classification → timeline → fireballs → craters → app
```

### AppState additions

```js
AppState.fireballs = [];        // raw parsed fireball records
AppState.fireballLayer = null;  // L.MarkerClusterGroup
AppState.craters = [];          // raw parsed crater records
AppState.craterLayer = null;    // L.MarkerClusterGroup
```

Both layers are initialized in `init()` in parallel with the meteorite fetch, then added to the map.

---

## Data Fetching

### CNEOS Fireballs

- **URL:** `https://ssd-api.jpl.nasa.gov/fireball.api?limit=2000`
- **CORS:** supported natively
- **Fields:** `date`, `energy` (radiated, 10¹⁰ J), `impact-e` (kt), `lat`, `lat-dir`, `lon`, `lon-dir`, `alt` (km), `vel` (km/s)
- **Transform:** Convert `lat`/`lat-dir` and `lon`/`lon-dir` to signed decimal degrees. Skip records missing coordinates (~186 of 1055 total).
- **Result:** ~869 geocoded events

### Impact Craters

- **URL:** `https://raw.githubusercontent.com/cjwinchester/earth-impact-data/main/earth-impact-craters.csv`
- **Fields:** `crater_name`, `country`, `diameter_km`, `age_millions_years_ago`, `target_rock`, `latitude`, `longitude`, `url`
- **Transform:** Parse CSV manually (clean, no edge cases). Cast numeric fields. Skip rows missing lat/lng.
- **Result:** 189 craters

Both fetches run via `Promise.all` alongside `fetchMeteorites()` in `init()`.

---

## Visual Design

### Color Palette additions

```css
--rose:      #f43f5e;
--rose-dim:  rgba(244, 63, 94, 0.55);
--rose-glow: rgba(244, 63, 94, 0.20);
--rose-bg:   rgba(244, 63, 94, 0.10);

--brown:     #92400e;
--brown-dim: rgba(146, 64, 14, 0.55);
--brown-glow:rgba(146, 64, 14, 0.20);
--brown-bg:  rgba(146, 64, 14, 0.10);
```

### Fireball Markers

- **Type:** `L.divIcon` with a custom HTML element
- **Style:** Glowing pulsing ring in rose `#f43f5e`. Two concentric circles — inner solid dot, outer ring that pulses outward and fades via CSS animation.
- **Animation:** `@keyframes fireball-pulse` — scale 1→1.8, opacity 1→0, 2s infinite loop. Simulates a bolide detonating in the upper atmosphere.
- **Size:** Base 10px, scales with `Math.log10(impact_energy_kt + 1) * 4`, clamped 8–28px.
- **Cluster style:** Rose-tinted cluster icons (same structure as meteorite clusters, different color).

### Crater Markers

- **Type:** `L.divIcon` with a custom HTML element
- **Style:** Concave ring — thick border in brown `#92400e`, transparent fill. Evokes the circular rim of an impact structure.
- **Animation:** None — craters are ancient, static geological features.
- **Size:** Scales with `Math.log10(diameter_km) * 8`, clamped 12–48px.
- **Cluster style:** Brown-tinted cluster icons.

---

## Popups

### Fireball Popup

```
[Date]                        ☄ FIREBALL
Impact Energy: X kt
Velocity: X km/s    Altitude: X km
Radiated Energy: X × 10¹⁰ J
[lat, lng]
⚠ Detected by US gov sensors — not a confirmed ground recovery.
```

### Crater Popup

```
[Crater Name]                 💥 IMPACT CRATER
[Country]
Diameter: X km
Age: X Ma (millions of years ago)
Target rock: [type]
[lat, lng]
[→ PASSC record link]
```

---

## Stats Bar

Add one new stat item after Found:

```
| ☄ FIREBALLS  [count] |
```

Craters are always 189 (not filter-dependent), so no stat for them.

---

## Loading

Update loading message to: `"Fetching meteorite, fireball, and crater data…"`

Use `Promise.all([fetchMeteorites(), fetchFireballs(), fetchCraters()])` so all three load concurrently.

---

## About Modal

Add a new "Data Sources" section (or expand existing) to include:

- **CNEOS Fireball Data** — NASA/JPL Center for Near Earth Object Studies. Bolide events detected by US government sensors, 1988–present. Not confirmed meteorite recoveries.
- **Earth Impact Database** — Planetary and Space Science Centre, University of New Brunswick. 189 confirmed impact structures worldwide.

---

## Meta / SEO Updates

- `<title>`: "Meteorite Map — Meteorites, Fireballs & Impact Craters"
- Meta description: updated to mention all three layers
- About modal intro text: updated to reflect all three datasets
