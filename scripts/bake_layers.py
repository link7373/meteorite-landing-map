#!/usr/bin/env python3
"""
Bake the fireball and crater layers into static JSON at build time.

The browser app used to fetch these from third-party APIs on every page load
(CNEOS fireball API + a GitHub-hosted crater CSV). Baking them here removes two
runtime cross-origin dependencies, so the deployed site loads faster and keeps
working even if those upstreams are down. Run monthly by the GitHub Action; the
JS keeps a live-API fallback for the rare case the baked file is missing.

The output record shapes intentionally match what js/fireballs.js
(fetchFireballs) and js/craters.js (fetchCraters) previously built in-browser,
so the front-end can consume them with no reshaping.

Usage:
  python scripts/bake_layers.py

Output:
  data/fireballs.json
  data/craters.json
"""

import csv
import io
import json
import os
import urllib.request

CNEOS_URL = "https://ssd-api.jpl.nasa.gov/fireball.api?limit=2000"
CRATER_CSV_URL = (
    "https://raw.githubusercontent.com/cjwinchester/earth-impact-data/"
    "main/earth-impact-craters.csv"
)

_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
FIREBALLS_OUT = os.path.join(_DATA_DIR, "fireballs.json")
CRATERS_OUT = os.path.join(_DATA_DIR, "craters.json")

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
}


def _get(url):
    req = urllib.request.Request(url, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=90) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _num(raw):
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def bake_fireballs():
    """Mirror of fetchFireballs()/parseFireballCoords() in js/fireballs.js."""
    payload = json.loads(_get(CNEOS_URL))
    fields = payload.get("fields")
    data = payload.get("data")
    if not isinstance(fields, list) or not isinstance(data, list):
        raise ValueError("CNEOS API returned unexpected shape")

    idx = {name: fields.index(name) for name in fields}
    out = []
    for row in data:
        lat = _num(row[idx["lat"]]) if "lat" in idx else None
        lon = _num(row[idx["lon"]]) if "lon" in idx else None
        if lat is None or lon is None:
            continue
        if row[idx.get("lat-dir")] == "S":
            lat = -lat
        if row[idx.get("lon-dir")] == "W":
            lon = -lon
        out.append({
            "date":    row[idx["date"]],
            "energy":  row[idx["energy"]],
            "impactE": row[idx["impact-e"]],
            "alt":     row[idx["alt"]],
            "vel":     row[idx["vel"]],
            "lat":     round(lat, 4),
            "lng":     round(lon, 4),
        })

    with open(FIREBALLS_OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"Wrote {len(out):,} fireballs to {FIREBALLS_OUT}")
    return len(out)


def bake_craters():
    """Mirror of fetchCraters() in js/craters.js."""
    reader = csv.DictReader(io.StringIO(_get(CRATER_CSV_URL)))
    out = []
    for r in reader:
        lat = _num(r.get("latitude"))
        lng = _num(r.get("longitude"))
        if lat is None or lng is None:
            continue
        out.append({
            "crater_name":            r.get("crater_name", ""),
            "country":                r.get("country", ""),
            "diameter_km":            r.get("diameter_km", ""),
            "age_millions_years_ago": r.get("age_millions_years_ago", ""),
            "target_rock":            r.get("target_rock", ""),
            "url":                    r.get("url", ""),
            "lat":                    round(lat, 4),
            "lng":                    round(lng, 4),
        })

    with open(CRATERS_OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"Wrote {len(out):,} craters to {CRATERS_OUT}")
    return len(out)


def main():
    os.makedirs(_DATA_DIR, exist_ok=True)
    bake_fireballs()
    bake_craters()


if __name__ == "__main__":
    main()
