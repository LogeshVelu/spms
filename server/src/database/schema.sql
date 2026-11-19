-- ============================================================================
-- STUDENT PLACEMENT MANAGEMENT SYSTEM (SPMS)
-- Master Relational Database Schema Specification (PostgreSQL 15+)
-- Version 4.0 Consolidated Production Baseline
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ENUM DEFINITIONS
CREATE TYPE user_role AS ENUM ('STUDENT', 'RECRUITER', 'ADMIN');
CREATE TYPE account_status AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');
CREATE TYPE verification_status AS ENUM ('PENDING', 'VERIFIED', 'CORRECTION_REQUIRED', 'REJECTED');
CREATE TYPE job_status AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'CLOSED', 'ARCHIVED');
CREATE TYPE app_status AS ENUM ('APPLIED', 'IN_PROGRESS', 'OFFERED', 'ACCEPTED', 'DECLINED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE stage_outcome AS ENUM ('PENDING', 'SHORTLISTED', 'REJECTED', 'PASSED', 'ON_HOLD');
CREATE TYPE interview_status AS ENUM ('SCHEDULED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE offer_status AS ENUM ('DRAFT', 'ISSUED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED');

-- 2. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    status account_status NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL
);

-- 3. COMPANIES TABLE
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    website VARCHAR(255),
    industry VARCHAR(100),
    description TEXT,
    logo_url VARCHAR(500),
    approval_status verification_status NOT NULL DEFAULT 'PENDING',
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. RECRUITER PROFILES
CREATE TABLE IF NOT EXISTS recruiter_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30),
    designation VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. STUDENTS TABLE
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    verification_status verification_status NOT NULL DEFAULT 'PENDING',
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. STUDENT DOCUMENTS & RESUMES
CREATE TABLE IF NOT EXISTS student_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL, -- 'MARKSHEET_10TH', 'MARKSHEET_12TH', 'DEGREE_CERT', 'ID_CARD'
    title VARCHAR(150) NOT NULL,
    file_storage_key VARCHAR(500) NOT NULL,
    file_size_bytes INT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_resumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    file_storage_key VARCHAR(500) NOT NULL,
    file_checksum_sha256 VARCHAR(64) NOT NULL,
    file_size_bytes INT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL
);

-- 7. JOBS & ELIGIBILITY RULES
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    location VARCHAR(150) NOT NULL,
    work_mode VARCHAR(50) NOT NULL DEFAULT 'ON_SITE', -- 'REMOTE', 'HYBRID', 'ON_SITE'
    salary_package_lpa NUMERIC(6,2),
    application_deadline TIMESTAMPTZ NOT NULL,
    status job_status NOT NULL DEFAULT 'DRAFT',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_eligibility_criteria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID UNIQUE NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    criteria_version INT NOT NULL DEFAULT 1,
    min_cgpa NUMERIC(4,2) NOT NULL DEFAULT 0.00,
    min_tenth_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    min_twelfth_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    max_standing_arrears INT NOT NULL DEFAULT 0,
    max_history_arrears INT NOT NULL DEFAULT 99,
    eligible_degrees JSONB NOT NULL DEFAULT '[]'::jsonb,
    eligible_departments JSONB NOT NULL DEFAULT '[]'::jsonb,
    eligible_graduation_years JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS job_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    stage_name VARCHAR(100) NOT NULL,
    sequence_order INT NOT NULL,
    description TEXT,
    CONSTRAINT uq_job_stage_order UNIQUE(job_id, sequence_order)
);

-- 8. APPLICATIONS & IMMUTABLE RESUME SNAPSHOT
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    status app_status NOT NULL DEFAULT 'APPLIED',
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_student_job_application UNIQUE(student_id, job_id)
);

CREATE TABLE IF NOT EXISTS application_resume_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID UNIQUE NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    original_resume_id UUID REFERENCES student_resumes(id) ON DELETE SET NULL,
    snapshot_storage_key VARCHAR(500) NOT NULL,
    file_checksum_sha256 VARCHAR(64) NOT NULL,
    file_size_bytes INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. STAGE PROGRESSION, INTERVIEWS, AND OFFERS
CREATE TABLE IF NOT EXISTS application_stage_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    job_stage_id UUID NOT NULL REFERENCES job_stages(id) ON DELETE RESTRICT,
    outcome stage_outcome NOT NULL DEFAULT 'PENDING',
    evaluator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    feedback TEXT,
    evaluated_at TIMESTAMPTZ,
    CONSTRAINT uq_app_stage UNIQUE(application_id, job_stage_id)
);

CREATE TABLE IF NOT EXISTS interviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    job_stage_id UUID NOT NULL REFERENCES job_stages(id) ON DELETE RESTRICT,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    status interview_status NOT NULL DEFAULT 'SCHEDULED',
    meeting_link VARCHAR(500),
    venue VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID UNIQUE NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
    status offer_status NOT NULL DEFAULT 'ISSUED',
    ctc_amount NUMERIC(10,2) NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    response_date TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. AUDIT AND NOTIFICATIONS
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    entity_name VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(100) NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_students_cohort ON students(graduation_year, department);
CREATE INDEX IF NOT EXISTS idx_jobs_status_deadline ON jobs(status, application_deadline);
CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_student ON applications(student_id);
CREATE INDEX IF NOT EXISTS idx_interviews_schedule ON interviews(scheduled_start, scheduled_end);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_name, entity_id);
