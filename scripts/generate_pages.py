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

import html
import json
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
<link rel="stylesheet" href="/css/detail.css">
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
{class_block}
<div class="actions">
<a class="cta" href="/?focus={focus}">▶ View on the interactive map</a>
{ebay}
</div>
<p class="disclosure">Some links are affiliate links — we may earn a small commission at no extra cost to you, which helps keep the map running.</p>
<p class="source">{source}</p>
</main>
</body>
</html>
"""


def meteorite_page(m, slug):
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

    jsonld = json.dumps({
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "Place", "name": name,
             "description": lede,
             "geo": {"@type": "GeoCoordinates", "latitude": m["lat"], "longitude": m["lng"]}},
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
        lede=e(lede), facts=facts, class_block=class_block,
        focus=e(m["id"]), ebay=ebay_link(name),
        source='Data: The Meteoritical Society Bulletin Database via NASA Open Data.',
    )


def crater_page(c, slug):
    name = c["crater_name"]
    diam = f"{c['diameter_km']} km" if c.get("diameter_km") else "unknown diameter"
    age = f"{c['age_millions_years_ago']} million years" if c.get("age_millions_years_ago") else "an unknown age"
    country = c.get("country") or "an unrecorded location"
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

    jsonld = json.dumps({
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "Landform", "name": name, "description": lede,
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
        title=e(f"{name} Impact Crater — {diam}, {country}"),
        desc=e(desc), canonical=f"{SITE}/crater/{slug}.html",
        jsonld=jsonld, section_label="Impact Craters", name=e(name),
        badge_cls="crater", badge="Crater", lede=e(lede), facts=facts,
        class_block="",
        focus="", ebay="", source=src + src_link,
    ).replace('<a class="cta" href="/?focus=">▶ View on the interactive map</a>',
              '<a class="cta" href="/">▶ Explore the interactive map</a>')


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

    page_index = {}
    met_entries = []  # (name, slug) for directory + sitemap
    for m in sorted(curated.values(), key=lambda x: x["name"].lower()):
        slug = met_slugger(m["name"])
        write(f"m/{slug}.html", meteorite_page(m, slug))
        page_index[m["id"]] = slug
        met_entries.append((m["name"], slug, m["fall"] == "Fell"))

    crater_entries = []
    for c in sorted(craters, key=lambda x: (x["crater_name"] or "").lower()):
        slug = crater_slugger(c["crater_name"])
        write(f"crater/{slug}.html", crater_page(c, slug))
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
