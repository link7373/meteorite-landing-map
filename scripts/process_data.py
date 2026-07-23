#!/usr/bin/env python3
"""
Download the NASA meteorite landings CSV and regenerate data/meteorites.json.

NASA migrated data.nasa.gov from Socrata to CKAN in 2025, retiring the old
`/resource/y77d-th95.json` Socrata API (it now 404s). The dataset itself is
frozen (last landing ~2013) and NASA now serves it as a static "legacy" CSV.
This script targets that CSV. Fresh post-2013 records come from a separate
MetBull step; see scripts/build_meteorites.py.

Usage:
  python scripts/process_data.py

Output:
  data/meteorites.json
"""

import csv
import io
import json
import os
import time
import urllib.error
import urllib.request

NASA_CSV_URL = (
    "https://data.nasa.gov/docs/legacy/meteorite_landings/Meteorite_Landings.csv"
)
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "meteorites.json")

# Mimic a browser so NASA's CDN/WAF doesn't block server-side requests
_HEADERS = {
    "Accept": "text/csv,*/*",
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}
_MAX_RETRIES = 3
_BACKOFF_BASE = 10  # seconds


def parse_year(raw):
    if not raw:
        return None
    try:
        # ISO string: "1880-01-01T00:00:00.000" — take first 4 chars
        return int(str(raw)[:4])
    except (ValueError, TypeError):
        return None


def parse_float(raw):
    try:
        return float(raw) if raw is not None else None
    except (ValueError, TypeError):
        return None


def fetch_with_retry(url):
    """Fetch URL with retries and exponential backoff; return decoded text."""
    req = urllib.request.Request(url, headers=_HEADERS)
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            print(f"Attempt {attempt}/{_MAX_RETRIES}: GET {url}")
            with urllib.request.urlopen(req, timeout=90) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            print(f"Attempt {attempt} failed: {exc}")
            if attempt < _MAX_RETRIES:
                wait = _BACKOFF_BASE * attempt
                print(f"Retrying in {wait}s …")
                time.sleep(wait)
            else:
                raise


def main():
    print(f"Downloading from {NASA_CSV_URL} …")
    raw_text = fetch_with_retry(NASA_CSV_URL)

    reader = csv.DictReader(io.StringIO(raw_text))
    records = []

    for row in reader:
        # Filter: Valid nametypes only
        if (row.get("nametype") or "").strip() != "Valid":
            continue

        lat = parse_float(row.get("reclat"))
        lng = parse_float(row.get("reclong"))

        # Filter: skip missing or (0, 0) coordinates
        if lat is None or lng is None:
            continue
        if lat == 0.0 and lng == 0.0:
            continue

        # NASA CSV uses "mass (g)" for the mass column
        mass = parse_float(row.get("mass (g)") or row.get("mass"))
        year = parse_year(row.get("year"))

        records.append({
            "id":       str(row.get("id", "")).strip(),
            "name":     (row.get("name") or "").strip(),
            "recclass": (row.get("recclass") or "").strip(),
            "mass":     mass,
            "fall":     (row.get("fall") or "").strip(),
            "year":     year,
            "lat":      lat,
            "lng":      lng,
        })

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, separators=(",", ":"))

    print(f"Written {len(records):,} records to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
