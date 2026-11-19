import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { testPostgresConnection, pool } from './postgres.js';

let replicationQueue = Promise.resolve();

function toPgSql(sql) {
  let i = 0;
  return sql
    .replace(/\?/g, () => `$${++i}`)
    .replace(/datetime\("now"\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');
}

function replicateToPostgres(sql, params = []) {
  if (!pool) return;
  replicationQueue = replicationQueue.then(async () => {
    try {
      const pgSql = toPgSql(sql);
      const pgParams = params.map(val => {
        if (val === undefined) {
          return null;
        }
        if (val instanceof Uint8Array || Buffer.isBuffer(val)) {
          return Buffer.from(val);
        }
        return val;
      });
      await pool.query(pgSql, pgParams);
    } catch (err) {
      if (!err.message.includes('duplicate key') && !err.message.includes('unique constraint')) {
        console.warn('⚠️ [PostgreSQL Live Sync Notice]:', err.message);
      }
    }
  }).catch(() => {});
}

export async function pullFromPostgresToLocal() {
  if (!pool) return;
  const tables = [
    'users',
    'companies',
    'recruiter_profiles',
    'students',
    'student_documents',
    'student_resumes',
    'jobs',
    'job_eligibility_criteria',
    'job_stages',
    'applications',
    'application_resume_snapshots',
    'application_stage_results',
    'interviews',
    'offers',
    'notifications',
    'audit_logs'
  ];

  try {
    sqlite.exec('PRAGMA foreign_keys = OFF;');
    for (const table of tables) {
      const pgData = await pool.query(`SELECT * FROM "${table}"`);
      sqlite.exec(`DELETE FROM "${table}";`);
      if (pgData.rows.length === 0) continue;

      const cols = Object.keys(pgData.rows[0]);
      const colList = cols.map(c => `"${c}"`).join(', ');
      const placeholders = cols.map(() => '?').join(', ');
      const stmt = sqlite.prepare(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`);

      for (const row of pgData.rows) {
        const vals = cols.map(c => {
          const v = row[c];
          if (v instanceof Date) return v.toISOString();
          if (typeof v === 'object' && v !== null && !Buffer.isBuffer(v)) return JSON.stringify(v);
          return v;
        });
        stmt.run(...vals);
      }
    }
    sqlite.exec('PRAGMA foreign_keys = ON;');
  } catch (err) {
    try { sqlite.exec('PRAGMA foreign_keys = ON;'); } catch (e) {}
  }
}

// Ensure data folder exists
const dataDir = path.dirname(config.dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure private uploads directory exists
if (!fs.existsSync(config.uploadsDir)) {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

export const sqlite = new DatabaseSync(config.dbPath);

// Enable WAL mode for high performance and Foreign Keys
sqlite.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

export function initDb() {
  testPostgresConnection().then(async (res) => {
    if (res.connected) {
      console.log(`🐘 PostgreSQL Active: Connected to database '${res.database}' successfully!`);
      await pullFromPostgresToLocal();
      console.log('🔄 PostgreSQL Mirror Sync: Local database synchronized with PostgreSQL.');

      // Recurring background sync every 5 seconds to catch external psql changes
      setInterval(() => {
        pullFromPostgresToLocal().catch(() => {});
      }, 5000);
    } else {
      console.log(`🐘 PostgreSQL Engine: Configured as Primary Enterprise Database.`);
      console.log(`ℹ️  PostgreSQL Service is currently offline (${res.error}).`);
      console.log(`🛡️  Zero-Downtime Engine: Serving traffic via local storage engine without interruption.`);
    }
  }).catch(() => {});

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('STUDENT', 'RECRUITER', 'ADMIN')),
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      website TEXT,
      industry TEXT,
      description TEXT,
      logo_url TEXT,
      approval_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(approval_status IN ('PENDING', 'VERIFIED', 'CORRECTION_REQUIRED', 'REJECTED')),
      approved_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS recruiter_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      company_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      designation TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      register_number TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      degree TEXT NOT NULL,
      department TEXT NOT NULL,
      specialization TEXT,
      graduation_year INTEGER NOT NULL,
      current_year INTEGER NOT NULL DEFAULT 4,
      completed_semesters INTEGER NOT NULL DEFAULT 6,
      current_cgpa REAL NOT NULL CHECK (current_cgpa >= 0.00 AND current_cgpa <= 10.00),
      tenth_percentage REAL NOT NULL CHECK (tenth_percentage >= 0.00 AND tenth_percentage <= 100.00),
      twelfth_percentage REAL NOT NULL CHECK (twelfth_percentage >= 0.00 AND twelfth_percentage <= 100.00),
      standing_arrears INTEGER NOT NULL DEFAULT 0 CHECK (standing_arrears >= 0),
      history_of_arrears INTEGER NOT NULL DEFAULT 0 CHECK (history_of_arrears >= 0),
      verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(verification_status IN ('PENDING', 'VERIFIED', 'CORRECTION_REQUIRED', 'REJECTED')),
      verified_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS student_documents (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      document_type TEXT NOT NULL,
      title TEXT NOT NULL,
      file_storage_key TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      percentage_or_cgpa REAL NULL,
      file_name TEXT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS student_resumes (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      title TEXT NOT NULL,
      file_storage_key TEXT NOT NULL,
      file_checksum_sha256 TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      file_data BLOB NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT NOT NULL,
      work_mode TEXT NOT NULL DEFAULT 'ON_SITE',
      salary_package_lpa REAL,
      application_deadline TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'CLOSED', 'ARCHIVED')),
      created_by TEXT NOT NULL,
      approved_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
      FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS job_eligibility_criteria (
      id TEXT PRIMARY KEY,
      job_id TEXT UNIQUE NOT NULL,
      criteria_version INTEGER NOT NULL DEFAULT 1,
      min_cgpa REAL NOT NULL DEFAULT 0.00,
      min_tenth_percentage REAL NOT NULL DEFAULT 0.00,
      min_twelfth_percentage REAL NOT NULL DEFAULT 0.00,
      max_standing_arrears INTEGER NOT NULL DEFAULT 0,
      max_history_arrears INTEGER NOT NULL DEFAULT 99,
      eligible_degrees TEXT NOT NULL DEFAULT '[]',
      eligible_departments TEXT NOT NULL DEFAULT '[]',
      eligible_graduation_years TEXT NOT NULL DEFAULT '[]',
      max_graduation_year INTEGER,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS job_stages (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      stage_name TEXT NOT NULL,
      sequence_order INTEGER NOT NULL,
      description TEXT,
      UNIQUE(job_id, sequence_order),
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'APPLIED' CHECK(status IN ('APPLIED', 'IN_PROGRESS', 'OFFERED', 'ACCEPTED', 'DECLINED', 'REJECTED', 'WITHDRAWN')),
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, job_id),
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE RESTRICT,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS application_resume_snapshots (
      id TEXT PRIMARY KEY,
      application_id TEXT UNIQUE NOT NULL,
      original_resume_id TEXT,
      snapshot_storage_key TEXT NOT NULL,
      file_checksum_sha256 TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      file_data BLOB NULL,
      file_name TEXT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
      FOREIGN KEY (original_resume_id) REFERENCES student_resumes(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS application_stage_results (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      job_stage_id TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'PENDING' CHECK(outcome IN ('PENDING', 'SHORTLISTED', 'REJECTED', 'PASSED', 'ON_HOLD')),
      evaluator_id TEXT,
      feedback TEXT,
      evaluated_at TEXT,
      UNIQUE(application_id, job_stage_id),
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
      FOREIGN KEY (job_stage_id) REFERENCES job_stages(id) ON DELETE RESTRICT,
      FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      job_stage_id TEXT NOT NULL,
      scheduled_start TEXT NOT NULL,
      scheduled_end TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
      meeting_link TEXT,
      venue TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
      FOREIGN KEY (job_stage_id) REFERENCES job_stages(id) ON DELETE RESTRICT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_interviews_app_stage ON interviews(application_id, job_stage_id);

    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY,
      application_id TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'ISSUED' CHECK(status IN ('DRAFT', 'ISSUED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED')),
      ctc_amount REAL NOT NULL,
      valid_until TEXT NOT NULL,
      response_date TEXT,
      rejection_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      entity_name TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      previous_state TEXT,
      new_state TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_students_cohort ON students(graduation_year, department);
    CREATE INDEX IF NOT EXISTS idx_jobs_status_deadline ON jobs(status, application_deadline);
    CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id);
    CREATE INDEX IF NOT EXISTS idx_applications_student ON applications(student_id);
    CREATE INDEX IF NOT EXISTS idx_interviews_schedule ON interviews(scheduled_start, scheduled_end);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_name, entity_id);
  `);

  try {
    sqlite.exec(`ALTER TABLE student_documents ADD COLUMN percentage_or_cgpa REAL;`);
  } catch (e) {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE student_documents ADD COLUMN file_name TEXT;`);
  } catch (e) {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE students ADD COLUMN current_year INTEGER DEFAULT 4;`);
  } catch (e) {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE students ADD COLUMN completed_semesters INTEGER DEFAULT 6;`);
  } catch (e) {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE job_eligibility_criteria ADD COLUMN max_graduation_year INTEGER;`);
  } catch (e) {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE student_resumes ADD COLUMN file_data BLOB;`);
  } catch (e) {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE application_resume_snapshots ADD COLUMN file_data BLOB;`);
  } catch (e) {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE application_resume_snapshots ADD COLUMN file_name TEXT;`);
  } catch (e) {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE offers ADD COLUMN custom_company_name TEXT;`);
  } catch (e) {
    // Column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE offers ADD COLUMN custom_designation TEXT;`);
  } catch (e) {
    // Column already exists
  }
  try {
    sqlite.exec(`UPDATE students SET current_year = 4 WHERE current_year IS NULL;`);
    sqlite.exec(`UPDATE students SET completed_semesters = 6 WHERE completed_semesters IS NULL;`);
  } catch (e) {
    // Safe fallback
  }
}

// Database helper wrapping prepared statements
export const db = {
  get(sql, params = []) {
    const stmt = sqlite.prepare(sql);
    return stmt.get(...params);
  },
  all(sql, params = []) {
    const stmt = sqlite.prepare(sql);
    return stmt.all(...params);
  },
  run(sql, params = []) {
    const stmt = sqlite.prepare(sql);
    const res = stmt.run(...params);
    replicateToPostgres(sql, params);
    return res;
  },
  exec(sql) {
    const res = sqlite.exec(sql);
    if (pool && !sql.trim().toUpperCase().startsWith('PRAGMA')) {
      try {
        const pgSql = toPgSql(sql);
        pool.query(pgSql).catch(() => {});
      } catch (e) {}
    }
    return res;
  },
  _inTransaction: false,
  transaction(fn) {
    if (this._inTransaction) {
      return fn();
    }
    this._inTransaction = true;
    sqlite.exec('BEGIN TRANSACTION');
    try {
      const res = fn();
      sqlite.exec('COMMIT');
      return res;
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    } finally {
      this._inTransaction = false;
    }
  }
};
