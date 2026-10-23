import os from 'os';

const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

export const config = {
  port: int(process.env.PORT, 3000),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: int(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'formula_engine',
  },
  formulaTimeoutMs: int(process.env.FORMULA_TIMEOUT_MS, 3000),

  maxProcesses: int(process.env.MAX_PROCESSES, Math.max(2, os.cpus().length)),
  memoryInMB: int(process.env.FORMULA_MEMORY_MB, 32),

  recordConcurrency: int(process.env.RECORD_CONCURRENCY, 32),
  maxBulkRecords: 500,
};

export default config;
