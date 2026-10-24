# Formula Engine

A high-performance, version-controlled formula calculation and execution engine built with Node.js and MySQL. It features dependency DAG resolution, immutable versioning, optimistic concurrency control, sandboxed execution, step-by-step calculation auditing, and point-in-time evaluation.

---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Getting Started / Setup](#getting-started--setup)
  - [1. Clone Repository](#1-clone-repository)
  - [2. Install Dependencies](#2-install-dependencies)
  - [3. Configure Environment Variables](#3-configure-environment-variables)
  - [4. Setup Database](#4-setup-database)
    - [Option A: Docker Compose (Recommended)](#option-a-docker-compose-recommended)
    - [Option B: Manual MySQL Setup](#option-b-manual-mysql-setup)
  - [5. Run the Server](#5-run-the-server)
- [Running Tests](#running-tests)
- [Environment Configuration](#environment-configuration)
- [Formula Syntax & Guidelines](#formula-syntax--guidelines)
- [Database Architecture & Schema](#database-architecture--schema)
- [API Reference](#api-reference)
  - [Formula Management](#formula-management)
  - [Execution & Preview](#execution--preview)
- [Error Codes](#error-codes)

---

## Features

- **Immutable Versioning**: Append-only audit model where formulas are never mutated in place. Every modification increments the version number while preserving complete history.
- **Optimistic Concurrency Control**: Prevents concurrent overwrite race conditions by validating `base_version` during updates.
- **DAG Dependency Resolution**: Automatically detects inter-formula dependencies (`EXTERNAL_VAR.<dependency_name>`), prevents cyclic references, and computes topological execution levels.
- **Sandboxed Execution**: Safe execution with execution timeouts and memory bounds via isolated worker execution or high-speed V8 VM context.
- **Step-by-Step Calculation Breakdown**: Explains and logs the step-by-step derivation for every calculated value.
- **Time-Travel (Point-in-Time) Preview**: Evaluate records against formulas exactly as they existed at any historical timestamp using `as_of`.
- **Impact Analysis & Safe Deactivations**: Inspect dependent formulas before renaming or deactivating to avoid breaking downstream pipelines.
- **High-Throughput Bulk Evaluation**: Process batches of up to 500 records concurrently with bounded process pools.

---

## Prerequisites

- **Node.js**: v20.6.0+ (requires native `--env-file` support and ES Modules)
- **npm**: v9+
- **MySQL**: 8.0+ or **Docker & Docker Compose**

---

## Project Structure

```text
formula-engine/
├── .env.example              # Environment variables template
├── docker-compose.yml        # MySQL 8.0 container setup
├── package.json              # Project configuration and dependencies
├── jest.config.js            # Jest test configuration
├── sql/
│   ├── schema.sql            # Table definitions (formulas, formula_runs)
│   ├── view_aggregate.sql    # Current version view using MAX(id)
│   ├── view_window.sql       # Current version view using ROW_NUMBER()
│   └── queries.sql           # Analytical and auditing SQL queries
├── src/
│   ├── app.js                # Express app setup and global error handlers
│   ├── config.js             # Environment and runtime configurations
│   ├── server.js             # Server entrypoint
│   ├── controllers/          # HTTP request handlers
│   ├── db/                   # Connection pool and saveRecord utility
│   ├── repositories/         # Database persistence layer
│   ├── routes/               # API route definitions
│   ├── services/             # Core business logic (dependency, evaluator, preview)
│   ├── utils/                # Rounding, concurrency limiter, errors
│   └── validators/           # Zod request payload schemas
└── tests/                    # Jest automated test suites
```

---

## Getting Started / Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd formula-engine
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create your local `.env` file from the provided `.env.example`:

```bash
cp .env.example .env
```

*(On Windows PowerShell: `Copy-Item .env.example .env`)*

Review `.env` and adjust the database credentials and port as needed:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=
DB_NAME=formula_engine
FORMULA_TIMEOUT_MS=3000
MAX_PROCESSES=8
FORMULA_MEMORY_MB=32
RECORD_CONCURRENCY=32
```

### 4. Setup Database

You can either launch MySQL via Docker or use an existing local MySQL installation.

#### Option A: Docker Compose (Recommended)

Start the MySQL 8.0 container in the background:

```bash
docker compose up -d
```

> **Note:** Docker Compose will automatically mount and execute `sql/schema.sql` and `sql/view_aggregate.sql` on first launch into `/docker-entrypoint-initdb.d/`.

To verify the container is healthy:

```bash
docker ps --filter "name=formula_mysql"
```

To stop the container:

```bash
docker compose down
```

#### Option B: Manual MySQL Setup

If you have a local MySQL server running:

1. Connect to MySQL:
   ```bash
   mysql -u root -p
   ```

2. Execute the schema script:
   ```sql
   SOURCE sql/schema.sql;
   SOURCE sql/view_aggregate.sql;
   ```

*(Alternatively, use `sql/view_window.sql` if you prefer the window function implementation for `formulas_current`).*

### 5. Run the Server

#### Development Mode (with hot-reload)

```bash
npm run dev
```

#### Production Mode

```bash
npm start
```

The server will start listening on `http://localhost:3000` (or the port defined in your `.env`).

---

## Running Tests

Unit and integration tests are powered by **Jest** with experimental VM modules:

```bash
npm test
```

To run a specific test suite:

```bash
npx jest tests/routes.test.js
npx jest tests/evaluator.test.js
npx jest tests/dependency.test.js
```

---

## Environment Configuration

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port for Express HTTP server |
| `DB_HOST` | `localhost` | Hostname of the MySQL database |
| `DB_PORT` | `3306` | Port of the MySQL database |
| `DB_USER` | `root` | Database username |
| `DB_PASS` | *(empty)* | Database password |
| `DB_NAME` | `formula_engine` | Database name |
| `FORMULA_TIMEOUT_MS` | `3000` | Execution timeout in milliseconds for each formula evaluation |
| `MAX_PROCESSES` | `CPU Count` (min 2) | Maximum parallel child/worker processes for formula evaluation |
| `FORMULA_MEMORY_MB` | `32` | Memory limit in MB per formula evaluation sandbox |
| `RECORD_CONCURRENCY` | `32` | Concurrency limit for processing records in bulk preview |

---

## Formula Syntax & Guidelines

Formulas are executed inside an isolated sandbox with the input record and dependent formula values injected under the `EXTERNAL_VAR` namespace.

### Syntax Rules

1. **Variables**: Access fields using `EXTERNAL_VAR.<variable_name>` (e.g., `EXTERNAL_VAR.gross_sales`, `EXTERNAL_VAR.tax_rate`).
2. **Formula Names**: Must start with a letter or underscore, alphanumeric, and max 64 characters (e.g., `net_sales`, `commission_tier_1`).
3. **Return Statement**: Every formula **must** finish with a `return` statement returning a numeric value.
4. **Rounding**: All outputs are automatically rounded to 2 decimal places.
5. **No Bracket Access**: Use dot notation `EXTERNAL_VAR.field` (bracket notation `EXTERNAL_VAR['field']` is blocked to ensure static dependency graph detection).

### Example Formula

```javascript
let base = EXTERNAL_VAR.amount * 0.15;
if (EXTERNAL_VAR.is_preferred) {
  base += 50;
}
return base;
```

---

## Database Architecture & Schema

- **`formulas`**: The append-only version table storing name, script text, status (`ACTIVE` or `INACTIVE`), change notes, `version`, `uuid`, and audit timestamps.
- **`formula_runs`**: Stores individual formula evaluation runs with inputs, computed results, status (`SUCCESS` / `FAILED` / `SKIPPED`), calculation trace, and errors.
- **`formulas_current`**: Database view that resolves the latest active/inactive version per formula UUID.
- **`sql/queries.sql`**: Contains sample SQL for historical version tracking, DAG recursive CTE depth inspection, failure analytics, and modification latency.

---

## API Reference

All requests and responses use JSON (`Content-Type: application/json`).

### Formula Management

#### 1. List All Active Formulas
- **`GET /formulas`**
- Returns all current active formulas.

**Response `(200 OK)`**:
```json
{
  "data": [
    {
      "id": 1,
      "uuid": "4f9d0c64-3be8-4fc2-a7d1-dc7ffc6225ef",
      "version": 1,
      "name": "tax_amount",
      "formula_text": "return EXTERNAL_VAR.subtotal * 0.08;",
      "status": "ACTIVE",
      "created_by": "admin",
      "changed_by": "admin"
    }
  ]
}
```

#### 2. Create or Update Formula
- **`POST /formulas`**
- To **create**: omit `uuid`.
- To **update**: include `uuid` and `base_version` (optimistic locking).

**Request Body (Create)**:
```json
{
  "name": "tax_amount",
  "formula_text": "return EXTERNAL_VAR.subtotal * 0.08;",
  "changed_by": "john_doe",
  "note": "Initial version for state tax"
}
```

**Request Body (Update)**:
```json
{
  "uuid": "4f9d0c64-3be8-4fc2-a7d1-dc7ffc6225ef",
  "base_version": 1,
  "formula_text": "return EXTERNAL_VAR.subtotal * 0.09;",
  "changed_by": "john_doe",
  "note": "Updated tax rate to 9%"
}
```

#### 3. Deactivate Formula
- **`POST /formulas/:uuid/deactivate`**
- Checks whether other active formulas depend on this formula before deactivating. Use `"force": true` to override.

**Request Body**:
```json
{
  "base_version": 2,
  "changed_by": "john_doe",
  "force": false
}
```

#### 4. Rollback Formula
- **`POST /formulas/:uuid/rollback`**
- Restores formula code from a previous version into a new version entry.

**Request Body**:
```json
{
  "version": 1,
  "base_version": 2,
  "changed_by": "john_doe"
}
```

#### 5. Formula Version History
- **`GET /formulas/:uuid/history`**
- Returns all past and present versions for the formula.

#### 6. Impact Analysis
- **`GET /formulas/:uuid/impact`**
- Returns list of other active formulas that depend on this formula.

---

### Execution & Preview

#### 1. Single Record Preview
- **`POST /formulas/preview`**
- Evaluates active formulas in topological DAG order against a record.

**Request Body**:
```json
{
  "record": {
    "subtotal": 100,
    "discount": 10
  },
  "formula_uuids": ["4f9d0c64-3be8-4fc2-a7d1-dc7ffc6225ef"]
}
```

**Response `(200 OK)`**:
```json
{
  "data": {
    "run_uuid": "c4d7ec18-d7b3-4fbb-a18d-64dca33767f4",
    "execution_order": [["tax_amount"]],
    "results": [
      {
        "name": "tax_amount",
        "uuid": "4f9d0c64-3be8-4fc2-a7d1-dc7ffc6225ef",
        "version": 2,
        "level": 0,
        "status": "SUCCESS",
        "result": 9.00,
        "calculation": {
          "inputs": ["EXTERNAL_VAR.subtotal = 100"],
          "formula": "return EXTERNAL_VAR.subtotal * 0.09;",
          "steps": [],
          "result": "9"
        }
      }
    ],
    "final_record": {
      "subtotal": 100,
      "discount": 10,
      "tax_amount": 9.00
    }
  }
}
```

#### 2. Bulk Records Preview
- **`POST /formulas/preview/bulk`**
- Evaluates a batch of records (up to 500 records).

**Request Body**:
```json
{
  "records": [
    { "subtotal": 100 },
    { "subtotal": 250 }
  ],
  "fast": true,
  "explain": false
}
```

---

## Error Codes

The API returns consistent error responses:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Formula has changed concurrently"
  }
}
```

| Error Code | HTTP Status | Description |
| :--- | :--- | :--- |
| `VALIDATION_ERROR` | `400` | Missing required fields, invalid name, or invalid formula syntax |
| `MISSING_INPUTS` | `400` | Input record lacks variables required by the formulas |
| `FORMULA_INVALID` | `400` | Formula threw an exception when validated against sample data |
| `NAME_TAKEN` | `400` | An active formula with the specified name already exists |
| `CYCLIC_DEPENDENCY`| `400` | Circular dependency detected in the formula graph |
| `BREAKS_DEPENDENTS`| `400` | Cannot deactivate/rename because other formulas depend on it |
| `NOT_FOUND` | `404` | Formula UUID or route not found |
| `CONFLICT` | `409` | Formula version conflict (`base_version` mismatch) |
| `INTERNAL_ERROR` | `500` | Unhandled internal server error |
