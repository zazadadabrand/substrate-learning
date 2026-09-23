/* Map a commissioned track onto the Creative Director view-model.
   Progress stays on the track (done, gaps, pace, selected). This file never
   reads or writes substrate-cd-v5. It does not invent readings, materials,
   or cohort groups — empty mat is left empty so the shell shows the pending line. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShellView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ICON_CYCLE = ['visual', 'object', 'craft', 'direction'];

  function shellAtomKey(li, ai) {
    return li + '-' + ai;
  }

  function buildShellView(track) {
    const t = track || {};
    const layersIn = t.model && Array.isArray(t.model.layers) ? t.model.layers : [];
    const done = t.done && typeof t.done === 'object' && !Array.isArray(t.done) ? t.done : {};
    if (!Array.isArray(t.gaps)) t.gaps = [];
    const layers = layersIn.map((l, li) => {
      const layer = l || {};
      const atoms = Array.isArray(layer.atoms) ? layer.atoms : [];
      if (!Array.isArray(t.gaps[li])) t.gaps[li] = [];
      const nodes = atoms.map((a, ai) => {
        const atom = a || {};
        const hrsNum = Number(atom.hrs);
        return {
          n: atom.n || '',
          s: done[shellAtomKey(li, ai)] ? 1 : 0,
          hrs: Number.isFinite(hrsNum) && hrsNum > 0 ? hrsNum : 4,
          ex: Array.isArray(atom.ex) ? atom.ex : [],
          pass: atom.pass || '',
          _li: li,
          _ai: ai
        };
      });
      const named = ICON_CYCLE.indexOf(layer.icon) >= 0 ? layer.icon : null;
      return {
        id: 'g' + li,
        name: layer.name || '',
        sub: layer.sub || '',
        icon: named || ICON_CYCLE[li % ICON_CYCLE.length],
        desc: layer.sub || '',
        nodes,
        gaps: t.gaps[li]
      };
    });
    const pace = t.pace === 30 || t.pace === 60 || t.pace === 90 ? t.pace : 60;
    let selected = Number.isInteger(t.selected) ? t.selected : 0;
    if (selected < 0 || selected >= layers.length) selected = 0;
    return { selected, pace, layers };
  }

  function captureShellProgress(view) {
    const done = {};
    const gaps = [];
    const layers = (view && view.layers) || [];
    layers.forEach((l, li) => {
      (l.nodes || []).forEach((nd) => {
        if (!nd || nd.h) return;
        if (!Number.isInteger(nd._ai)) return;
        if (nd.s) done[shellAtomKey(li, nd._ai)] = 1;
      });
      gaps[li] = Array.isArray(l.gaps) ? l.gaps : [];
    });
    const pace = view && (view.pace === 30 || view.pace === 60 || view.pace === 90) ? view.pace : 60;
    let selected = view && Number.isInteger(view.selected) ? view.selected : 0;
    if (selected < 0 || selected >= layers.length) selected = 0;
    return { done, gaps, pace, selected };
  }

  return { ICON_CYCLE, shellAtomKey, buildShellView, captureShellProgress };
});
