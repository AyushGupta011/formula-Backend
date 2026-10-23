
CREATE DATABASE IF NOT EXISTS formula_engine CHARACTER SET utf8mb4;
USE formula_engine;

CREATE TABLE IF NOT EXISTS formulas (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,       
  uuid             CHAR(36)     NOT NULL,                    
  version          INT          NOT NULL,                    
  name             VARCHAR(64)  NOT NULL,                    
  formula_text     TEXT         NOT NULL,
  status           ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  note             VARCHAR(255) NULL,                        
  created_by       VARCHAR(100) NOT NULL,                  
  changed_by       VARCHAR(100) NOT NULL,                    
  first_created_at DATETIME(3)  NOT NULL,                     
  inserted_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3), 
  UNIQUE KEY uq_formula_uuid_version (uuid, version),
  KEY idx_formula_uuid_id (uuid, id),
  KEY idx_formula_inserted (inserted_at, uuid),
  KEY idx_formula_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS formula_runs (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid          CHAR(36)     NOT NULL,                       
  run_uuid      CHAR(36)     NOT NULL,                       
  formula_uuid  CHAR(36)     NOT NULL,
  formula_name  VARCHAR(64)  NOT NULL,
  version_used  INT          NOT NULL,
  input_json    JSON         NOT NULL,
  result        DECIMAL(20,2) NULL,
  calculation   TEXT         NULL,
  error         TEXT         NULL,
  status        ENUM('SUCCESS','FAILED','SKIPPED') NOT NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_run_uuid_row (uuid),
  KEY idx_run (run_uuid),
  KEY idx_runs_formula_time (formula_uuid, created_at, status)
) ENGINE=InnoDB;
