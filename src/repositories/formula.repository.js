import pool from '../db/pool.js';
import saveRecord from '../db/saveRecord.js';

const first = (rows) => rows[0] || null;

export const formulaRepository = {
  save: (data, options) => saveRecord('formulas', data, options),

  async findAllCurrent() {
    const [rows] = await pool.query('SELECT * FROM formulas_current ORDER BY name');
    return rows;
  },
  async findActiveCurrent() {
    const [rows] = await pool.query("SELECT * FROM formulas_current WHERE status = 'ACTIVE' ORDER BY name");
    return rows;
  },
  async findCurrentByUuid(uuid) {
    const [rows] = await pool.query('SELECT * FROM formulas_current WHERE uuid = ?', [uuid]);
    return first(rows);
  },
  async findHistory(uuid) {
    const [rows] = await pool.query('SELECT * FROM formulas WHERE uuid = ? ORDER BY id ASC', [uuid]);
    return rows;
  },
  async findVersion(uuid, version) {
    const [rows] = await pool.query('SELECT * FROM formulas WHERE uuid = ? AND version = ?', [uuid, version]);
    return first(rows);
  },
  async findActiveAsOf(asOf) {
    const [rows] = await pool.query(
      `SELECT f.* FROM formulas f
       JOIN (SELECT uuid, MAX(id) AS max_id FROM formulas WHERE inserted_at <= ? GROUP BY uuid) m ON m.max_id = f.id
       WHERE f.status = 'ACTIVE' ORDER BY f.name`,
      [asOf]
    );
    return rows;
  },
};

export default formulaRepository;
