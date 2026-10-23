CREATE OR REPLACE VIEW formulas_current AS
SELECT f.id, f.uuid, f.version, f.name, f.formula_text, f.status, f.note,
       f.created_by, f.changed_by, f.first_created_at, f.inserted_at
FROM formulas f
JOIN (SELECT uuid, MAX(id) AS max_id FROM formulas GROUP BY uuid) m
  ON m.max_id = f.id;