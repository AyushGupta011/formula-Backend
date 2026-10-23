
import { CycleError } from '../utils/errors.js';

const READ_RE = /EXTERNAL_VAR\.([A-Za-z_][A-Za-z0-9_]*)/g;

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function extractReads(text) {
  const names = new Set();
  for (const m of stripComments(text).matchAll(READ_RE)) names.add(m[1]);
  return [...names];
}

export function findCycle(deps) {
  const GREY = 1, BLACK = 2;
  const color = new Map();
  const stack = [];

  const visit = (node) => {
    color.set(node, GREY);
    stack.push(node);
    for (const next of [...deps.get(node)].sort()) {
      if (color.get(next) === GREY) {
        const loop = stack.slice(stack.indexOf(next));
        const start = loop.indexOf([...loop].sort()[0]);
        const rotated = [...loop.slice(start), ...loop.slice(0, start)];
        return [...rotated, rotated[0]];
      }
      if (!color.has(next)) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(node, BLACK);
    return null;
  };

  for (const node of [...deps.keys()].sort()) {
    if (!color.has(node)) {
      const found = visit(node);
      if (found) return found;
    }
  }
  return null;
}
export function computeLevels(deps) {
  const remaining = new Map([...deps].map(([n, s]) => [n, new Set(s)]));
  const levels = [];
  while (remaining.size) {
    const ready = [...remaining].filter(([, s]) => s.size === 0).map(([n]) => n).sort();
    if (!ready.length) throw new Error('Cycle present: call findCycle first');
    levels.push(ready);
    ready.forEach((n) => remaining.delete(n));
    remaining.forEach((s) => ready.forEach((n) => s.delete(n)));
  }
  return levels;
}


export function buildPlan(formulas) {
  const byName = new Map(formulas.map((f) => [f.name, f]));
  const reads = new Map();
  const deps = new Map();
  for (const f of formulas) {
    const r = extractReads(f.formula_text);
    reads.set(f.name, r);
    deps.set(f.name, new Set(r.filter((n) => byName.has(n))));
  }
  const cycle = findCycle(deps);
  if (cycle) throw new CycleError(cycle);
  return { byName, reads, deps, levels: computeLevels(deps) };
}

export function findMissingInputs(plan, record) {
  const missing = [];
  for (const [name, r] of plan.reads) {
    const absent = r.filter((n) => !plan.byName.has(n) && !Object.prototype.hasOwnProperty.call(record, n));
    if (absent.length) missing.push({ formula: name, missing: absent });
  }
  return missing;
}


export function closure(names, deps) {
  const seen = new Set();
  const walk = (n) => {
    if (seen.has(n)) return;
    seen.add(n);
    (deps.get(n) || []).forEach(walk);
  };
  names.forEach(walk);
  return seen;
}

export function findImpacted(name, activeFormulas) {
  const reads = new Map(activeFormulas.map((f) => [f.name, extractReads(f.formula_text)]));
  const impacted = new Map();
  let frontier = [name];
  let depth = 0;
  while (frontier.length) {
    depth++;
    const nextFrontier = [];
    for (const target of frontier) {
      for (const [fname, r] of reads) {
        if (fname !== name && !impacted.has(fname) && r.includes(target)) {
          impacted.set(fname, depth === 1 ? 'DIRECT' : 'INDIRECT');
          nextFrontier.push(fname);
        }
      }
    }
    frontier = nextFrontier;
  }
  return activeFormulas
    .filter((f) => impacted.has(f.name))
    .map((f) => ({ uuid: f.uuid, name: f.name, dependency: impacted.get(f.name) }));
}

export default { extractReads, findCycle, computeLevels, buildPlan, findMissingInputs, closure, findImpacted };
