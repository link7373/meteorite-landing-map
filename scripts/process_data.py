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
import urllib.request

NASA_JSON_URL = (
    "https://data.nasa.gov/resource/y77d-th95.json?$limit=50000"
)
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "meteorites.json")


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


def main():
    print(f"Downloading from {NASA_JSON_URL} …")
    req = urllib.request.Request(NASA_JSON_URL, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw_records = json.loads(resp.read().decode("utf-8"))

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
