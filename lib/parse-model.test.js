import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseModel,
  normalizeModel,
  repairTruncatedJson,
  sliceFirstJsonObject
} from './parse-model.js';

const VALID = {
  lane: 'systems and shipping',
  layers: [
    {
      name: 'Foundations',
      sub: 'see the machine',
      atoms: [
        {
          n: 'Name the four deployment environments',
          hrs: 4,
          ex: ['List them from memory', 'Draw the promotion path', 'Label a real repo'],
          pass: 'You can name all four without notes'
        }
      ]
    },
    {
      name: 'Production',
      sub: 'ship something real',
      atoms: [
        {
          n: 'Write a rollback runbook',
          hrs: 6,
          ex: ['Draft the steps', 'Time a dry run', 'Hand it to a peer'],
          pass: 'A peer can execute the rollback from the page'
        }
      ]
    }
  ]
};

describe('parseModel', () => {
  it('accepts a clean object', () => {
    const { model, via } = parseModel(VALID);
    assert.equal(via, 'object');
    assert.equal(model.layers.length, 2);
    assert.equal(model.layers[0].atoms[0].n, 'Name the four deployment environments');
  });

  it('accepts clean JSON text', () => {
    const { model, via } = parseModel(JSON.stringify(VALID));
    assert.equal(via, 'json');
    assert.equal(model.lane, 'systems and shipping');
    assert.equal(model.layers.length, 2);
  });

  it('strips markdown fences and preamble', () => {
    const text = 'Here you go:\n```json\n' + JSON.stringify(VALID) + '\n```\nThanks!';
    const { model, via } = parseModel(text);
    assert.equal(via, 'json');
    assert.equal(model.layers.length, 2);
  });

  it('keeps the first object when trailing junk follows a complete JSON body', () => {
    const text = JSON.stringify(VALID) + '\nNote: more later';
    const slice = sliceFirstJsonObject(text);
    assert.ok(slice.endsWith('}'));
    const { model, via } = parseModel(text);
    assert.equal(via, 'json');
    assert.equal(model.layers.length, 2);
  });

  it('repairs truncation mid-string and salvages complete atoms', () => {
    const prefix = JSON.stringify(VALID).slice(0, -40);
    assert.throws(() => JSON.parse(prefix));
    const repaired = repairTruncatedJson(prefix);
    assert.ok(repaired);
    const { model, via } = parseModel(prefix);
    assert.equal(via, 'repaired');
    assert.ok(model.layers.length >= 1);
    assert.ok(model.layers[0].atoms.length >= 1);
    assert.ok(model.layers[0].atoms[0].n);
  });

  it('repairs truncation after a complete first layer', () => {
    const text = '{"lane":"cto lane","layers":[{"name":"Sense","sub":"see systems","atoms":[{"n":"Map a request path","hrs":4,"ex":["Trace one hop","Draw the boxes","Name the failure"],"pass":"You can draw it from memory"}]},{"name":"Ship","sub":"cut mid';
    const { model, via } = parseModel(text);
    assert.equal(via, 'repaired');
    assert.equal(model.layers.length, 1);
    assert.equal(model.layers[0].name, 'Sense');
    assert.equal(model.layers[0].atoms[0].ex.length, 3);
  });

  it('drops empty layers and incomplete atoms', () => {
    const raw = {
      lane: 'x',
      layers: [
        { name: '', atoms: [{ n: 'Nope', hrs: 3, ex: ['a'], pass: 'p' }] },
        { name: 'Keep', atoms: [{ n: '', hrs: 3, ex: ['a'] }, { n: 'Real atom', hrs: 5, ex: ['do it'], pass: 'done' }] }
      ]
    };
    const model = normalizeModel(raw);
    assert.equal(model.layers.length, 1);
    assert.equal(model.layers[0].atoms.length, 1);
    assert.equal(model.layers[0].atoms[0].n, 'Real atom');
  });

  it('accepts alternate keys used by sloppy model output', () => {
    const raw = {
      domain: 'product',
      layers: [
        {
          title: 'Taste',
          subtitle: 'see quality',
          atoms: [
            {
              name: 'Name three taste tests',
              hours: 8,
              exercises: ['Taste A', 'Taste B'],
              pass_condition: 'You can run all three'
            }
          ]
        }
      ]
    };
    const model = normalizeModel(raw);
    assert.equal(model.lane, 'product');
    assert.equal(model.layers[0].name, 'Taste');
    assert.equal(model.layers[0].atoms[0].n, 'Name three taste tests');
    assert.equal(model.layers[0].atoms[0].hrs, 8);
    assert.deepEqual(model.layers[0].atoms[0].ex, ['Taste A', 'Taste B']);
    assert.equal(model.layers[0].atoms[0].pass, 'You can run all three');
  });

  it('returns fail on empty layers (the live ENGINE_PARSE empty-model path)', () => {
    const { model, via } = parseModel('{"lane":"x","layers":[]}');
    assert.equal(model, null);
    assert.equal(via, 'empty');
  });

  it('returns fail on non-JSON', () => {
    const { model, via } = parseModel('I cannot produce that curriculum right now.');
    assert.equal(model, null);
    assert.equal(via, 'fail');
  });

  it('unwraps a { model: ... } envelope', () => {
    const model = normalizeModel({ model: VALID, ok: true });
    assert.equal(model.layers.length, 2);
  });
});
