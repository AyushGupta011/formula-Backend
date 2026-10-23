
import { randomUUID } from 'crypto';
import defaultPool from './pool.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const assertIdent = (s) => {
  if (!IDENT.test(s)) throw new Error(`Invalid SQL identifier: ${s}`);
};
const omit = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k, v]) => !keys.includes(k) && v !== undefined));

async function loadCurrent(conn, table, uuidColumn, uuid) {
  const [rows] = await conn.query('SELECT * FROM ?? WHERE ?? = ? ORDER BY id DESC LIMIT 1', [table, uuidColumn, uuid]);
  return rows[0] || null;
}

export async function saveRecord(table, data, options = {}) {
  const {
    uuidColumn = 'uuid',
    versionColumn = 'version',             
    firstCreatedColumn = 'first_created_at', 
    autoColumns = ['id', 'inserted_at'],     
    expectedVersion,                         
    conn = defaultPool,
  } = options;
  [table, uuidColumn].forEach(assertIdent);
  [versionColumn, firstCreatedColumn].filter(Boolean).forEach(assertIdent);

  const items = Array.isArray(data) ? data : [data];
  if (items.length === 0) return [];
  const rows = [];

  for (const item of items) {
    const incoming = omit(item, autoColumns); 

    if (!incoming[uuidColumn]) {
      
      const row = { ...incoming, [uuidColumn]: randomUUID() };
      if (versionColumn) row[versionColumn] = 1;
      if (firstCreatedColumn) row[firstCreatedColumn] = new Date();
      rows.push(row);
      continue;
    }

    const current = await loadCurrent(conn, table, uuidColumn, incoming[uuidColumn]);
    if (!current) throw new NotFoundError(`No record with ${uuidColumn} = ${incoming[uuidColumn]}`);
    if (versionColumn && expectedVersion !== undefined && current[versionColumn] !== expectedVersion) {
      throw new ConflictError(current); 
    }
    const row = { ...omit(current, autoColumns), ...incoming };
    if (versionColumn) row[versionColumn] = current[versionColumn] + 1;
    rows.push(row);
  }

  const columns = Object.keys(rows[0]);
  const values = rows.map((r) => columns.map((c) => (r[c] === undefined ? null : r[c])));
  try {
    const [result] = await conn.query('INSERT INTO ?? (??) VALUES ?', [table, columns, values]);
    return rows.map((r, i) => ({ ...r, id: result.insertId + i }));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' && versionColumn && rows.length === 1) {
      throw new ConflictError(await loadCurrent(conn, table, uuidColumn, rows[0][uuidColumn]));
    }
    throw err;
  }
}

export default saveRecord;
