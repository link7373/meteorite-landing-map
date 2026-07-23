'use strict';

/* ═══════════════════════════════════════════════════
   layers.js — layer toggle + legend panel (top-right)
   Lets the user show/hide the three map layers and doubles
   as the color legend. Loaded before app.js.
   ═══════════════════════════════════════════════════ */

/** Map a panel layer name to its AppState L.LayerGroup. */
function _layerFor(name) {
  if (name === 'meteorites') return AppState.markerLayer;
  if (name === 'fireballs')  return AppState.fireballLayer;
  if (name === 'craters')    return AppState.craterLayer;
  return null;
}

/** Show or hide a layer on the map. */
function toggleLayer(name, visible) {
  const layer = _layerFor(name);
  if (!layer || !AppState.map) return;
  const on = AppState.map.hasLayer(layer);
  if (visible && !on) AppState.map.addLayer(layer);
  else if (!visible && on) AppState.map.removeLayer(layer);
}

/** Wire up the layers/legend panel. */
function initLayers() {
  const panel  = document.getElementById('layers-panel');
  const list   = document.getElementById('layers-list');
  const toggle = document.getElementById('layers-toggle');
  if (!panel) return;

  // Reflect which layers actually loaded (a failed fetch leaves a null layer)
  list.querySelectorAll('input[data-layer]').forEach(cb => {
    if (!_layerFor(cb.dataset.layer)) {
      cb.checked = false;
      cb.disabled = true;
      cb.closest('li')?.classList.add('layer-missing');
    }
  });

  list.addEventListener('change', e => {
    const cb = e.target.closest('input[data-layer]');
    if (cb) toggleLayer(cb.dataset.layer, cb.checked);
  });

  // Collapse/expand (panel starts collapsed on narrow screens)
  if (window.matchMedia('(max-width: 768px)').matches) {
    panel.classList.add('collapsed');
    toggle.setAttribute('aria-expanded', 'false');
  }
  toggle.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });
}
