import saveRecord from '../src/db/saveRecord.js';
import { ConflictError, NotFoundError } from '../src/utils/errors.js';


function fakeConn(current, insertImpl) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT')) return [current ? [current] : []];
      if (insertImpl) return insertImpl(sql, params);
      return [{ insertId: 100 }];
    },
  };
}

describe('saveRecord', () => {
  test('create: new UUID, version 1, first_created_at set, one INSERT', async () => {
    const conn = fakeConn(null);
    const [row] = await saveRecord('formulas', { name: 'tax', formula_text: 'return 1', created_by: 'a' }, { conn });
    expect(row.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(row).toMatchObject({ version: 1, id: 100 });
    expect(row.first_created_at).toBeInstanceOf(Date);
    expect(conn.calls).toHaveLength(1); // no SELECT needed
    expect(conn.calls[0].sql).toBe('INSERT INTO ?? (??) VALUES ?');
  });

  test('change: same UUID, version + 1, keeps creation details, unsent fields keep old value', async () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const current = { id: 7, uuid: 'U1', version: 1, name: 'tax', formula_text: 'old', status: 'ACTIVE', created_by: 'alice', first_created_at: created, inserted_at: new Date() };
    const conn = fakeConn(current);
    const [row] = await saveRecord('formulas', { uuid: 'U1', formula_text: 'new' }, { conn });
    expect(row).toMatchObject({ uuid: 'U1', version: 2, name: 'tax', formula_text: 'new', status: 'ACTIVE', created_by: 'alice', first_created_at: created, id: 100 });
    expect(row).not.toHaveProperty('inserted_at'); // DB fills it
    expect(conn.calls.map((c) => c.sql.split(' ')[0])).toEqual(['SELECT', 'INSERT']);
  });

  test('array: many rows inserted in ONE query, ids returned', async () => {
    const conn = fakeConn(null);
    const rows = await saveRecord('formula_runs', [{ a: 1 }, { a: 2 }, { a: 3 }], { conn, versionColumn: null, firstCreatedColumn: null });
    expect(conn.calls).toHaveLength(1);
    expect(conn.calls[0].params[2]).toHaveLength(3);
    expect(rows.map((r) => r.id)).toEqual([100, 101, 102]);
  });

  test('values are bound parameters, never concatenated into SQL', async () => {
    const conn = fakeConn(null);
    await saveRecord('formulas', { name: "x'); DROP TABLE formulas;--", formula_text: 'return 1' }, { conn });
    expect(conn.calls[0].sql).not.toMatch(/DROP/);
  });

  test('rejects unsafe table / column names', async () => {
    await expect(saveRecord('formulas; DROP TABLE x', {}, { conn: fakeConn(null) })).rejects.toThrow('Invalid SQL identifier');
  });

  test('unknown uuid -> NotFound', async () => {
    await expect(saveRecord('formulas', { uuid: 'nope', name: 'x' }, { conn: fakeConn(null) })).rejects.toThrow(NotFoundError);
  });

  describe('concurrency', () => {
    const current = { id: 9, uuid: 'U1', version: 3, name: 'tax', formula_text: 'x', status: 'ACTIVE' };

    test('stale base version -> ConflictError carrying the current row (HTTP 409)', async () => {
      const conn = fakeConn(current);
      const err = await saveRecord('formulas', { uuid: 'U1', formula_text: 'y' }, { conn, expectedVersion: 2 }).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictError);
      expect(err.status).toBe(409);
      expect(err.details.current.version).toBe(3);
      expect(conn.calls.some((c) => c.sql.startsWith('INSERT'))).toBe(false); // nothing inserted
    });

    test('two writers pass the version check at the same moment: UNIQUE(uuid, version) lets only one INSERT win', async () => {
     
      const used = new Set(['U1:3']);
      const insert = async (_sql, params) => {
        const [, columns, values] = params;
        const key = `${values[0][columns.indexOf('uuid')]}:${values[0][columns.indexOf('version')]}`;
        if (used.has(key)) throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
        used.add(key);
        return [{ insertId: 50 }];
      };
      const connA = fakeConn({ ...current, version: 2 }, insert); // both read version 2 as "current"
      const connB = fakeConn({ ...current, version: 2 }, insert);
      used.delete('U1:3'); // version 3 not yet taken
      used.add('U1:2');
      const results = await Promise.allSettled([
        saveRecord('formulas', { uuid: 'U1', formula_text: 'A' }, { conn: connA, expectedVersion: 2 }),
        saveRecord('formulas', { uuid: 'U1', formula_text: 'B' }, { conn: connB, expectedVersion: 2 }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictError);
    });
  });
});
