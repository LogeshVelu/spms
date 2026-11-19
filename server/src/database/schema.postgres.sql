-- ============================================================================
-- STUDENT PLACEMENT MANAGEMENT SYSTEM (SPMS v4.0)
-- Production PostgreSQL Database DDL Schema
-- Indian Institute of Technology Madras (IIT Madras)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK(role IN ('STUDENT', 'RECRUITER', 'ADMIN')),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL
);

-- 2. COMPANIES
CREATE TABLE IF NOT EXISTS companies (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    website VARCHAR(255),
    industry VARCHAR(100),
    description TEXT,
    logo_url VARCHAR(500),
    approval_status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK(approval_status IN ('PENDING', 'VERIFIED', 'CORRECTION_REQUIRED', 'REJECTED')),
    approved_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. RECRUITER PROFILES
CREATE TABLE IF NOT EXISTS recruiter_profiles (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30),
    designation VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. STUDENTS
CREATE TABLE IF NOT EXISTS students (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    register_number VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    degree VARCHAR(50) NOT NULL,
    department VARCHAR(100) NOT NULL,
    specialization VARCHAR(100),
    graduation_year INT NOT NULL,
    current_year INT NOT NULL DEFAULT 4,
    completed_semesters INT NOT NULL DEFAULT 6,
    current_cgpa NUMERIC(4,2) NOT NULL CHECK (current_cgpa >= 0.00 AND current_cgpa <= 10.00),
    tenth_percentage NUMERIC(5,2) NOT NULL CHECK (tenth_percentage >= 0.00 AND tenth_percentage <= 100.00),
    twelfth_percentage NUMERIC(5,2) NOT NULL CHECK (twelfth_percentage >= 0.00 AND twelfth_percentage <= 100.00),
    standing_arrears INT NOT NULL DEFAULT 0 CHECK (standing_arrears >= 0),
    history_of_arrears INT NOT NULL DEFAULT 0 CHECK (history_of_arrears >= 0),
    verification_status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK(verification_status IN ('PENDING', 'VERIFIED', 'CORRECTION_REQUIRED', 'REJECTED')),
    verified_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. STUDENT DOCUMENTS & RESUMES (WITH BYTEA BLOB VAULT)
CREATE TABLE IF NOT EXISTS student_documents (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL,
    title VARCHAR(150) NOT NULL,
    file_storage_key VARCHAR(500) NOT NULL,
    file_size_bytes INT NOT NULL,
    percentage_or_cgpa NUMERIC(5,2) NULL,
    file_name VARCHAR(255) NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_resumes (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    file_storage_key VARCHAR(500) NOT NULL,
    file_checksum_sha256 VARCHAR(64) NOT NULL,
    file_size_bytes INT NOT NULL,
    file_data BYTEA NULL,
    is_default INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL
);

-- 6. JOBS & ELIGIBILITY RULES
CREATE TABLE IF NOT EXISTS jobs (
    id VARCHAR(64) PRIMARY KEY,
    company_id VARCHAR(64) NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    location VARCHAR(150) NOT NULL,
    work_mode VARCHAR(50) NOT NULL DEFAULT 'ON_SITE',
    salary_package_lpa NUMERIC(6,2),
    application_deadline TIMESTAMPTZ NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'CLOSED', 'ARCHIVED')),
    created_by VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_eligibility_criteria (
    id VARCHAR(64) PRIMARY KEY,
    job_id VARCHAR(64) UNIQUE NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    criteria_version INT NOT NULL DEFAULT 1,
    min_cgpa NUMERIC(4,2) NOT NULL DEFAULT 0.00,
    min_tenth_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    min_twelfth_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    max_standing_arrears INT NOT NULL DEFAULT 0,
    max_history_arrears INT NOT NULL DEFAULT 99,
    eligible_degrees TEXT NOT NULL DEFAULT '[]',
    eligible_departments TEXT NOT NULL DEFAULT '[]',
    eligible_graduation_years TEXT NOT NULL DEFAULT '[]',
    max_graduation_year INT NULL
);

CREATE TABLE IF NOT EXISTS job_stages (
    id VARCHAR(64) PRIMARY KEY,
    job_id VARCHAR(64) NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    stage_name VARCHAR(100) NOT NULL,
    sequence_order INT NOT NULL,
    description TEXT,
    CONSTRAINT uq_pg_job_stage_order UNIQUE(job_id, sequence_order)
);

-- 7. APPLICATIONS & IMMUTABLE RESUME SNAPSHOT
CREATE TABLE IF NOT EXISTS applications (
    id VARCHAR(64) PRIMARY KEY,
    job_id VARCHAR(64) NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    status VARCHAR(30) NOT NULL DEFAULT 'APPLIED' CHECK(status IN ('APPLIED', 'IN_PROGRESS', 'OFFERED', 'ACCEPTED', 'DECLINED', 'REJECTED', 'WITHDRAWN')),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pg_student_job_application UNIQUE(student_id, job_id)
);

CREATE TABLE IF NOT EXISTS application_resume_snapshots (
    id VARCHAR(64) PRIMARY KEY,
    application_id VARCHAR(64) UNIQUE NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    original_resume_id VARCHAR(64) REFERENCES student_resumes(id) ON DELETE SET NULL,
    snapshot_storage_key VARCHAR(500) NOT NULL,
    file_checksum_sha256 VARCHAR(64) NOT NULL,
    file_size_bytes INT NOT NULL,
    file_data BYTEA NULL,
    file_name VARCHAR(255) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS application_stage_results (
    id VARCHAR(64) PRIMARY KEY,
    application_id VARCHAR(64) NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    job_stage_id VARCHAR(64) NOT NULL REFERENCES job_stages(id) ON DELETE RESTRICT,
    outcome VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK(outcome IN ('PENDING', 'SHORTLISTED', 'REJECTED', 'PASSED', 'ON_HOLD')),
    evaluator_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    feedback TEXT,
    evaluated_at TIMESTAMPTZ,
    CONSTRAINT uq_pg_app_stage UNIQUE(application_id, job_stage_id)
);

-- 8. INTERVIEWS & OFFERS
CREATE TABLE IF NOT EXISTS interviews (
    id VARCHAR(64) PRIMARY KEY,
    application_id VARCHAR(64) NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    job_stage_id VARCHAR(64) NOT NULL REFERENCES job_stages(id) ON DELETE RESTRICT,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
    meeting_link VARCHAR(500),
    venue VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS offers (
    id VARCHAR(64) PRIMARY KEY,
    application_id VARCHAR(64) UNIQUE NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
    status VARCHAR(30) NOT NULL DEFAULT 'ISSUED' CHECK(status IN ('DRAFT', 'ISSUED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED')),
    ctc_amount NUMERIC(10,2) NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    response_date TIMESTAMPTZ,
    rejection_reason TEXT,
    custom_company_name VARCHAR(255) NULL,
    custom_designation VARCHAR(255) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. AUDIT LOGS & NOTIFICATIONS
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    actor_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    entity_name VARCHAR(100) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(100) NOT NULL,
    previous_state TEXT,
    new_state TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    is_read INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_pg_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_pg_students_cohort ON students(graduation_year, department);
CREATE INDEX IF NOT EXISTS idx_pg_jobs_status_deadline ON jobs(status, application_deadline);
CREATE INDEX IF NOT EXISTS idx_pg_applications_job ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_pg_applications_student ON applications(student_id);
CREATE INDEX IF NOT EXISTS idx_pg_interviews_schedule ON interviews(scheduled_start, scheduled_end);
CREATE INDEX IF NOT EXISTS idx_pg_audit_entity ON audit_logs(entity_name, entity_id);
