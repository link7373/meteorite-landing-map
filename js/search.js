'use strict';

/* ═══════════════════════════════════════════════════
   search.js — search bar with autocomplete + fly-to
   ═══════════════════════════════════════════════════ */

let _searchTimer  = null;
let _focusedIndex = -1;

/** Wire up the search input, results list, and clear button */
function initSearch() {
  const input     = document.getElementById('search-input');
  const resultsEl = document.getElementById('search-results');
  const clearBtn  = document.getElementById('search-clear');

  input.addEventListener('input', () => {
    clearTimeout(_searchTimer);
    const query = input.value.trim();

    clearBtn.classList.toggle('hidden', query.length === 0);

    if (query.length < 2) {
      _hideResults();
      return;
    }

    _searchTimer = setTimeout(() => {
      const matches = _findMatches(query);
      _renderResults(matches, query);
    }, 150);
  });

  input.addEventListener('keydown', e => {
    const items = resultsEl.querySelectorAll('.search-result-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _focusedIndex = Math.min(_focusedIndex + 1, items.length - 1);
      _updateFocus(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _focusedIndex = Math.max(_focusedIndex - 1, 0);
      _updateFocus(items);
    } else if (e.key === 'Enter' && _focusedIndex >= 0) {
      e.preventDefault();
      items[_focusedIndex]?.click();
    } else if (e.key === 'Escape') {
      _hideResults();
      input.blur();
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    _hideResults();
    input.focus();
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!document.getElementById('search-container').contains(e.target)) {
      _hideResults();
    }
  });
}

/** Return up to 10 best-matching meteorites for the query */
function _findMatches(query) {
  const lower = query.toLowerCase();

  return AppState.allMeteorites
    .filter(m => m.name.toLowerCase().includes(lower))
    .sort((a, b) => {
      // Prioritize prefix matches
      const aPrefix = a.name.toLowerCase().startsWith(lower);
      const bPrefix = b.name.toLowerCase().startsWith(lower);
      if (aPrefix && !bPrefix) return -1;
      if (!aPrefix && bPrefix)  return 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 10);
}

/** Wrap the matching substring in <mark> */
function _highlight(name, query) {
  const lower = name.toLowerCase();
  const idx   = lower.indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(name);
  return (
    escapeHtml(name.slice(0, idx)) +
    `<mark>${escapeHtml(name.slice(idx, idx + query.length))}</mark>` +
    escapeHtml(name.slice(idx + query.length))
  );
}

/** Render the dropdown list of suggestions */
function _renderResults(matches, query) {
  const resultsEl = document.getElementById('search-results');
  _focusedIndex = -1;

  if (!matches.length) {
    resultsEl.innerHTML = `<li class="search-no-results">No meteorites found</li>`;
    resultsEl.classList.remove('hidden');
    return;
  }

  resultsEl.innerHTML = matches.map((m, i) => `
    <li
      class="search-result-item"
      role="option"
      data-id="${escapeHtml(m.id)}"
      data-index="${i}"
      tabindex="-1"
    >
      <span class="result-name">${_highlight(m.name, query)}</span>
      <span class="result-meta">${m.year !== null ? m.year : '?'} · ${escapeHtml(m.recclass)}</span>
    </li>
  `).join('');

  resultsEl.querySelectorAll('.search-result-item').forEach((item, i) => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      flyToMeteorite(id);

      const input    = document.getElementById('search-input');
      const clearBtn = document.getElementById('search-clear');
      input.value    = matches[i].name;
      clearBtn.classList.remove('hidden');
      _hideResults();
    });
  });

  resultsEl.classList.remove('hidden');
}

function _updateFocus(items) {
  items.forEach((item, i) =>
    item.classList.toggle('focused', i === _focusedIndex)
  );
}

function _hideResults() {
  const resultsEl = document.getElementById('search-results');
  resultsEl.classList.add('hidden');
  resultsEl.innerHTML = '';
  _focusedIndex = -1;
}

/**
 * Fly the map to a meteorite by ID and open its popup.
 * Uses zoomToShowLayer to de-cluster if needed.
 */
function flyToMeteorite(id) {
  const m      = AppState.allMeteorites.find(x => x.id === id);
  const marker = AppState.markerMap.get(id);
  if (!m || !marker) return;

  // Fly to position
  AppState.map.flyTo([m.lat, m.lng], 8, { animate: true, duration: 1.2 });

  // After flight lands, de-cluster and open popup
  setTimeout(() => {
    AppState.markerLayer.zoomToShowLayer(marker, () => {
      setTimeout(() => marker.openPopup(), 80);
    });
  }, 1300);
}
