# Meteorite Map

**Every known meteorite landing on Earth — plotted on an interactive map.**

Visualizes 45,000+ meteorite landings from NASA's open dataset. Filter by year, mass, and classification. Click any marker to inspect individual meteorites.

[Live Demo →](https://meteorite-map.pages.dev) <!-- update with your Cloudflare Pages URL -->

---

## Features

- **45,000+ markers** with automatic clustering via Leaflet.markercluster
- **Color-coded** — amber for observed falls, cyan for later discoveries
- **Marker size** scales logarithmically with meteorite mass
- **Filter panel** — year range slider, mass categories, fall type, classification
- **Live stats bar** — visible count, heaviest & oldest meteorite, fell/found breakdown
- **Search** — name autocomplete with fly-to animation and popup

## Tech Stack

- Pure HTML / CSS / JavaScript (no framework, no build step)
- [Leaflet.js](https://leafletjs.com/) + [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster)
- [noUiSlider](https://refreshless.com/nouislider/) for the year range slider
- [NASA Socrata API](https://data.nasa.gov/resource/y77d-th95.json) — free, no key required

## Running Locally

No build step needed. Just open `index.html` in a browser, or use a local server:

```bash
# Python
python -m http.server 8000

# Node (npx)
npx serve .
```

Then visit `http://localhost:8000`.

## Deploy to Cloudflare Pages

1. Push this repo to GitHub
2. In Cloudflare Pages, connect the repo
3. **Build command:** *(leave blank)*
4. **Output directory:** `/`
5. Deploy

## Data Source

NASA Meteorite Landings dataset via [data.nasa.gov](https://data.nasa.gov/Space-Science/Meteorite-Landings/gh4g-9sfh). Data sourced from [The Meteoritical Society](https://www.lpi.usra.edu/meteor/metbull.php).
