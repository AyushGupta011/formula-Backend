import express from 'express';
import formulaRoutes from './routes/formula.routes.js';
import { AppError } from './utils/errors.js';

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/formulas', formulaRoutes);

app.use((req, _res, next) => next(new AppError(404, 'NOT_FOUND', `No route ${req.method} ${req.path}`)));


app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') err = new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  const known = err instanceof AppError;
  if (!known) console.error(err);
  res.status(known ? err.status : 500).json({
    error: { code: known ? err.code : 'INTERNAL_ERROR', message: known ? err.message : 'Unexpected server error', ...(known && err.details ? { details: err.details } : {}) },
  });
});

export default app;
