'use strict';

/* ═══════════════════════════════════════════════════
   classification.js — classification tooltip + modal
   Loaded after filters.js, before app.js.
   ═══════════════════════════════════════════════════ */

/** Lookup table: class → { type, group, desc, wiki } */
const CLASS_GUIDE = {
  'L5':        { type: 'Ordinary Chondrite', group: 'L group',    desc: 'Low-iron stony meteorite, petrologic type 5 (well-recrystallised).', wiki: 'L_chondrite' },
  'L6':        { type: 'Ordinary Chondrite', group: 'L group',    desc: 'Low-iron stony meteorite, petrologic type 6 (heavily recrystallised).', wiki: 'L_chondrite' },
  'H5':        { type: 'Ordinary Chondrite', group: 'H group',    desc: 'High-iron stony meteorite, petrologic type 5.', wiki: 'H_chondrite' },
  'H6':        { type: 'Ordinary Chondrite', group: 'H group',    desc: 'High-iron stony meteorite, petrologic type 6.', wiki: 'H_chondrite' },
  'H4':        { type: 'Ordinary Chondrite', group: 'H group',    desc: 'High-iron stony meteorite, petrologic type 4 (partially recrystallised).', wiki: 'H_chondrite' },
  'LL5':       { type: 'Ordinary Chondrite', group: 'LL group',   desc: 'Low total iron, low metallic iron stony meteorite, type 5.', wiki: 'LL_chondrite' },
  'LL6':       { type: 'Ordinary Chondrite', group: 'LL group',   desc: 'Low total iron, low metallic iron stony meteorite, type 6.', wiki: 'LL_chondrite' },
  'L4':        { type: 'Ordinary Chondrite', group: 'L group',    desc: 'Low-iron stony meteorite, petrologic type 4.', wiki: 'L_chondrite' },
  'CM2':       { type: 'Carbonaceous Chondrite', group: 'CM group', desc: 'Hydrated carbonaceous meteorite rich in organic compounds.', wiki: 'CM_chondrite' },
  'CV3':       { type: 'Carbonaceous Chondrite', group: 'CV group', desc: 'Calcium-aluminium-rich inclusion-bearing carbonaceous meteorite.', wiki: 'CV_chondrite' },
  'CO3.2':     { type: 'Carbonaceous Chondrite', group: 'CO group', desc: 'Carbonaceous chondrite, small chondrules, petrologic subtype 3.2.', wiki: 'CO_chondrite' },
  'Iron, IIIAB':   { type: 'Iron Meteorite',    group: 'IIIAB group', desc: 'Most common iron meteorite group; derived from a differentiated parent body core.', wiki: 'IIIAB_iron_meteorite' },
  'Iron, IAB complex': { type: 'Iron Meteorite', group: 'IAB complex', desc: 'Ungrouped iron meteorite family, likely from a disrupted parent body.', wiki: 'IAB_iron_meteorite' },
  'Iron, IVA': { type: 'Iron Meteorite',    group: 'IVA group',   desc: 'Iron meteorite from a stripped planetary core; low germanium content.', wiki: 'Iron_meteorite' },
  'Pallasite, PMG': { type: 'Stony-Iron',  group: 'Pallasites',  desc: 'Beautiful mix of olivine crystals in metallic iron; from core-mantle boundary.', wiki: 'Pallasite' },
  'Eucrite, monomict': { type: 'Achondrite', group: 'HED group',  desc: 'Basaltic meteorite from asteroid 4 Vesta surface.', wiki: 'Eucrite' },
  'Howardite':    { type: 'Achondrite',  group: 'HED group',      desc: 'Regolith breccia from asteroid 4 Vesta.', wiki: 'Howardite' },
  'Diogenite':    { type: 'Achondrite',  group: 'HED group',      desc: 'Coarse-grained orthopyroxenite from deep within asteroid 4 Vesta.', wiki: 'Diogenite' },
  'Lunar (mare basalt)': { type: 'Achondrite', group: 'Lunar',   desc: 'Basaltic rock ejected from the Moon by impact.', wiki: 'Lunar_meteorite' },
  'Martian (shergottite)': { type: 'Achondrite', group: 'SNC (Mars)', desc: 'Volcanic rock from Mars, delivered by impact ejection.', wiki: 'Shergottite' },
  'Ureilite':     { type: 'Achondrite',  group: 'Ureilite',       desc: 'Carbon-rich achondrite from an ancient disrupted parent body.', wiki: 'Ureilite' },
  'Enstatite chondrite': { type: 'Enstatite Chondrite', group: 'EL/EH', desc: 'Highly reduced meteorite formed in an oxygen-poor environment.', wiki: 'Enstatite_chondrite' },
  'R chondrite':  { type: 'Rumuruti Chondrite', group: 'R group', desc: 'Highly oxidised chondrite; rare group with only ~100 known members.', wiki: 'Rumuruti_chondrite' },
  'OC':           { type: 'Ordinary Chondrite', group: 'Unclassified OC', desc: 'Ordinary chondrite, sub-type not yet determined.', wiki: 'Ordinary_chondrite' },
};

