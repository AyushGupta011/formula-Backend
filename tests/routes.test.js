import { jest } from '@jest/globals';
import { randomUUID } from 'crypto';
import app from '../src/app.js';
import formulaRepository from '../src/repositories/formula.repository.js';
import runlogRepository from '../src/repositories/runlog.repository.js';
import pool from '../src/db/pool.js';

let server;
let baseUrl;

beforeAll((done) => {
  server = app.listen(0, () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});

afterAll(async () => {
  if (server) await new Promise((res) => server.close(res));
  if (pool) await pool.end();
});

const req = async (path, options = {}) => {
  const { body, headers = {}, ...rest } = options;
  const init = {
    ...rest,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  };
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, text, json };
};

describe('Formula Routes & Endpoints Comprehensive Tests', () => {
  const sampleUuid1 = randomUUID();
  const sampleUuid2 = randomUUID();
  const sampleUuid3 = randomUUID();

  beforeEach(() => {
    jest.restoreAllMocks();
    // Default no-op runlog save
    jest.spyOn(runlogRepository, 'saveMany').mockImplementation(async () => {});
  });

  describe('Global middleware & Error Handling', () => {
    test('404 on undefined route', async () => {
      const res = await req('/non-existent-route');
      expect(res.status).toBe(404);
      expect(res.json.error.code).toBe('NOT_FOUND');
      expect(res.json.error.message).toMatch(/No route GET/);
    });

    test('400 on malformed JSON payload', async () => {
      const res = await req('/formulas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"invalid": json',
      });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('INVALID_JSON');
      expect(res.json.error.message).toBe('Request body is not valid JSON');
    });
  });

  describe('GET /formulas', () => {
    test('successfully returns all current formulas', async () => {
      const mockList = [
        { id: 1, uuid: sampleUuid1, name: 'commission', version: 1, status: 'ACTIVE' },
        { id: 2, uuid: sampleUuid2, name: 'tax', version: 2, status: 'ACTIVE' },
      ];
      jest.spyOn(formulaRepository, 'findAllCurrent').mockResolvedValue(mockList);

      const res = await req('/formulas');
      expect(res.status).toBe(200);
      expect(res.json).toEqual({ data: mockList });
    });
  });

  describe('POST /formulas (Create & Update)', () => {
    test('fails validation when name or formula_text missing on creation', async () => {
      const res = await req('/formulas', {
        method: 'POST',
        body: { name: 'tax' }, // missing formula_text
      });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('VALIDATION_ERROR');
      expect(res.json.error.message).toMatch(/name and formula_text are required/);
    });

    test('fails validation when formula name contains illegal characters', async () => {
      jest.spyOn(formulaRepository, 'findActiveCurrent').mockResolvedValue([]);
      const res = await req('/formulas', {
        method: 'POST',
        body: { name: '123_invalid', formula_text: 'return 10' },
      });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('VALIDATION_ERROR');
      expect(res.json.error.message).toMatch(/not a valid formula name/);
    });

    test('fails validation when formula uses bracket access for EXTERNAL_VAR', async () => {
      jest.spyOn(formulaRepository, 'findActiveCurrent').mockResolvedValue([]);
      const res = await req('/formulas', {
        method: 'POST',
        body: { name: 'tax', formula_text: "return EXTERNAL_VAR['amount'] * 0.1" },
      });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('VALIDATION_ERROR');
      expect(res.json.error.message).toMatch(/bracket access is not supported/);
    });

    test('fails validation when formula lacks return statement', async () => {
      jest.spyOn(formulaRepository, 'findActiveCurrent').mockResolvedValue([]);
      const res = await req('/formulas', {
        method: 'POST',
        body: { name: 'tax', formula_text: 'const x = EXTERNAL_VAR.a + 1;' },
      });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('VALIDATION_ERROR');
      expect(res.json.error.message).toMatch(/Formula must end with a return statement/);
    });

    test('fails when active formula with same name already exists', async () => {
      jest.spyOn(formulaRepository, 'findActiveCurrent').mockResolvedValue([
        { uuid: sampleUuid1, name: 'tax', version: 1, formula_text: 'return 10' },
      ]);
      const res = await req('/formulas', {
        method: 'POST',
        body: { name: 'tax', formula_text: 'return 20' },
      });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('NAME_TAKEN');
    });

    test('fails when formula introduces a dependency cycle', async () => {
      jest.spyOn(formulaRepository, 'findActiveCurrent').mockResolvedValue([
        { uuid: sampleUuid1, name: 'a', version: 1, formula_text: 'return EXTERNAL_VAR.b + 1' },
      ]);
      const res = await req('/formulas', {
        method: 'POST',
        body: { name: 'b', formula_text: 'return EXTERNAL_VAR.a + 1' },
      });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('DEPENDENCY_CYCLE');
      expect(res.json.error.message).toMatch(/Dependency loop/);
    });

    test('successfully creates a valid new formula (201 Created)', async () => {
      jest.spyOn(formulaRepository, 'findActiveCurrent').mockResolvedValue([]);
      const savedFormula = {
        id: 10,
        uuid: sampleUuid1,
        name: 'commission',
        version: 1,
        formula_text: 'return EXTERNAL_VAR.amount * 0.1',
        status: 'ACTIVE',
        created_by: 'admin',
        changed_by: 'admin',
      };
      jest.spyOn(formulaRepository, 'save').mockResolvedValue([savedFormula]);

      const res = await req('/formulas', {
        method: 'POST',
        body: { name: 'commission', formula_text: 'return EXTERNAL_VAR.amount * 0.1' },
      });
      expect(res.status).toBe(201);
      expect(res.json.data).toEqual(savedFormula);
    });

    test('fails update when base_version is missing', async () => {
      const res = await req('/formulas', {
        method: 'POST',
        body: { uuid: sampleUuid1, formula_text: 'return EXTERNAL_VAR.amount * 0.2' },
      });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('VALIDATION_ERROR');
      expect(res.json.error.message).toMatch(/base_version .* is required when changing a formula/);
    });

    test('fails update when formula not found', async () => {
      jest.spyOn(formulaRepository, 'findCurrentByUuid').mockResolvedValue(null);
      const res = await req('/formulas', {
        method: 'POST',
        body: { uuid: sampleUuid1, base_version: 1, formula_text: 'return 10' },
      });
      expect(res.status).toBe(404);
      expect(res.json.error.code).toBe('NOT_FOUND');
    });

    test('fails update with 409 Conflict when base_version does not match current version', async () => {
      jest.spyOn(formulaRepository, 'findCurrentByUuid').mockResolvedValue({
        uuid: sampleUuid1,
        version: 2,
        name: 'tax',
        formula_text: 'return 10',
        status: 'ACTIVE',
      });
      const res = await req('/formulas', {
        method: 'POST',
        body: { uuid: sampleUuid1, base_version: 1, formula_text: 'return 15' },
      });
      expect(res.status).toBe(409);
      expect(res.json.error.code).toBe('VERSION_CONFLICT');
    });

    test('fails update when deactivating/renaming breaks active dependents without force', async () => {
      const current = { uuid: sampleUuid1, version: 1, name: 'commission', formula_text: 'return 10', status: 'ACTIVE' };
      const dependent = { uuid: sampleUuid2, version: 1, name: 'tax', formula_text: 'return EXTERNAL_VAR.commission * 0.1', status: 'ACTIVE' };

      jest.spyOn(formulaRepository, 'findCurrentByUuid').mockResolvedValue(current);
      jest.spyOn(formulaRepository, 'findActiveCurrent').mockResolvedValue([current, dependent]);

      const res = await req('/formulas', {
        method: 'POST',
        body: { uuid: sampleUuid1, base_version: 1, status: 'INACTIVE', force: false },
      });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('BREAKS_DEPENDENTS');
      expect(res.json.error.message).toMatch(/Cannot deactivate 'commission'/);
    });

    test('successfully updates formula when force is true even if dependents exist (200 OK)', async () => {
      const current = { uuid: sampleUuid1, version: 1, name: 'commission', formula_text: 'return 10', status: 'ACTIVE' };
      const dependent = { uuid: sampleUuid2, version: 1, name: 'tax', formula_text: 'return EXTERNAL_VAR.commission * 0.1', status: 'ACTIVE' };

      jest.spyOn(formulaRepository, 'findCurrentByUuid').mockResolvedValue(current);
      jest.spyOn(formulaRepository, 'findActiveCurrent').mockResolvedValue([current, dependent]);
      const updatedFormula = { ...current, version: 2, status: 'INACTIVE' };
      jest.spyOn(formulaRepository, 'save').mockResolvedValue([updatedFormula]);

      const res = await req('/formulas', {
        method: 'POST',
        body: { uuid: sampleUuid1, base_version: 1, status: 'INACTIVE', force: true },
      });
      expect(res.status).toBe(200);
      expect(res.json.data).toEqual(updatedFormula);
    });
  });

  describe('POST /formulas/:uuid/deactivate', () => {
    test('fails when uuid is not a valid UUID format', async () => {
      const res = await req('/formulas/not-a-uuid/deactivate', { method: 'POST', body: {} });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('VALIDATION_ERROR');
      expect(res.json.error.message).toMatch(/must be a UUID/);
    });

    test('successfully deactivates a formula', async () => {
      const current = { uuid: sampleUuid1, version: 1, name: 'tax', formula_text: 'return 10', status: 'ACTIVE' };
      jest.spyOn(formulaRepository, 'findCurrentByUuid').mockResolvedValue(current);
      jest.spyOn(formulaRepository, 'findActiveCurrent').mockResolvedValue([current]);
      const deactivated = { ...current, version: 2, status: 'INACTIVE', note: 'Deactivated' };
      jest.spyOn(formulaRepository, 'save').mockResolvedValue([deactivated]);

      const res = await req(`/formulas/${sampleUuid1}/deactivate`, {
        method: 'POST',
        body: { changed_by: 'tester' },
      });
      expect(res.status).toBe(200);
      expect(res.json.data).toEqual(deactivated);
    });
  });

  describe('POST /formulas/:uuid/rollback', () => {
    test('fails when version param is missing from body', async () => {
      const res = await req(`/formulas/${sampleUuid1}/rollback`, {
        method: 'POST',
        body: {},
      });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('VALIDATION_ERROR');
    });

    test('fails 404 when target version does not exist', async () => {
      jest.spyOn(formulaRepository, 'findVersion').mockResolvedValue(null);
      const res = await req(`/formulas/${sampleUuid1}/rollback`, {
        method: 'POST',
        body: { version: 1 },
      });
      expect(res.status).toBe(404);
      expect(res.json.error.code).toBe('NOT_FOUND');
      expect(res.json.error.message).toMatch(/has no version 1/);
    });

    test('successfully rolls back to an earlier version (201 Created)', async () => {
      const targetVersion = { uuid: sampleUuid1, version: 1, name: 'tax', formula_text: 'return 10', status: 'ACTIVE' };
      const current = { uuid: sampleUuid1, version: 2, name: 'tax', formula_text: 'return 20', status: 'ACTIVE' };
      jest.spyOn(formulaRepository, 'findVersion').mockResolvedValue(targetVersion);
      jest.spyOn(formulaRepository, 'findCurrentByUuid').mockResolvedValue(current);
      jest.spyOn(formulaRepository, 'findActiveCurrent').mockResolvedValue([current]);
      const rolledBack = { ...targetVersion, version: 3, note: 'Rolled back to version 1' };
      jest.spyOn(formulaRepository, 'save').mockResolvedValue([rolledBack]);

      const res = await req(`/formulas/${sampleUuid1}/rollback`, {
        method: 'POST',
        body: { version: 1, changed_by: 'tester' },
      });
      expect(res.status).toBe(201);
      expect(res.json.data).toEqual(rolledBack);
    });
  });

  describe('GET /formulas/:uuid/history', () => {
    test('fails 404 when no history exists for uuid', async () => {
      jest.spyOn(formulaRepository, 'findHistory').mockResolvedValue([]);
      const res = await req(`/formulas/${sampleUuid1}/history`);
      expect(res.status).toBe(404);
      expect(res.json.error.code).toBe('NOT_FOUND');
    });

    test('returns all versions in chronological order', async () => {
      const history = [
        { id: 1, uuid: sampleUuid1, version: 1, formula_text: 'return 10' },
        { id: 5, uuid: sampleUuid1, version: 2, formula_text: 'return 20' },
      ];
      jest.spyOn(formulaRepository, 'findHistory').mockResolvedValue(history);
      const res = await req(`/formulas/${sampleUuid1}/history`);
      expect(res.status).toBe(200);
      expect(res.json.data).toEqual(history);
    });
  });

  describe('GET /formulas/:uuid/impact', () => {
    test('fails 404 when formula uuid does not exist', async () => {
      jest.spyOn(formulaRepository, 'findCurrentByUuid').mockResolvedValue(null);
      const res = await req(`/formulas/${sampleUuid1}/impact`);
      expect(res.status).toBe(404);
      expect(res.json.error.code).toBe('NOT_FOUND');
    });

    test('returns direct and indirect dependent formulas', async () => {
      const c = { uuid: sampleUuid1, name: 'commission', formula_text: 'return EXTERNAL_VAR.amount * 0.1', status: 'ACTIVE' };
      const t = { uuid: sampleUuid2, name: 'tax', formula_text: 'return EXTERNAL_VAR.commission * 0.18', status: 'ACTIVE' };
      const tot = { uuid: sampleUuid3, name: 'total', formula_text: 'return EXTERNAL_VAR.tax + EXTERNAL_VAR.commission', status: 'ACTIVE' };

      jest.spyOn(formulaRepository, 'findCurrentByUuid').mockResolvedValue(c);
      jest.spyOn(formulaRepository, 'findActiveCurrent').mockResolvedValue([c, t, tot]);

      const res = await req(`/formulas/${sampleUuid1}/impact`);
      expect(res.status).toBe(200);
      expect(res.json.data.formula).toEqual({ uuid: sampleUuid1, name: 'commission' });
      expect(res.json.data.impacted).toEqual([
        { uuid: sampleUuid2, name: 'tax', dependency: 'DIRECT' },
        { uuid: sampleUuid3, name: 'total', dependency: 'DIRECT' },
      ]);
    });
  });

  describe('POST /formulas/preview', () => {
    test('fails validation when record body is missing', async () => {
      const res = await req('/formulas/preview', { method: 'POST', body: {} });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('VALIDATION_ERROR');
    });

    test('fails validation when required input fields are missing in record', async () => {
      const active = [
        { uuid: sampleUuid1, name: 'tax', version: 1, formula_text: 'return EXTERNAL_VAR.amount * 0.1', status: 'ACTIVE' },
      ];
      jest.spyOn(formulaRepository, 'findActiveCurrent').mockResolvedValue(active);

      const res = await req('/formulas/preview', {
        method: 'POST',
        body: { record: { other_field: 123 } }, // missing 'amount'
      });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('MISSING_INPUTS');
    });

    test('successfully previews single record evaluation with execution order and results', async () => {
      const active = [
        { uuid: sampleUuid1, name: 'commission', version: 1, formula_text: 'return EXTERNAL_VAR.amount * EXTERNAL_VAR.rate / 100', status: 'ACTIVE' },
        { uuid: sampleUuid2, name: 'tax', version: 1, formula_text: 'return EXTERNAL_VAR.commission * 0.18', status: 'ACTIVE' },
        { uuid: sampleUuid3, name: 'total', version: 1, formula_text: 'return EXTERNAL_VAR.commission + EXTERNAL_VAR.tax', status: 'ACTIVE' },
      ];
      jest.spyOn(formulaRepository, 'findActiveCurrent').mockResolvedValue(active);

      const res = await req('/formulas/preview', {
        method: 'POST',
        body: { record: { amount: 2000, rate: 10 } },
      });
      expect(res.status).toBe(200);
      expect(res.json.data.execution_order).toEqual([['commission'], ['tax'], ['total']]);
      expect(res.json.data.final_record).toEqual({
        amount: 2000,
        rate: 10,
        commission: 200,
        tax: 36,
        total: 236,
      });
      expect(res.json.data.results).toHaveLength(3);
      expect(res.json.data.results[0].result).toBe(200);
      expect(res.json.data.results[1].result).toBe(36);
      expect(res.json.data.results[2].result).toBe(236);
    });

    test('previews subset of formulas using formula_uuids', async () => {
      const active = [
        { uuid: sampleUuid1, name: 'commission', version: 1, formula_text: 'return EXTERNAL_VAR.amount * 0.1', status: 'ACTIVE' },
        { uuid: sampleUuid2, name: 'tax', version: 1, formula_text: 'return EXTERNAL_VAR.commission * 0.18', status: 'ACTIVE' },
        { uuid: sampleUuid3, name: 'bonus', version: 1, formula_text: 'return EXTERNAL_VAR.amount * 0.05', status: 'ACTIVE' },
      ];
      jest.spyOn(formulaRepository, 'findActiveCurrent').mockResolvedValue(active);

      const res = await req('/formulas/preview', {
        method: 'POST',
        body: {
          record: { amount: 1000 },
          formula_uuids: [sampleUuid2], // tax depends on commission; closure should include commission
        },
      });
      expect(res.status).toBe(200);
      expect(res.json.data.final_record).toEqual({
        amount: 1000,
        commission: 100,
        tax: 18,
      });
      // 'bonus' should not be executed
      expect(res.json.data.results.map((r) => r.name)).toEqual(['commission', 'tax']);
    });
  });

  describe('POST /formulas/preview/bulk', () => {
    test('fails validation when records is empty array', async () => {
      const res = await req('/formulas/preview/bulk', {
        method: 'POST',
        body: { records: [] },
      });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('VALIDATION_ERROR');
    });

    test('fails validation when records array exceeds maximum (500)', async () => {
      const huge = new Array(501).fill({ amount: 100 });
      const res = await req('/formulas/preview/bulk', {
        method: 'POST',
        body: { records: huge },
      });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('VALIDATION_ERROR');
      expect(res.json.error.message).toMatch(/at most 500 records/);
    });

    test('successfully evaluates bulk records in fast vm mode', async () => {
      const active = [
        { uuid: sampleUuid1, name: 'commission', version: 1, formula_text: 'return EXTERNAL_VAR.amount * 0.1', status: 'ACTIVE' },
        { uuid: sampleUuid2, name: 'tax', version: 1, formula_text: 'return EXTERNAL_VAR.commission * 0.18', status: 'ACTIVE' },
      ];
      jest.spyOn(formulaRepository, 'findActiveCurrent').mockResolvedValue(active);

      const records = [
        { amount: 1000 },
        { amount: 2000 },
        { amount: 3000 },
      ];

      const res = await req('/formulas/preview/bulk', {
        method: 'POST',
        body: { records, fast: true },
      });
      expect(res.status).toBe(200);
      expect(res.json.data.summary.records).toBe(3);
      expect(res.json.data.summary.records_with_failures).toBe(0);
      expect(res.json.data.records).toHaveLength(3);
      expect(res.json.data.records[0].final_record).toEqual({ amount: 1000, commission: 100, tax: 18 });
      expect(res.json.data.records[1].final_record).toEqual({ amount: 2000, commission: 200, tax: 36 });
      expect(res.json.data.records[2].final_record).toEqual({ amount: 3000, commission: 300, tax: 54 });
    });
  });
});
