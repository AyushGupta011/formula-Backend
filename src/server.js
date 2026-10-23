import app from './app.js';
import config from './config.js';

app.listen(config.port, () => console.log(`Formula engine listening on :${config.port}`));