/** Tooltip element (shared, repositioned on demand) */
let _tooltip = null;

function _getTooltip() {
  if (!_tooltip) {
    _tooltip = document.createElement('div');
    _tooltip.className = 'cls-tooltip';
    _tooltip.setAttribute('role', 'tooltip');
    document.body.appendChild(_tooltip);
  }
  return _tooltip;
}

function _lookupClass(cls) {
  // Exact match
  if (CLASS_GUIDE[cls]) return CLASS_GUIDE[cls];
  // Prefix match (e.g. "L5" matches "L5/6")
  for (const key of Object.keys(CLASS_GUIDE)) {
    if (cls.startsWith(key) || key.startsWith(cls)) return CLASS_GUIDE[key];
  }
  return null;
}

/** Initialise tooltip and click-to-modal on the document (event delegation) */
function initClassificationGuide() {
  // Tooltip on hover
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-class]');
    if (!el) return;
    const cls = el.dataset.class;
    const info = _lookupClass(cls);
    if (!info) return;
    const tip = _getTooltip();
    tip.textContent = `${info.type} — ${info.desc}`;
    tip.style.display = 'block';
    _positionTooltip(tip, el);
  });

  document.addEventListener('mouseout', e => {
    if (e.target.closest('[data-class]') && _tooltip) {
      _tooltip.style.display = 'none';
    }
  });

  // Click to open modal
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-class]');
    if (!el) return;
    openClassModal(el.dataset.class);
  });

  // Close modal on backdrop click or close button
  document.getElementById('class-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('class-modal')) closeClassModal();
  });
  document.getElementById('class-modal-close').addEventListener('click', closeClassModal);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeClassModal();
  });
}

function _positionTooltip(tip, anchor) {
  const rect = anchor.getBoundingClientRect();
  tip.style.left = `${rect.left + window.scrollX}px`;
  tip.style.top  = `${rect.bottom + window.scrollY + 6}px`;
}

/** Open the classification modal for a given class string */
async function openClassModal(cls) {
  const modal    = document.getElementById('class-modal');
  const titleEl  = document.getElementById('class-modal-title');
  const bodyEl   = document.getElementById('class-modal-body');
  const wikiLink = document.getElementById('class-modal-wiki-link');

  const info = _lookupClass(cls);

  titleEl.textContent = cls;
  wikiLink.style.display = 'none';

  if (info) {
    bodyEl.innerHTML = `
      <dl class="cls-detail">
        <dt>Type</dt><dd>${escapeHtml(info.type)}</dd>
        <dt>Group</dt><dd>${escapeHtml(info.group)}</dd>
        <dt>Description</dt><dd>${escapeHtml(info.desc)}</dd>
      </dl>
      <div class="cls-wiki-section">
        <div class="cls-wiki-loading">Loading Wikipedia summary…</div>
      </div>`;
  } else {
    bodyEl.innerHTML = `<p class="cls-unknown">No detailed guide available for this classification.</p>
      <div class="cls-wiki-section"><div class="cls-wiki-loading">Searching Wikipedia…</div></div>`;
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('class-modal-close').focus();

  // Fetch Wikipedia
  const wikiTitle = info?.wiki || cls.replace(/[,\s]+/g, '_');
  try {
    const data = await _fetchWikiSummary(wikiTitle);
    const wikiSection = bodyEl.querySelector('.cls-wiki-section');
    if (data && data.extract) {
      wikiSection.innerHTML = `<p class="cls-wiki-extract">${escapeHtml(data.extract)}</p>`;
      if (data.pageUrl) {
        wikiLink.href = data.pageUrl;
        wikiLink.style.display = '';
      }
    } else {
      wikiSection.innerHTML = `<p class="cls-wiki-none">No Wikipedia article found for this classification.</p>`;
    }
  } catch (err) {
    const wikiSection = bodyEl.querySelector('.cls-wiki-section');
    if (wikiSection) wikiSection.innerHTML = `<p class="cls-wiki-none">Could not load Wikipedia summary.</p>`;
  }
}

function closeClassModal() {
  const modal = document.getElementById('class-modal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

async function _fetchWikiSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.type === 'disambiguation' || !data.extract) return null;
  return {
    extract: data.extract,
    pageUrl: data.content_urls?.desktop?.page,
  };
}
