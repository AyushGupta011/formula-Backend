import repo from '../repositories/formula.repository.js';
import { buildPlan, extractReads, findImpacted } from './dependency.service.js';
import { runFormula } from './evaluator.service.js';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors.js';

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const RESERVED = new Set(['CODE', 'EXTERNAL_VAR']);

function assertStatic(name, text) {
  if (!NAME_RE.test(name) || RESERVED.has(name)) {
    throw new ValidationError(`'${name}' is not a valid formula name (letters, digits, underscore; cannot start with a digit)`);
  }
  if (!/\breturn\b/.test(text)) throw new ValidationError('Formula must end with a return statement');
  if (/EXTERNAL_VAR\s*\[/.test(text)) throw new ValidationError("Use EXTERNAL_VAR.<name>; bracket access is not supported (dependencies could not be detected)");
}

async function assertRunsOnSample(text, sample = {}) {
  const scope = Object.fromEntries(extractReads(text).map((n) => [n, sample[n] ?? 1]));
  const out = await runFormula({ text, scope });
  if (out.status !== 'SUCCESS') throw new ValidationError(`Formula failed on sample data: ${out.error}`, { sample: scope }, 'FORMULA_INVALID');
}



export async function saveFormula(input) {
  const { uuid, base_version: baseVersion, force = false, changed_by: changedBy, sample_data: sample, note = null } = input;

  let current = null;
  if (uuid) {
    current = await repo.findCurrentByUuid(uuid);
    if (!current) throw new NotFoundError(`Formula ${uuid} not found`);
 
    if (baseVersion !== undefined && baseVersion !== current.version) throw new ConflictError(current);
  }

  const next = {
    name: input.name ?? current?.name,
    formula_text: input.formula_text ?? current?.formula_text,
    status: input.status ?? current?.status ?? 'ACTIVE',
  };
  assertStatic(next.name, next.formula_text);

  const active = await repo.findActiveCurrent();
  const others = active.filter((f) => f.uuid !== uuid);

  if (next.status === 'ACTIVE') {
    if (others.some((f) => f.name === next.name)) {
      throw new ValidationError(`An active formula named '${next.name}' already exists`, undefined, 'NAME_TAKEN');
    }
    buildPlan([...others, { uuid: uuid || 'new', version: 0, ...next }]);
    await assertRunsOnSample(next.formula_text, sample);
  }


  const leavesName = current && current.status === 'ACTIVE' && (next.status !== 'ACTIVE' || next.name !== current.name);
  if (leavesName && !force) {
    const impacted = findImpacted(current.name, others);
    if (impacted.length) {
      throw new ValidationError(
        `Cannot ${next.status !== 'ACTIVE' ? 'deactivate' : 'rename'} '${current.name}': active formulas depend on it (${impacted.map((i) => i.name).join(', ')}). Send force=true to override.`,
        { impacted },
        'BREAKS_DEPENDENTS'
      );
    }
  }

  const [saved] = await repo.save(
    { ...(uuid ? { uuid } : { created_by: changedBy }), ...next, changed_by: changedBy, note },
    { expectedVersion: current?.version }
  );
  return saved;
}

export const deactivate = (uuid, body) => saveFormula({ uuid, status: 'INACTIVE', changed_by: body.changed_by, base_version: body.base_version, force: body.force, note: 'Deactivated' });

export async function rollback(uuid, body) {
  const target = await repo.findVersion(uuid, body.version);
  if (!target) throw new NotFoundError(`Formula ${uuid} has no version ${body.version}`);
  return saveFormula({
    uuid, name: target.name, formula_text: target.formula_text, status: target.status,
    changed_by: body.changed_by, base_version: body.base_version, force: body.force, note: `Rolled back to version ${body.version}`,
  });
}

export async function history(uuid) {
  const rows = await repo.findHistory(uuid);
  if (!rows.length) throw new NotFoundError(`Formula ${uuid} not found`);
  return rows;
}

export async function impact(uuid) {
  const current = await repo.findCurrentByUuid(uuid);
  if (!current) throw new NotFoundError(`Formula ${uuid} not found`);
  const active = await repo.findActiveCurrent();
  return { formula: { uuid, name: current.name }, impacted: findImpacted(current.name, active) };
}

export const list = () => repo.findAllCurrent();

export default { saveFormula, deactivate, rollback, history, impact, list };
