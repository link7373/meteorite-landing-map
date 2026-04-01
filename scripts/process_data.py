#!/usr/bin/env python3
"""
Download the NASA meteorite landings JSON and regenerate data/meteorites.json.

Uses the same Socrata JSON endpoint as the browser app.

Usage:
  python scripts/process_data.py

Output:
  data/meteorites.json
"""

import json
import os
import time
import urllib.error
import urllib.request

NASA_JSON_URL = (
    "https://data.nasa.gov/resource/y77d-th95.json?$limit=50000"
)
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "meteorites.json")

# Mimic a browser so NASA's CDN/WAF doesn't block server-side requests
_HEADERS = {
    "Accept": "application/json",
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
    """Fetch URL with retries and exponential backoff."""
    req = urllib.request.Request(url, headers=_HEADERS)
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            print(f"Attempt {attempt}/{_MAX_RETRIES}: GET {url}")
            with urllib.request.urlopen(req, timeout=90) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            print(f"Attempt {attempt} failed: {exc}")
            if attempt < _MAX_RETRIES:
                wait = _BACKOFF_BASE * attempt
                print(f"Retrying in {wait}s …")
                time.sleep(wait)
            else:
                raise


def main():
    print(f"Downloading from {NASA_JSON_URL} …")
    raw_records = fetch_with_retry(NASA_JSON_URL)

    records = []

    for row in raw_records:
        # Filter: Valid nametypes only
        if row.get("nametype", "").strip() != "Valid":
            continue

        lat = parse_float(row.get("reclat"))
        lng = parse_float(row.get("reclong"))

        # Filter: skip missing or (0, 0) coordinates
        if lat is None or lng is None:
            continue
        if lat == 0.0 and lng == 0.0:
            continue

        mass = parse_float(row.get("mass"))
        year = parse_year(row.get("year"))

        records.append({
            "id":       str(row.get("id", "")).strip(),
            "name":     row.get("name", "").strip(),
            "recclass": row.get("recclass", "").strip(),
            "mass":     mass,
            "fall":     row.get("fall", "").strip(),
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
