CREATE OR REPLACE VIEW formulas_current_window AS
SELECT id, uuid, version, name, formula_text, status, note,
       created_by, changed_by, first_created_at, inserted_at
FROM (
  SELECT f.*, ROW_NUMBER() OVER (PARTITION BY f.uuid ORDER BY f.id DESC) AS rn
  FROM formulas f
) ranked
WHERE rn = 1;