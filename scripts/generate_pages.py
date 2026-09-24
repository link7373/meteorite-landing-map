#!/usr/bin/env python3
"""
Generate curated static SEO pages for meteorites and impact craters.

The interactive map is a client-rendered SPA — invisible to search engines. This
script emits real, crawlable HTML pages so the site can rank for "[meteorite
name]" / "[crater name]" queries and surface the eBay affiliate links to organic
visitors.

We deliberately DO NOT generate a page per record (32k+). Cloudflare Pages' free
tier caps a deployment at 20,000 files, and thousands of near-identical thin
pages read as doorway pages to Google. Instead we curate the genuinely
search-worthy subset: every observed fall, every notable class (lunar, martian,
achondrites, pallasites…), the largest finds, and all 189 craters (~3,300 pages).

Outputs (all under the repo root so Cloudflare serves them as-is):
  m/<slug>.html            one page per curated meteorite
  crater/<slug>.html       one page per crater
  directory.html           crawlable index linking every generated page
  sitemap.xml              lists home, directory, and every detail page
  robots.txt               allows crawling, points at the sitemap
  data/page_index.json     { meteorite id -> slug } so map popups can deep-link

Usage:
  python scripts/generate_pages.py
"""

import bisect
import html
import json
import math
import os
import re

SITE = "https://wheretheyfall.com"

_ROOT = os.path.join(os.path.dirname(__file__), "..")
_DATA = os.path.join(_ROOT, "data")

# ── Class guide (ported from js/classification.js CLASS_GUIDE) ──────────────
CLASS_GUIDE = {
    "L5":  ("Ordinary Chondrite", "Low-iron stony meteorite, petrologic type 5 (well-recrystallised)."),
    "L6":  ("Ordinary Chondrite", "Low-iron stony meteorite, petrologic type 6 (heavily recrystallised)."),
    "L4":  ("Ordinary Chondrite", "Low-iron stony meteorite, petrologic type 4."),
    "H4":  ("Ordinary Chondrite", "High-iron stony meteorite, petrologic type 4 (partially recrystallised)."),
    "H5":  ("Ordinary Chondrite", "High-iron stony meteorite, petrologic type 5."),
    "H6":  ("Ordinary Chondrite", "High-iron stony meteorite, petrologic type 6."),
    "LL5": ("Ordinary Chondrite", "Low total iron, low metallic iron stony meteorite, type 5."),
    "LL6": ("Ordinary Chondrite", "Low total iron, low metallic iron stony meteorite, type 6."),
    "CM2": ("Carbonaceous Chondrite", "Hydrated carbonaceous meteorite rich in organic compounds."),
    "CV3": ("Carbonaceous Chondrite", "Calcium-aluminium-rich inclusion-bearing carbonaceous meteorite."),
    "CO3": ("Carbonaceous Chondrite", "Carbonaceous chondrite with small chondrules."),
    "Iron, IIIAB": ("Iron Meteorite", "Most common iron group; from a differentiated parent body's core."),
    "Iron, IAB":   ("Iron Meteorite", "Iron meteorite family, likely from a disrupted parent body."),
    "Iron, IVA":   ("Iron Meteorite", "Iron from a stripped planetary core; low germanium content."),
    "Iron":        ("Iron Meteorite", "Iron-nickel meteorite from the core of a differentiated body."),
    "Pallasite":   ("Stony-Iron", "Olivine crystals set in metallic iron; from a core-mantle boundary."),
    "Mesosiderite": ("Stony-Iron", "Breccia of metal and silicate from a disrupted differentiated body."),
    "Eucrite":     ("Achondrite (HED)", "Basaltic meteorite from the surface of asteroid 4 Vesta."),
    "Howardite":   ("Achondrite (HED)", "Regolith breccia from asteroid 4 Vesta."),
    "Diogenite":   ("Achondrite (HED)", "Coarse orthopyroxenite from deep within asteroid 4 Vesta."),
    "Lunar":       ("Lunar Meteorite", "Rock ejected from the Moon by an impact."),
    "Martian":     ("Martian Meteorite", "Igneous rock from Mars, delivered to Earth by impact ejection."),
    "Ureilite":    ("Achondrite", "Carbon-rich achondrite from an ancient disrupted parent body."),
    "Aubrite":     ("Achondrite", "Highly reduced enstatite achondrite formed with little oxygen."),
    "Angrite":     ("Achondrite", "Rare, ancient basaltic achondrite from an alkaline-poor parent body."),
    "EH": ("Enstatite Chondrite", "Highly reduced chondrite formed in an oxygen-poor environment."),
    "EL": ("Enstatite Chondrite", "Highly reduced, low-iron enstatite chondrite."),
}

