import saveRecord from '../db/saveRecord.js';

const CHUNK = 1000;
export const runlogRepository = {
  async saveMany(rows) {
    for (let i = 0; i < rows.length; i += CHUNK) {
      await saveRecord('formula_runs', rows.slice(i, i + CHUNK), { versionColumn: null, firstCreatedColumn: null });
    }
  },
};

export default runlogRepository;
