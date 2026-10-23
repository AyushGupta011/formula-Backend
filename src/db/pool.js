import mysql from 'mysql2/promise';
import config from '../config.js';

export const pool = mysql.createPool({ ...config.db, connectionLimit: 10, timezone: 'Z' });
pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

export default pool;
