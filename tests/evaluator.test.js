import { buildPlan } from '../src/services/dependency.service.js';
import { evaluatePlan, runFormula } from '../src/services/evaluator.service.js';

const f = (name, formula_text) => ({ uuid: `${name}-uuid`, name, version: 1, formula_text });

describe('evaluator (real formula-interpreter child processes)', () => {
  test('worked example: 200, 36, 236 with step-by-step explanation', async () => {
    const plan = buildPlan([
      f('total', 'return EXTERNAL_VAR.commission + EXTERNAL_VAR.tax'),
      f('tax', 'return EXTERNAL_VAR.commission * 0.18'),
      f('commission', 'return EXTERNAL_VAR.amount * EXTERNAL_VAR.rate / 100'),
    ]);
    const { results, finalRecord } = await evaluatePlan(plan, { amount: 2000, rate: 10 });
    expect(results.map((r) => [r.name, r.result])).toEqual([['commission', 200], ['tax', 36], ['total', 236]]);
    expect(finalRecord).toEqual({ amount: 2000, rate: 10, commission: 200, tax: 36, total: 236 });
    expect(results[0].calculation).toEqual({
      inputs: ['amount = 2000', 'rate = 10'],
      formula: 'return EXTERNAL_VAR.amount * EXTERNAL_VAR.rate / 100',
      steps: ['= 2000 * 10 / 100'],
      result: '= 200',
    });
  }, 20000);

  test('rounding: result never shows floating point noise', async () => {
    const out = await runFormula({ text: 'return EXTERNAL_VAR.a + EXTERNAL_VAR.b', scope: { a: 0.1, b: 0.2 } });
    expect(out.result).toBe(0.3);
  }, 10000);

  test('syntax error -> FAILED with a message, never throws', async () => {
    const out = await runFormula({ text: 'return (((', scope: {} });
    expect(out.status).toBe('FAILED');
    expect(out.error).toMatch(/Unexpected/);
  }, 10000);

  test('timeout: a formula that never ends is stopped and marked FAILED', async () => {
    const started = Date.now();
    const out = await runFormula({ text: 'while (true) {}', scope: {}, timeoutMs: 500 });
    expect(out.status).toBe('FAILED');
    expect(out.error).toBe('Timed out after 500ms');
    expect(Date.now() - started).toBeLessThan(3000);
  }, 10000);

  test('skipped dependents: FAILED -> dependents SKIPPED, independent formulas still SUCCEED', async () => {
    const plan = buildPlan([
      f('stuck', 'while (true) {}'),
      f('after_stuck', 'return EXTERNAL_VAR.stuck + 1'),
      f('after_after', 'return EXTERNAL_VAR.after_stuck + 1'),
      f('fine', 'return EXTERNAL_VAR.x * 2'),
    ]);
    const { results } = await evaluatePlan(plan, { x: 4 }, { timeoutMs: 500 });
    const by = Object.fromEntries(results.map((r) => [r.name, r]));
    expect(by.stuck.status).toBe('FAILED');
    expect(by.after_stuck.status).toBe('SKIPPED');
    expect(by.after_stuck.error).toMatch(/'stuck' \(FAILED\)/);
    expect(by.after_after.status).toBe('SKIPPED');
    expect(by.fine).toMatchObject({ status: 'SUCCESS', result: 8 });
  }, 20000);

  test('fast engine (vm) gives the same numbers and also stops infinite loops', async () => {
    const ok = await runFormula({ text: 'return EXTERNAL_VAR.a * 2', scope: { a: 21 }, fast: true });
    expect(ok.result).toBe(42);
    const stuck = await runFormula({ text: 'while (true) {}', scope: {}, timeoutMs: 200, fast: true });
    expect(stuck).toMatchObject({ status: 'FAILED', error: 'Timed out after 200ms' });
  });
});
