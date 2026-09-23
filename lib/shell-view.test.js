import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

await import('./shell-view.js');
const { ICON_CYCLE, buildShellView, captureShellProgress } = globalThis.ShellView;

function track() {
  return {
    id: 't1',
    name: 'Chief Technology Officer',
    pace: 30,
    selected: 1,
    done: { '0-1': 1, '1-0': 1 },
    gaps: [['need incident drills'], []],
    model: {
      lane: 'cto lane',
      layers: [
        {
          name: 'Sense',
          sub: 'see systems',
          atoms: [
            { n: 'Map a request path', hrs: 4, ex: ['Trace one hop'], pass: 'Draw it cold' },
            { n: 'Name the failure', hrs: 6, ex: ['Break one hop'], pass: 'Say it out loud' }
          ]
        },
        {
          name: 'Ship',
          sub: 'cut a release',
          atoms: [
            { n: 'Ship a flag', hrs: 5, ex: [], pass: 'It is live' }
          ]
        }
      ]
    }
  };
}

test('maps atoms to nodes, cycles icons, and copies sub into desc', () => {
  const t = track();
  const view = buildShellView(t);
  assert.equal(view.layers.length, 2);
  assert.equal(view.layers[0].icon, 'visual');
  assert.equal(view.layers[1].icon, 'object');
  assert.equal(view.layers[0].desc, 'see systems');
  assert.equal(view.layers[0].sub, 'see systems');
  assert.equal(view.layers[0].nodes[0].n, 'Map a request path');
  assert.equal(view.layers[0].nodes[0].hrs, 4);
  assert.deepEqual(view.layers[0].nodes[0].ex, ['Trace one hop']);
  assert.equal(view.layers[0].nodes[0].pass, 'Draw it cold');
  assert.equal(view.layers[0].nodes[1].s, 1);
  assert.equal(view.layers[0].nodes[0].s, 0);
  assert.equal(view.layers[1].nodes[0].s, 1);
  assert.equal(view.pace, 30);
  assert.equal(view.selected, 1);
});

test('does not invent readings, materials, or cohort groups', () => {
  const view = buildShellView(track());
  view.layers.forEach((l) => {
    assert.equal(l.reads, undefined);
    assert.notEqual(l.id, 'cohort');
    l.nodes.forEach((nd) => {
      assert.equal(nd.mat, undefined);
      assert.equal(nd.h, undefined);
      assert.equal(nd.matLabel, undefined);
    });
  });
});

test('gaps stay on the track and are shared with the view', () => {
  const t = track();
  const view = buildShellView(t);
  assert.equal(view.layers[0].gaps, t.gaps[0]);
  view.layers[0].gaps.push('another gap');
  assert.deepEqual(t.gaps[0], ['need incident drills', 'another gap']);
});

test('capture writes done keys, pace, and gaps without CD fields', () => {
  const t = track();
  const view = buildShellView(t);
  view.layers[0].nodes[0].s = 1;
  view.layers[1].nodes[0].s = 0;
  view.pace = 90;
  view.selected = 0;
  const prog = captureShellProgress(view);
  assert.deepEqual(prog.done, { '0-0': 1, '0-1': 1 });
  assert.equal(prog.pace, 90);
  assert.equal(prog.selected, 0);
  assert.equal(prog.gaps[0], t.gaps[0]);
  assert.equal(prog.layers, undefined);
  assert.equal(prog.nodes, undefined);
});

test('clearing node state captures an empty done and keeps gaps', () => {
  const t = track();
  const view = buildShellView(t);
  view.layers.forEach((l) => l.nodes.forEach((nd) => { nd.s = 0; }));
  const prog = captureShellProgress(view);
  assert.deepEqual(prog.done, {});
  assert.deepEqual(prog.gaps[0], ['need incident drills']);
  assert.equal(prog.pace, 30);
});

test('pace defaults to 60 and icons cycle past four layers', () => {
  const t = track();
  delete t.pace;
  t.selected = 9;
  t.model.layers.push(
    { name: 'C', sub: 'c', atoms: [{ n: 'c', hrs: 3, ex: ['c'], pass: 'c' }] },
    { name: 'D', sub: 'd', atoms: [{ n: 'd', hrs: 3, ex: ['d'], pass: 'd' }] },
    { name: 'E', sub: 'e', atoms: [{ n: 'e', hrs: 3, ex: ['e'], pass: 'e' }] }
  );
  const view = buildShellView(t);
  assert.equal(view.pace, 60);
  assert.equal(view.selected, 0);
  assert.deepEqual(view.layers.map((l) => l.icon), [
    ICON_CYCLE[0], ICON_CYCLE[1], ICON_CYCLE[2], ICON_CYCLE[3], ICON_CYCLE[0]
  ]);
});

test('the page keeps commissioned progress off the Creative Director key', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(html.includes('function renderGTrack'), false);
  assert.equal(html.includes('id="gtrackView"'), false);
  assert.equal(html.includes("const STORAGE_KEY = 'substrate-cd-v5'"), true);
  assert.equal(html.includes("const SHELL_KEY = 'substrate-shell'"), true);
  const saveBody = html.slice(html.indexOf('function save()'), html.indexOf('const atomsOf'));
  const shellBranch = saveBody.slice(0, saveBody.indexOf('const slim'));
  assert.equal(shellBranch.includes('SHELL_KEY'), true);
  assert.equal(shellBranch.includes('STORAGE_KEY'), false);
  assert.equal(shellBranch.includes('return;'), true);
});

test('missing hours fall back to 4 and a known icon is kept', () => {
  const t = track();
  t.model.layers[0].icon = 'craft';
  t.model.layers[0].atoms[0].hrs = 0;
  const view = buildShellView(t);
  assert.equal(view.layers[0].icon, 'craft');
  assert.equal(view.layers[0].nodes[0].hrs, 4);
  assert.equal(view.layers[1].icon, 'object');
});