NOTABLE = ("Lunar", "Martian", "Pallasite", "Mesosiderite", "Diogenite",
           "Eucrite", "Howardite", "Ureilite", "Angrite", "Aubrite")


def lookup_class(recclass):
    if recclass in CLASS_GUIDE:
        return CLASS_GUIDE[recclass]
    for key, val in CLASS_GUIDE.items():
        if recclass.startswith(key) or key.startswith(recclass):
            return val
    return (None, None)


def slugify(s):
    s = re.sub(r"['\".]", "", (s or "").lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "x"


def unique_slugger():
    used = set()

    def make(name):
        base = slugify(name)
        slug = base
        i = 2
        while slug in used:
            slug = f"{base}-{i}"
            i += 1
        used.add(slug)
        return slug
    return make


def fmt_mass(g):
    if g is None:
        return "Unknown"
    g = float(g)
    if g < 1:
        return f"{g:.2f} g"
    if g < 1000:
        return f"{g:.1f} g"
    if g < 1e6:
        return f"{g / 1000:.2f} kg"
    return f"{g / 1e6:.3f} t"


def coords(lat, lng):
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lng >= 0 else "W"
    return f"{abs(lat):.3f}°{ns}, {abs(lng):.3f}°{ew}"


def e(s):
    return html.escape(str(s if s is not None else ""), quote=True)


def ebay_link(name):
    from urllib.parse import quote
    q = quote(f"{name} meteorite")
    return (f'<a class="ebay" target="_blank" rel="noopener noreferrer sponsored" '
            f'href="https://www.ebay.com/sch/i.html?_nkw={q}'
            f'&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339144154&toolid=10001">'
            f'\U0001f6d2 Find {e(name)} specimens on eBay</a>')



# ── Geo + context helpers (stdlib only — runs in GitHub Actions as-is) ─────
def haversine_km(lat1, lng1, lat2, lng2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371 * 2 * math.asin(min(1, math.sqrt(a)))


def fmt_km(km):
    if km < 1:
        return "< 1 km"
    if km < 10:
        return f"{km:.1f} km"
    return f"{round(km):,} km"


def ordinal(n):
    if 10 <= n % 100 <= 20:
        suf = "th"
    else:
        suf = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n:,}{suf}"


class LatIndex:
    """All records sorted by latitude, for fast radius counts via a lat window."""

    def __init__(self, recs):
        self.recs = sorted(recs, key=lambda r: r["lat"])
        self.lats = [r["lat"] for r in self.recs]

    def within(self, lat, lng, km):
        dlat = km / 111.0
        lo = bisect.bisect_left(self.lats, lat - dlat)
        hi = bisect.bisect_right(self.lats, lat + dlat)
        return [r for r in self.recs[lo:hi] if haversine_km(lat, lng, r["lat"], r["lng"]) <= km]


def nearest(lat, lng, candidates, k, exclude=None):
    """k nearest (distance_km, rec) from candidates, skipping `exclude`."""
    scored = [(haversine_km(lat, lng, c["lat"], c["lng"]), c) for c in candidates if c is not exclude]
    scored.sort(key=lambda x: x[0])
    return scored[:k]


NEAR_RADIUS_KM = 250   # matches the map's "Near me" 250 km option


def near_link(lat, lng):
    return f"/?near={lat:.2f},{lng:.2f}&amp;r={NEAR_RADIUS_KM}"


def minimap(lat, lng, kind, neighbours):
    """Lazy Leaflet locator map (rendered by /js/minimap.js when scrolled into view)."""
    pts = [[round(n["lat"], 4), round(n["lng"], 4), n["kind"]] for n in neighbours]
    return (f'<figure class="minimap" data-lat="{lat:.5f}" data-lng="{lng:.5f}" data-kind="{kind}" '
            f"data-points='{json.dumps(pts, separators=(',', ':'))}' "
            f'aria-label="Map showing the location and nearby records">'
            f'<noscript>Location: {e(coords(lat, lng))}</noscript></figure>')


def link_rows(rows):
    """rows: [(href, name, sub, right)] -> <ul class="linklist">"""
    items = "".join(
        f'<li><a href="{h}"><span class="ll-name">{e(n)}</span>'
        f'<span class="ll-sub">{e(sub)}</span></a><span class="ll-right">{e(r)}</span></li>'
        for h, n, sub, r in rows)
    return f'<ul class="linklist">{items}</ul>'


def met_sub(m):
    parts = [m["recclass"], fmt_mass(m["mass"])]
    if m.get("year"):
        parts.append(f"{'fell' if m['fall'] == 'Fell' else 'found'} {m['year']}")
    return " · ".join(parts)

PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{canonical}">
<link rel="icon" type="image/svg+xml" href="/img/favicon.svg">
<meta property="og:type" content="article">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{canonical}">
<meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/detail.css?v=2">
<script src="/js/minimap.js?v=1" defer></script>
<script type="application/ld+json">{jsonld}</script>
</head>
<body>
<main class="detail">
<nav class="crumbs" aria-label="Breadcrumb">
<a href="/">Meteorite Map</a> <span>/</span> <a href="/directory.html">{section_label}</a> <span>/</span> <span>{name}</span>
</nav>
<span class="badge {badge_cls}">{badge}</span>
<h1>{name}</h1>
<p class="lede">{lede}</p>
<dl class="facts">{facts}</dl>
{context}
{class_block}
<div class="actions">
<a class="cta" href="/?focus={focus}">▶ View on the interactive map</a>
{ebay}
</div>
{related}
<p class="disclosure">Some links are affiliate links — we may earn a small commission at no extra cost to you, which helps keep the map running.</p>
<p class="source">{source}</p>
</main>
</body>
</html>
"""


def context_section(lines):
    if not lines:
        return ""
    return ('<section class="context"><h2>In context</h2><ul class="ctx">'
            + "".join(f"<li>{ln}</li>" for ln in lines) + "</ul></section>")


def meteorite_page(m, slug, ctx):
    name = m["name"]
    ctype, cdesc = lookup_class(m["recclass"])
    fell = m["fall"] == "Fell"
    verb = "was observed to fall" if fell else "was discovered"
    year = m["year"]
    when = f"in {year}" if year else "in an unrecorded year"
    type_phrase = f", an {ctype.lower()}," if ctype and ctype[0].lower() in "aeiou" else (f", a {ctype.lower()}," if ctype else "")
    lede = (f"{name} is a meteorite that {verb} {when} near {coords(m['lat'], m['lng'])}. "
            f"It is classified as {m['recclass']}{type_phrase} with a recorded mass of {fmt_mass(m['mass'])}.")
    desc = (f"{name}: {m['recclass']} meteorite, {fmt_mass(m['mass'])}, "
            f"{'observed fall' if fell else 'find'} {when.replace('in ', '') if year else ''}. "
            f"Location, classification, and specimens.").strip()

    facts = "".join(f"<dt>{e(k)}</dt><dd>{v}</dd>" for k, v in [
        ("Classification", e(m["recclass"])),
        ("Mass", e(fmt_mass(m["mass"]))),
        ("Year", e(year) if year else "Unknown"),
        ("Fall type", "Fell (observed)" if fell else "Found (later discovery)"),
        ("Coordinates", e(coords(m["lat"], m["lng"]))),
    ])

    class_block = ""
    if ctype:
        class_block = (f'<section class="classinfo"><h2>About {e(m["recclass"])}</h2>'
                       f'<p><strong>{e(ctype)}.</strong> {e(cdesc)}</p></section>')

    # ── Context: facts that make each page unique ──
    lines = []
    rank, total = ctx["class_rank"], ctx["class_total"]
    if rank and total > 1 and rank <= 50:
        pos = "the heaviest" if rank == 1 else f"the {ordinal(rank)}-heaviest"
        lines.append(f"It is {pos} of {total:,} recorded {e(m['recclass'])} meteorites.")
    elif total > 1:
        share = total / ctx["total_records"] * 100
        pct = f"{share:.1f}%" if share >= 0.1 else "under 0.1%"
        lines.append(f"One of {total:,} recorded {e(m['recclass'])} meteorites — {pct} of all records in the database.")
    elif total == 1:
        lines.append(f"It is the only recorded {e(m['recclass'])} meteorite in the database.")
    if ctx.get("decade_falls"):
        dec, n = ctx["decade_falls"]
        lines.append(f"One of {n:,} observed falls recorded worldwide in the {dec}s."
                     if n > 1 else f"The only observed fall recorded in the {dec}s.")
    n_near = ctx["count_near"]
    if n_near:
        lines.append(f'{n_near:,} other meteorite{"s have" if n_near != 1 else " has"} been recorded within '
                     f'{NEAR_RADIUS_KM} km. <a href="{near_link(m["lat"], m["lng"])}">See them on the map →</a>')
    else:
        lines.append(f"No other meteorites have been recorded within {NEAR_RADIUS_KM} km — "
                     f"a lone record for the area.")
    if ctx["near_craters"]:
        d, c, cslug = ctx["near_craters"][0]
        lines.append(f'The nearest confirmed impact crater, <a href="/crater/{cslug}.html">{e(c["crater_name"])}</a>, '
                     f"lies {fmt_km(d)} away.")

    context = minimap(m["lat"], m["lng"], "fell" if fell else "found", ctx["map_points"]) + context_section(lines)

    # ── Related links (internal linking) ──
    related = []
    if ctx["neighbours"]:
        related.append('<section class="related"><h2>Nearby meteorites</h2>' + link_rows(
            [(f"/m/{ns}.html", n["name"], met_sub(n), fmt_km(d)) for d, n, ns in ctx["neighbours"]]) + "</section>")
    if ctx["same_class"]:
        related.append(f'<section class="related"><h2>{e(ctx["same_class_label"])}</h2>' + link_rows(
            [(f"/m/{ns}.html", n["name"], met_sub(n), "") for n, ns in ctx["same_class"]]) + "</section>")

    props = [{"@type": "PropertyValue", "name": "Classification", "value": m["recclass"]},
             {"@type": "PropertyValue", "name": "Fall type", "value": "Observed fall" if fell else "Find"}]
    if m["mass"] is not None:
        props.append({"@type": "PropertyValue", "name": "Mass", "value": m["mass"], "unitCode": "GRM"})
    if year:
        props.append({"@type": "PropertyValue", "name": "Year", "value": year})

    jsonld = json.dumps({
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "Place", "name": f"{name} meteorite",
             "additionalType": "https://en.wikipedia.org/wiki/Meteorite",
             "url": f"{SITE}/m/{slug}.html",
             "description": lede,
             "geo": {"@type": "GeoCoordinates", "latitude": m["lat"], "longitude": m["lng"]},
             "additionalProperty": props},
            {"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Meteorite Map", "item": SITE + "/"},
                {"@type": "ListItem", "position": 2, "name": "Meteorites", "item": SITE + "/directory.html"},
                {"@type": "ListItem", "position": 3, "name": name, "item": f"{SITE}/m/{slug}.html"},
            ]},
        ],
    }, ensure_ascii=False)

    return PAGE.format(
        title=e(f"{name} Meteorite — {m['recclass']}, {fmt_mass(m['mass'])}"),
        desc=e(desc), canonical=f"{SITE}/m/{slug}.html",
        jsonld=jsonld, section_label="Meteorites", name=e(name),
        badge_cls="fell" if fell else "found", badge="Fell" if fell else "Found",
        lede=e(lede), facts=facts, context=context, class_block=class_block,
        focus=e(m["id"]), ebay=ebay_link(name), related="\n".join(related),
        source='Data: The Meteoritical Society Bulletin Database via NASA Open Data.',
    )


def crater_page(c, slug, ctx):
    name = c["crater_name"]
    diam = f"{c['diameter_km']} km" if c.get("diameter_km") else "unknown diameter"
    age = f"{c['age_millions_years_ago']} million years" if c.get("age_millions_years_ago") else "an unknown age"
    country = c.get("country") or "an unrecorded location"
    if country.startswith(("United ", "Democratic Republic")):
        country = "the " + country
    lede = (f"{name} is a confirmed impact crater in {country}, roughly {diam} across and dated to "
            f"about {age} ago. It marks where a meteorite struck Earth with enough energy to leave a "
            f"lasting scar on the landscape.")
    desc = f"{name}: confirmed impact crater in {country}, {diam}, age ~{age}. Location and details."

    facts = "".join(f"<dt>{e(k)}</dt><dd>{v}</dd>" for k, v in [
        ("Country", e(country)),
        ("Diameter", e(diam)),
        ("Age", e(age + " ago") if c.get("age_millions_years_ago") else "Unknown"),
        ("Target rock", e(c.get("target_rock") or "—")),
        ("Coordinates", e(coords(c["lat"], c["lng"]))),
    ])

    lines = []
    if ctx["size_rank"] and ctx["size_rank"][0] <= 50:
        rank, total = ctx["size_rank"]
        pos = "the largest" if rank == 1 else f"the {ordinal(rank)}-largest"
        lines.append(f"By diameter, it is {pos} of the {total} confirmed impact craters in the database.")
    if c.get("country") and ctx["country_total"] > 1:
        lines.append(f"One of {ctx['country_total']} confirmed impact craters in {e(country)}.")
    elif c.get("country"):
        lines.append(f"The only confirmed impact crater in {e(country)}.")
    n_near = ctx["count_near"]
    if n_near:
        lines.append(f'{n_near:,} meteorite{"s have" if n_near != 1 else " has"} been recorded within '
                     f'{NEAR_RADIUS_KM} km. <a href="{near_link(c["lat"], c["lng"])}">See them on the map →</a>')

    context = minimap(c["lat"], c["lng"], "crater", ctx["map_points"]) + context_section(lines)

    related = []
    if ctx["near_craters"]:
        related.append('<section class="related"><h2>Nearby impact craters</h2>' + link_rows(
            [(f"/crater/{cs}.html", k["crater_name"],
              f"{k['diameter_km']} km wide" if k.get("diameter_km") else "Impact crater", fmt_km(d))
             for d, k, cs in ctx["near_craters"]]) + "</section>")
    if ctx["neighbours"]:
        related.append('<section class="related"><h2>Nearby meteorites</h2>' + link_rows(
            [(f"/m/{ns}.html", n["name"], met_sub(n), fmt_km(d)) for d, n, ns in ctx["neighbours"]]) + "</section>")

    jsonld = json.dumps({
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "Landform", "name": name, "description": lede,
             "url": f"{SITE}/crater/{slug}.html",
             "geo": {"@type": "GeoCoordinates", "latitude": c["lat"], "longitude": c["lng"]}},
            {"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Meteorite Map", "item": SITE + "/"},
                {"@type": "ListItem", "position": 2, "name": "Impact Craters", "item": SITE + "/directory.html"},
                {"@type": "ListItem", "position": 3, "name": name, "item": f"{SITE}/crater/{slug}.html"},
            ]},
        ],
    }, ensure_ascii=False)

    src = 'Data: Earth Impact Database, Planetary and Space Science Centre, University of New Brunswick.'
    src_link = ""
    if c.get("url"):
        src_link = f' <a target="_blank" rel="noopener noreferrer" href="{e(c["url"])}">PASSC record →</a>'

    return PAGE.format(
        title=e(f"{name} Impact Crater — {diam}, {c.get('country') or 'location unknown'}"),
        desc=e(desc), canonical=f"{SITE}/crater/{slug}.html",
        jsonld=jsonld, section_label="Impact Craters", name=e(name),
        badge_cls="crater", badge="Crater", lede=e(lede), facts=facts,
        context=context, class_block="", related="\n".join(related),
        focus="", ebay="", source=src + src_link,
    ).replace('<a class="cta" href="/?focus=">▶ View on the interactive map</a>',
              f'<a class="cta" href="{near_link(c["lat"], c["lng"])}">▶ Explore this area on the map</a>')


def write(path, content):
    full = os.path.join(_ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)


def main():
    meteorites = json.load(open(os.path.join(_DATA, "meteorites.json"), encoding="utf-8"))
    craters = json.load(open(os.path.join(_DATA, "craters.json"), encoding="utf-8"))

    # ── Curate ──
    curated = {}
    for m in meteorites:
        if (m["fall"] == "Fell"
                or any(k in m["recclass"] for k in NOTABLE)
                or (m["mass"] or 0) >= 10000):
            curated[m["id"]] = m

    met_slugger = unique_slugger()
    crater_slugger = unique_slugger()

    # Slugs first — context sections link between pages
    curated_list = sorted(curated.values(), key=lambda x: x["name"].lower())
    met_slug = {m["id"]: met_slugger(m["name"]) for m in curated_list}
    crater_list = sorted(craters, key=lambda x: (x["crater_name"] or "").lower())
    crater_slug = {id(c): crater_slugger(c["crater_name"]) for c in crater_list}

    # ── Precomputed context ──
    all_index = LatIndex(meteorites)

    by_class = {}
    for m in meteorites:
        by_class.setdefault(m["recclass"], []).append(m)
    class_rank = {}
    for ms in by_class.values():
        for i, m in enumerate(sorted((x for x in ms if x["mass"] is not None), key=lambda x: -x["mass"])):
            class_rank[m["id"]] = i + 1

    falls_by_decade = {}
    for m in meteorites:
        if m["fall"] == "Fell" and m["year"]:
            dec = m["year"] // 10 * 10
            falls_by_decade[dec] = falls_by_decade.get(dec, 0) + 1

    curated_by_class, curated_by_type = {}, {}
    for m in curated_list:
        curated_by_class.setdefault(m["recclass"], []).append(m)
        ctype = lookup_class(m["recclass"])[0]
        if ctype:
            curated_by_type.setdefault(ctype, []).append(m)

    def heaviest_first(ms):
        return sorted(ms, key=lambda x: -(x["mass"] or 0))

    def met_ctx(m):
        neighbours = [(d, n, met_slug[n["id"]]) for d, n in nearest(m["lat"], m["lng"], curated_list, 6, exclude=m)]
        near_cr = [(d, c, crater_slug[id(c)]) for d, c in nearest(m["lat"], m["lng"], craters, 1) if d <= 1500]
        same = [x for x in heaviest_first(curated_by_class.get(m["recclass"], [])) if x is not m][:8]
        label = f"Other {m['recclass']} meteorites"
        ctype = lookup_class(m["recclass"])[0]
        if len(same) < 3 and ctype:
            same = [x for x in heaviest_first(curated_by_type.get(ctype, [])) if x is not m][:8]
            label = f"Other {ctype}s" if ctype.endswith("Meteorite") else f"Other {ctype} meteorites"
        decade = None
        if m["fall"] == "Fell" and m["year"]:
            dec = m["year"] // 10 * 10
            decade = (dec, falls_by_decade.get(dec, 1))
        return {
            "neighbours": neighbours,
            "near_craters": near_cr,
            "same_class": [(x, met_slug[x["id"]]) for x in same],
            "same_class_label": label,
            "class_rank": class_rank.get(m["id"]),
            "class_total": len(by_class.get(m["recclass"], [])),
            "total_records": len(meteorites),
            "decade_falls": decade,
            "count_near": len(all_index.within(m["lat"], m["lng"], NEAR_RADIUS_KM)) - 1,
            "map_points": [dict(lat=n["lat"], lng=n["lng"], kind="fell" if n["fall"] == "Fell" else "found")
                           for _, n, _ in neighbours]
                          + [dict(lat=c["lat"], lng=c["lng"], kind="crater") for _, c, _ in near_cr],
        }

    def diam(c):
        try:
            return float(c.get("diameter_km") or "")
        except ValueError:
            return None

    sized = sorted((c for c in craters if diam(c) is not None), key=lambda c: -diam(c))
    size_rank = {id(c): i + 1 for i, c in enumerate(sized)}
    country_count = {}
    for c in craters:
        if c.get("country"):
            country_count[c["country"]] = country_count.get(c["country"], 0) + 1

    def crater_ctx(c):
        near_cr = [(d, k, crater_slug[id(k)]) for d, k in nearest(c["lat"], c["lng"], craters, 4, exclude=c)]
        neighbours = [(d, n, met_slug[n["id"]]) for d, n in nearest(c["lat"], c["lng"], curated_list, 6)]
        return {
            "size_rank": (size_rank[id(c)], len(craters)) if id(c) in size_rank else None,
            "country_total": country_count.get(c.get("country"), 0),
            "count_near": len(all_index.within(c["lat"], c["lng"], NEAR_RADIUS_KM)),
            "near_craters": near_cr,
            "neighbours": neighbours,
            "map_points": [dict(lat=k["lat"], lng=k["lng"], kind="crater") for _, k, _ in near_cr]
                          + [dict(lat=n["lat"], lng=n["lng"], kind="fell" if n["fall"] == "Fell" else "found")
                             for _, n, _ in neighbours],
        }

    page_index = {}
    met_entries = []  # (name, slug) for directory + sitemap
    for m in curated_list:
        slug = met_slug[m["id"]]
        write(f"m/{slug}.html", meteorite_page(m, slug, met_ctx(m)))
        page_index[m["id"]] = slug
        met_entries.append((m["name"], slug, m["fall"] == "Fell"))

    crater_entries = []
    for c in crater_list:
        slug = crater_slug[id(c)]
        write(f"crater/{slug}.html", crater_page(c, slug, crater_ctx(c)))
        crater_entries.append((c["crater_name"], slug))

    write("data/page_index.json", json.dumps(page_index, separators=(",", ":")))

    # ── Directory (crawlable internal-link backbone) ──
    falls = [x for x in met_entries if x[2]]
    finds = [x for x in met_entries if not x[2]]

    def link_list(items, base):
        return "\n".join(f'<li><a href="/{base}/{s}.html">{e(n)}</a></li>' for n, s, *_ in items)

    directory = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Directory — All Meteorites &amp; Impact Craters | Meteorite Map</title>
<meta name="description" content="Browse every documented meteorite fall, notable find, and confirmed impact crater on wheretheyfall.com.">
<link rel="canonical" href="{SITE}/directory.html">
<link rel="icon" type="image/svg+xml" href="/img/favicon.svg">
<link rel="stylesheet" href="/css/detail.css">
</head><body>
<main class="detail directory">
<nav class="crumbs"><a href="/">Meteorite Map</a> <span>/</span> <span>Directory</span></nav>
<h1>Directory</h1>
<p class="lede">Every observed meteorite fall, notable find, and confirmed impact crater with a detail page. Explore them live on the <a href="/">interactive map</a>.</p>
<section><h2>Observed Falls ({len(falls)})</h2><ul class="cols">
{link_list(falls, "m")}
</ul></section>
<section><h2>Notable Finds ({len(finds)})</h2><ul class="cols">
{link_list(finds, "m")}
</ul></section>
<section><h2>Impact Craters ({len(crater_entries)})</h2><ul class="cols">
{link_list(crater_entries, "crater")}
</ul></section>
</main></body></html>
"""
    write("directory.html", directory)

    # ── Sitemap + robots ──
    urls = [f"{SITE}/", f"{SITE}/directory.html"]
    urls += [f"{SITE}/m/{s}.html" for _, s, *_ in met_entries]
    urls += [f"{SITE}/crater/{s}.html" for _, s in crater_entries]
    sm = ('<?xml version="1.0" encoding="UTF-8"?>\n'
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
          + "".join(f"<url><loc>{u}</loc></url>\n" for u in urls)
          + "</urlset>\n")
    write("sitemap.xml", sm)
    write("robots.txt", f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")

    print(f"Generated {len(met_entries)} meteorite + {len(crater_entries)} crater pages "
          f"({len(urls)} sitemap URLs).")


if __name__ == "__main__":
    main()
