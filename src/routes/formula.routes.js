import express from 'express';
import c from '../controllers/formula.controller.js';
import { validate, schemas } from '../validators/formula.validator.js';

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.post('/preview/bulk', validate(schemas.previewBulk), wrap(c.previewBulk));
router.post('/preview', validate(schemas.preview), wrap(c.preview));
router.get('/', wrap(c.list));
router.post('/', validate(schemas.saveFormula), wrap(c.save));
router.post('/:uuid/deactivate', validate(schemas.uuidParam, 'params'), validate(schemas.deactivate), wrap(c.deactivate));
router.post('/:uuid/rollback', validate(schemas.uuidParam, 'params'), validate(schemas.rollback), wrap(c.rollback));
router.get('/:uuid/history', validate(schemas.uuidParam, 'params'), wrap(c.history));
router.get('/:uuid/impact', validate(schemas.uuidParam, 'params'), wrap(c.impact));

export default router;
