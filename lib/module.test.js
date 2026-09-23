import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alignModules, missingModuleIndexes, modelModuleStats, normalizeModule, parseModules } from './module.js';

const STEP = (n, check) => ({
  k: 'Step ' + n,
  t: 'Title ' + n,
  b: 'A kid can learn idea ' + n + ' from this sentence.',
  ...(check ? { q: 'Which is right for ' + n + '?', yes: 'The right one', no: 'The wrong one', why: 'Because the lesson said so.' } : {})
});

function goodModule() {
  return {
    ls: [STEP(1, true), STEP(2, true), STEP(3, true), STEP(4, false)],
    rf: [
      { t: 'Tell one', b: 'What it means.' },
      { t: 'Tell two', b: 'The second tell.' },
      { t: 'Tell three', b: 'The third tell.' }
    ],
    dr: [0, 1, 2, 3, 4, 5].map((n) => ({
      q: 'Question ' + n + '?',
      c: ['Right ' + n, 'Wrong A', 'Wrong B'],
      i: 0,
      y: 'The lesson names Right ' + n + '.'
    }))
  };
}

describe('normalizeModule', () => {
  it('keeps a compact lesson, reference, and drill', () => {
    const mod = normalizeModule(goodModule());
    assert.equal(mod.ls.length, 4);
    assert.equal(mod.ls[0].q, 'Which is right for 1?');
    assert.equal(mod.ls[3].q, undefined);
    assert.equal(mod.rf.length, 3);
    assert.equal(mod.dr.length, 6);
    assert.equal(mod.dr[0].i, 0);
  });

  it('drops a module that is only a lesson', () => {
    const thin = goodModule();
    thin.dr = [];
    thin.rf = [];
    assert.equal(normalizeModule(thin), null);
  });

  it('drops drill items with no defensible correct choice', () => {
    const mod = goodModule();
    mod.dr[0].i = 9;
    const out = normalizeModule(mod);
    assert.equal(out.dr.length, 5);
    assert.equal(out.dr[0].q, 'Question 1?');
  });

  it('accepts alternate keys and a mod envelope', () => {
    const raw = {
      mod: {
        lesson: [
          { title: 'Start', body: 'Here is the idea in plain words.', question: 'Pick one', right: 'Yes', wrong: 'No', because: 'Yes matches the idea.' },
          { title: 'Middle', body: 'Second idea.' },
          { title: 'End', body: 'Third idea.', question: 'Again?', a: 'A', b: 'B', why: 'A is the one.' }
        ],
        cards: [
          { name: 'Card', text: 'Lookup.' },
          { title: 'Card 2', body: 'More.' },
          { title: 'Card 3', body: 'Still more.' }
        ],
        drills: [
          { question: 'Q1', choices: ['A', 'B', 'C'], correct: 1, why: 'B is correct.' },
          { question: 'Q2', choices: ['A', 'B'], i: 0, y: 'A.' },
          { question: 'Q3', choices: ['A', 'B'], i: 0, y: 'A.' },
          { question: 'Q4', choices: ['A', 'B'], i: 0, y: 'A.' }
        ]
      }
    };
    const mod = normalizeModule(raw);
    assert.ok(mod);
    assert.equal(mod.ls[0].yes, 'Yes');
    assert.equal(mod.rf[0].t, 'Card');
    assert.equal(mod.dr[0].i, 1);
    assert.equal(mod.dr[0].c[1], 'B');
  });
});

describe('parseModules', () => {
  it('aligns a clean object to the atom count', () => {
    const { modules, via, covered } = parseModules({ modules: [goodModule(), goodModule()] }, 2);
    assert.equal(via, 'object');
    assert.equal(covered, 2);
    assert.equal(modules.length, 2);
  });

  it('repairs a truncated batch and keeps finished modules in order', () => {
    const payload = { modules: [goodModule(), goodModule(), goodModule()] };
    const text = JSON.stringify(payload);
    const third = text.lastIndexOf('"k":"Step 1"');
    const cut = text.slice(0, third + 12);
    assert.throws(() => JSON.parse(cut));
    const { modules, via, covered } = parseModules(cut, 3);
    assert.equal(via, 'repaired');
    assert.equal(covered, 2);
    assert.equal(modules.length, 3);
    assert.ok(modules[0]);
    assert.ok(modules[1]);
    assert.equal(modules[2], null);
    assert.equal(modules[0].ls[0].t, 'Title 1');
  });

  it('returns empty when nothing usable survived', () => {
    const { modules, via } = parseModules('{"modules":[{"ls":[{"t":"x","b":"y"}]}]}', 1);
    assert.equal(modules, null);
    assert.equal(via, 'empty');
  });
});

describe('coverage', () => {
  it('reports atoms that still need a module', () => {
    const atoms = [{ n: 'A', mod: goodModule() }, { n: 'B' }, { n: 'C', mod: { ls: [] } }];
    assert.deepEqual(missingModuleIndexes(atoms), [1, 2]);
    const stats = modelModuleStats({
      layers: [{ atoms }, { atoms: [{ n: 'D', mod: goodModule() }] }]
    });
    assert.equal(stats.atoms, 4);
    assert.equal(stats.modules, 2);
    assert.equal(stats.missing, 2);
  });

  it('alignModules pads missing slots with null', () => {
    const modules = alignModules([goodModule()], 3);
    assert.equal(modules.length, 3);
    assert.ok(modules[0]);
    assert.equal(modules[1], null);
    assert.equal(modules[2], null);
  });
});
