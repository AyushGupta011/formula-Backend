
SELECT ROW_NUMBER() OVER (PARTITION BY uuid ORDER BY id) AS version_no,
       id, uuid, name, formula_text, status, changed_by, inserted_at
FROM formulas
WHERE uuid = @uuid
ORDER BY id;


WITH RECURSIVE
cur AS (SELECT uuid, name, formula_text FROM formulas_current WHERE status = 'ACTIVE'),
edges AS (
  SELECT a.name AS formula, b.name AS dependency
  FROM cur a JOIN cur b ON a.uuid <> b.uuid
   AND a.formula_text REGEXP CONCAT('EXTERNAL_VAR\\.', b.name, '([^A-Za-z0-9_]|$)')
),
lvl (name, depth) AS (
  SELECT c.name, 0 FROM cur c WHERE NOT EXISTS (SELECT 1 FROM edges e WHERE e.formula = c.name)
  UNION ALL
  SELECT e.formula, l.depth + 1 FROM edges e JOIN lvl l ON l.name = e.dependency
)
SELECT name, MAX(depth) AS execution_level
FROM lvl GROUP BY name
ORDER BY execution_level, name;


SELECT c.uuid, c.name AS current_name, COUNT(*) AS versions
FROM formulas f
JOIN formulas_current c ON c.uuid = f.uuid
GROUP BY c.uuid, c.name
ORDER BY versions DESC, c.name;

SELECT formula_uuid, MAX(formula_name) AS formula_name,
       COUNT(*) AS total_runs,
       SUM(status = 'FAILED') AS failures,
       ROUND(100 * SUM(status = 'FAILED') / COUNT(*), 2) AS failure_pct
FROM formula_runs
WHERE created_at >= NOW() - INTERVAL 7 DAY
GROUP BY formula_uuid
ORDER BY failure_pct DESC;

WITH stats AS (
  SELECT formula_uuid, MAX(formula_name) AS formula_name, COUNT(*) AS total_runs, SUM(status = 'FAILED') AS failures
  FROM formula_runs GROUP BY formula_uuid
),
last_error AS (
  SELECT formula_uuid, error,
         ROW_NUMBER() OVER (PARTITION BY formula_uuid ORDER BY id DESC) AS rn
  FROM formula_runs WHERE status = 'FAILED'
)
SELECT s.formula_uuid, s.formula_name, s.failures, s.total_runs, e.error AS most_recent_error
FROM stats s JOIN last_error e ON e.formula_uuid = s.formula_uuid AND e.rn = 1
WHERE s.failures > 0
ORDER BY s.failures DESC
LIMIT 5;

SELECT uuid, name, version, changed_by AS deactivated_by, inserted_at AS deactivated_at
FROM formulas_current
WHERE status = 'INACTIVE';

WITH v AS (
  SELECT uuid, name, version, inserted_at,
         LAG(inserted_at) OVER (PARTITION BY uuid ORDER BY id) AS prev_inserted_at
  FROM formulas
)
SELECT uuid, name, version, inserted_at,
       ROUND(TIMESTAMPDIFF(MICROSECOND, prev_inserted_at, inserted_at) / 1000) AS ms_since_previous,
       ROUND(AVG(TIMESTAMPDIFF(MICROSECOND, prev_inserted_at, inserted_at)) OVER (PARTITION BY uuid) / 1000) AS avg_ms_between_changes
FROM v
WHERE prev_inserted_at IS NOT NULL
ORDER BY uuid, version;
