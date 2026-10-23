import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

test('no UPDATE or DELETE statements anywhere in the application source', () => {
  const offenders = walk(path.join(__dirname, '..', 'src'))
    .filter((p) => p.endsWith('.js'))
    .filter((p) => /\b(UPDATE\s+[`\w?]+\s+SET|DELETE\s+FROM)\b/i.test(fs.readFileSync(p, 'utf8')));
  expect(offenders).toEqual([]);
});

test('only saveRecord.js and the repositories call INSERT', () => {
  const offenders = walk(path.join(__dirname, '..', 'src'))
    .filter((p) => p.endsWith('.js') && !p.endsWith('saveRecord.js'))
    .filter((p) => /\bINSERT\s+INTO\b/i.test(fs.readFileSync(p, 'utf8')));
  expect(offenders).toEqual([]);
});
