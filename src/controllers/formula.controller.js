import formulas from '../services/formula.service.js';
import previews from '../services/preview.service.js';

export const formulaController = {
  save: async (req, res) => {
    const creating = !req.body.uuid;
    res.status(creating ? 201 : 200).json({ data: await formulas.saveFormula(req.body) });
  },
  deactivate: async (req, res) => res.json({ data: await formulas.deactivate(req.params.uuid, req.body) }),
  rollback: async (req, res) => res.status(201).json({ data: await formulas.rollback(req.params.uuid, req.body) }),
  list: async (_req, res) => res.json({ data: await formulas.list() }),
  history: async (req, res) => res.json({ data: await formulas.history(req.params.uuid) }),
  impact: async (req, res) => res.json({ data: await formulas.impact(req.params.uuid) }),
  preview: async (req, res) => res.json({ data: await previews.preview(req.body) }),
  previewBulk: async (req, res) => res.json({ data: await previews.previewBulk(req.body) }),
};

export default formulaController;