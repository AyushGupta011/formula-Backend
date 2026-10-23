import vm from 'vm';
import { interpretor } from 'formula-interpreter';
import config from '../config.js';
import { round2 } from '../utils/rounding.js';
import { createLimiter } from '../utils/limiter.js';

const limitProcesses = createLimiter(config.maxProcesses);

const toLibraryText = (text) => text.replace(/EXTERNAL_VAR\.(?!CODE\b)/g, 'EXTERNAL_VAR.CODE.');

async function runWithLibrary(text, scope, timeoutMs) {
  return limitProcesses(() =>
    interpretor(toLibraryText(text), [], { CODE: { ...scope } }, { timeout: timeoutMs, memoryInMB: config.memoryInMB })
  );
}

async function runWithVm(text, scope, timeoutMs) {
  try {
    const script = new vm.Script(`(function (EXTERNAL_VAR) {\n${text}\n})(EXTERNAL_VAR)`);
    const data = script.runInNewContext({ EXTERNAL_VAR: { ...scope } }, { timeout: timeoutMs });
    return { status: 1, data };
  } catch (err) {
    return { status: 0, error: err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' ? 'Timed out' : err.message };
  }
}

export function parseCalculation(calc) {
  if (!calc) return null;
  const lines = calc.split('\n').map((l) => l.replace(/EXTERNAL_VAR\.CODE\./g, 'EXTERNAL_VAR.'));
  const i = lines.findIndex((l) => l.startsWith('return '));
  if (i === -1) return { inputs: [], formula: null, steps: lines, result: null };
  return { inputs: lines.slice(0, i), formula: lines[i], steps: lines.slice(i + 1, -1), result: lines[lines.length - 1] };
}

export async function runFormula({ text, scope, timeoutMs = config.formulaTimeoutMs, fast = false }) {
  let raw;
  try {
    raw = fast ? await runWithVm(text, scope, timeoutMs) : await runWithLibrary(text, scope, timeoutMs);
  } catch (err) {
    raw = { status: 0, error: err.message };
  }

  const fail = (error) => ({ status: 'FAILED', result: null, error, calculation: null });

  if (!raw || raw.status !== 1) {
    const msg = raw && raw.error === 'Timed out' ? `Timed out after ${timeoutMs}ms` : (raw && raw.error) || 'Unknown error';
    return fail(raw && raw.highlight ? `${msg} (${raw.highlight})` : msg);
  }
  if (typeof raw.data !== 'number' || !Number.isFinite(raw.data)) {
    return fail('Formula did not produce a valid number (got null, NaN, Infinity or a non-number)');
  }

  const rounded = round2(raw.data);
  const calculation = parseCalculation(raw.calculation);
  if (calculation && rounded !== raw.data) calculation.result = `${calculation.result} → rounded to 2 decimals: ${rounded}`;
  return { status: 'SUCCESS', result: rounded, error: null, calculation };
}

const pick = (scope, names) => Object.fromEntries(names.filter((n) => n in scope).map((n) => [n, scope[n]]));


export async function evaluatePlan(plan, record, { timeoutMs, fast = false } = {}) {
  const scope = { ...record };
  const outcomes = new Map();
  const ordered = [];

  for (const [levelIndex, level] of plan.levels.entries()) {
    const done = await Promise.all(
      level.map(async (name) => {
        const f = plan.byName.get(name);
        const inputs = pick(scope, plan.reads.get(name));
        const base = { uuid: f.uuid, name, version: f.version, level: levelIndex, inputs };

        const blockers = [...plan.deps.get(name)].filter((d) => outcomes.get(d).status !== 'SUCCESS');
        if (blockers.length) {
          const why = blockers.map((b) => `'${b}' (${outcomes.get(b).status})`).join(', ');
          return { ...base, status: 'SKIPPED', result: null, error: `Skipped because dependency did not succeed: ${why}`, calculation: null };
        }
        const out = await runFormula({ text: f.formula_text, scope: inputs, timeoutMs, fast });
        return { ...base, ...out };
      })
    );
    for (const o of done) {
      outcomes.set(o.name, o);
      ordered.push(o);
      if (o.status === 'SUCCESS') scope[o.name] = o.result; 
    }
  }

  const finalRecord = { ...record };
  ordered.forEach((o) => { if (o.status === 'SUCCESS') finalRecord[o.name] = o.result; });
  return { results: ordered, finalRecord };
}

export default { runFormula, evaluatePlan, parseCalculation };
