import { extractReads, buildPlan, findMissingInputs, findImpacted } from '../src/services/dependency.service.js';
import { CycleError } from '../src/utils/errors.js';

const f = (name, formula_text) => ({ uuid: `${name}-uuid`, name, version: 1, formula_text });

describe('extractReads', () => {
  test('finds unique names in order, ignores comments', () => {
    expect(extractReads('// EXTERNAL_VAR.nope\nreturn EXTERNAL_VAR.a + EXTERNAL_VAR.b * EXTERNAL_VAR.a /* EXTERNAL_VAR.c */')).toEqual(['a', 'b']);
  });
});

describe('dependency ordering', () => {
  test('worked example: commission -> tax -> total, whatever the creation order', () => {
    const plan = buildPlan([
      f('total', 'return EXTERNAL_VAR.commission + EXTERNAL_VAR.tax'),
      f('tax', 'return EXTERNAL_VAR.commission * 0.18'),
      f('commission', 'return EXTERNAL_VAR.amount * EXTERNAL_VAR.rate / 100'),
    ]);
    expect(plan.levels).toEqual([['commission'], ['tax'], ['total']]);
  });
  test('independent formulas share a level (so they can run in parallel)', () => {
    const plan = buildPlan([f('x', 'return EXTERNAL_VAR.a'), f('y', 'return EXTERNAL_VAR.b'), f('z', 'return EXTERNAL_VAR.x + EXTERNAL_VAR.y')]);
    expect(plan.levels).toEqual([['x', 'y'], ['z']]);
  });
  test('missing inputs are reported (neither a formula nor a record field)', () => {
    const plan = buildPlan([f('tax', 'return EXTERNAL_VAR.commission * EXTERNAL_VAR.vat')]);
    expect(findMissingInputs(plan, { vat: 0.1 })).toEqual([{ formula: 'tax', missing: ['commission'] }]);
  });
  test('impact lists direct and indirect dependents', () => {
    const list = [f('c', 'return EXTERNAL_VAR.amount'), f('t', 'return EXTERNAL_VAR.c'), f('total', 'return EXTERNAL_VAR.t')];
    expect(findImpacted('c', list)).toEqual([
      { uuid: 't-uuid', name: 't', dependency: 'DIRECT' },
      { uuid: 'total-uuid', name: 'total', dependency: 'INDIRECT' },
    ]);
  });
});

describe('loop detection', () => {
  test('reports the full path a -> b -> c -> a', () => {
    expect(() => buildPlan([f('a', 'return EXTERNAL_VAR.b'), f('b', 'return EXTERNAL_VAR.c'), f('c', 'return EXTERNAL_VAR.a')])).toThrow(CycleError);
    try {
      buildPlan([f('c', 'return EXTERNAL_VAR.a'), f('b', 'return EXTERNAL_VAR.c'), f('a', 'return EXTERNAL_VAR.b')]);
    } catch (e) {
      expect(e.details.path).toEqual(['a', 'b', 'c', 'a']);
      expect(e.message).toBe('Dependency loop: a → b → c → a');
    }
  });
  test('a formula reading itself is a loop', () => {
    expect(() => buildPlan([f('a', 'return EXTERNAL_VAR.a + 1')])).toThrow('a → a');
  });
});
