import { randomUUID } from 'crypto';
import repo from '../repositories/formula.repository.js';
import runlog from '../repositories/runlog.repository.js';
import config from '../config.js';
import { buildPlan, findMissingInputs, closure } from './dependency.service.js';
import { evaluatePlan } from './evaluator.service.js';
import { ValidationError } from '../utils/errors.js';
import { mapLimit } from '../utils/limiter.js';


async function loadPlan({ formula_uuids: uuids, as_of: asOf }) {
  const active = asOf ? await repo.findActiveAsOf(new Date(asOf)) : await repo.findActiveCurrent();
  let selected = active;
  if (uuids && uuids.length) {
    const unknown = uuids.filter((u) => !active.some((f) => f.uuid === u));
    if (unknown.length) throw new ValidationError(`Not active${asOf ? ' at that time' : ''}: ${unknown.join(', ')}`, { unknown }, 'UNKNOWN_FORMULA');
    const names = closure(active.filter((f) => uuids.includes(f.uuid)).map((f) => f.name), buildPlan(active).deps);
    selected = active.filter((f) => names.has(f.name));
  }
  return buildPlan(selected);
}

function assertNoMissing(plan, records) {
  const problems = [];
  records.forEach((record, index) => {
    const missing = findMissingInputs(plan, record);
    if (missing.length) problems.push({ record_index: index, missing });
  });
  if (problems.length) {
    throw new ValidationError('Missing inputs: some formulas read names that are neither formulas nor fields of the record. Nothing was run.', { problems }, 'MISSING_INPUTS');
  }
}

const calcText = (c) => (c ? [...c.inputs, c.formula, ...c.steps, c.result].filter(Boolean).join('\n') : null);

const toLogRows = (runUuid, outcomes) =>
  outcomes.map((o) => ({
    run_uuid: runUuid, formula_uuid: o.uuid, formula_name: o.name, version_used: o.version,
    input_json: JSON.stringify(o.inputs), result: o.result, calculation: calcText(o.calculation),
    error: o.error, status: o.status,
  }));

const present = (o, { explain = true } = {}) => ({
  name: o.name, uuid: o.uuid, version: o.version, level: o.level, status: o.status,
  result: o.result, error: o.error, ...(explain ? { calculation: o.calculation } : {}),
});

export async function preview({ record, formula_uuids, as_of }) {
  const plan = await loadPlan({ formula_uuids, as_of });
  assertNoMissing(plan, [record]);

  const runUuid = randomUUID();
  const { results, finalRecord } = await evaluatePlan(plan, record);
  await runlog.saveMany(toLogRows(runUuid, results)); 

  return { run_uuid: runUuid, as_of: as_of || null, execution_order: plan.levels, results: results.map((o) => present(o)), final_record: finalRecord };
}

export async function previewBulk({ records, formula_uuids, as_of, fast = true, explain = false }) {
  const started = Date.now();
  const plan = await loadPlan({ formula_uuids, as_of });
  assertNoMissing(plan, records);

  const allLogRows = [];
  const out = await mapLimit(records, config.recordConcurrency, async (record, index) => {
    const { results, finalRecord } = await evaluatePlan(plan, record, { fast });
    const runUuid = randomUUID();
    allLogRows.push(...toLogRows(runUuid, results));
    return { index, run_uuid: runUuid, results: results.map((o) => present(o, { explain })), final_record: finalRecord, ok: results.every((o) => o.status === 'SUCCESS') };
  });
  await runlog.saveMany(allLogRows);

  const flat = out.flatMap((r) => r.results);
  const totalMs = Date.now() - started;
  return {
    summary: {
      records: records.length,
      total_ms: totalMs,
      avg_ms_per_record: Number((totalMs / records.length).toFixed(2)),
      records_with_failures: out.filter((r) => !r.ok).length,
      failed_formulas: flat.filter((r) => r.status === 'FAILED').length,
      skipped_formulas: flat.filter((r) => r.status === 'SKIPPED').length,
      engine: fast ? 'vm (in-process)' : 'formula-interpreter (child process per formula)',
    },
    execution_order: plan.levels,
    records: out,
  };
}

export default { preview, previewBulk };
