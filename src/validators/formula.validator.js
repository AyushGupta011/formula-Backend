import { z } from 'zod';
import { ValidationError } from '../utils/errors.js';
import config from '../config.js';

const uuid = z.string().uuid('must be a UUID');
const asOf = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO date-time, e.g. 2026-10-21T10:00:00Z');
const record = z.record(z.string(), z.any());
const user = z.string().min(1).max(100).default('admin');

export const saveFormula = z.object({
  uuid: uuid.optional(),
  name: z.string().min(1).max(64).optional(),
  formula_text: z.string().min(1).max(5000).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  note: z.string().max(255).optional(),
  changed_by: user,
  base_version: z.number().int().min(1).optional(),
  force: z.boolean().default(false),
  sample_data: record.optional(),
}).superRefine((b, ctx) => {
  if (!b.uuid && (!b.name || !b.formula_text)) ctx.addIssue({ code: 'custom', message: 'name and formula_text are required when creating a formula' });
  if (b.uuid && b.base_version === undefined) ctx.addIssue({ code: 'custom', path: ['base_version'], message: 'base_version (the version you last saw) is required when changing a formula' });
});

export const deactivate = z.object({ changed_by: user, base_version: z.number().int().min(1).optional(), force: z.boolean().default(false) });
export const rollback = z.object({ version: z.number().int().min(1), changed_by: user, base_version: z.number().int().min(1).optional(), force: z.boolean().default(false) });
export const preview = z.object({ record, formula_uuids: z.array(uuid).optional(), as_of: asOf.optional() });
export const previewBulk = z.object({
  records: z.array(record).min(1).max(config.maxBulkRecords, `at most ${config.maxBulkRecords} records`),
  formula_uuids: z.array(uuid).optional(), as_of: asOf.optional(),
  fast: z.boolean().default(true), explain: z.boolean().default(false),
});
export const uuidParam = z.object({ uuid });

export const schemas = { saveFormula, deactivate, rollback, preview, previewBulk, uuidParam };

export const validate = (schema, source = 'body') => (req, _res, next) => {
  const parsed = schema.safeParse(req[source]);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({ field: i.path.join('.') || source, message: i.message }));
    return next(new ValidationError(`Invalid request ${source}: ${details.map((d) => `${d.field}: ${d.message}`).join('; ')}`, details));
  }
  req[source] = parsed.data;
  next();
};

export default { validate, schemas };
