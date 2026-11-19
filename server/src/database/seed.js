import { initDb, db } from './db.js';
import { hashPassword, computeSha256, generateUuid } from '../utils/security.js';

export function runSeed() {
  console.log(' Initializing Database Schema...');
  initDb();

  // Check if users already seeded
  const existingAdmin = db.get(`SELECT id FROM users WHERE email = ?`, ['admin@college.edu']);
  if (existingAdmin) {
    console.log('✅ Database is already seeded. Ready for live demo!');
    return;
  }

  console.log('🌱 Seeding fresh demo baseline data matching Specification v4.0...');

  const defaultPasswordHash = hashPassword('DemoPassword123!');

  db.transaction(() => {
    // -------------------------------------------------------------
    // 1. ADMIN USER
    // -------------------------------------------------------------
    const adminId = generateUuid();
    db.run(
      `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'ADMIN', 'ACTIVE', datetime('now'), datetime('now'))`,
      [adminId, 'admin@college.edu', defaultPasswordHash]
    );

    // -------------------------------------------------------------
    // 2. COMPANIES
    // -------------------------------------------------------------
    const zohoCompanyId = generateUuid();
    db.run(
      `INSERT INTO companies (id, name, website, industry, description, logo_url, approval_status, approved_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'VERIFIED', ?, datetime('now'), datetime('now'))`,
      [
        zohoCompanyId,
        'Zoho Corporation',
        'https://www.zoho.com',
        'Enterprise SaaS & Cloud Software',
        'Zoho Corporation is a leading global technology company crafting cloud business software for 100M+ users across the globe.',
        'https://images.unsplash.com/photo-1549923746-c502d488b3ea?auto=format&fit=crop&w=200&h=200&q=80',
        adminId
      ]
    );

    const cloudscaleCompanyId = generateUuid();
    db.run(
      `INSERT INTO companies (id, name, website, industry, description, logo_url, approval_status, approved_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NULL, datetime('now'), datetime('now'))`,
      [
        cloudscaleCompanyId,
        'Cloudscale Systems',
        'https://cloudscale.io',
        'High-Performance Distributed Cloud Infrastructure',
        'Cloudscale specializes in scalable container virtualization, Kubernetes orchestration, and edge storage.',
        'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=200&h=200&q=80'
      ]
    );

    // -------------------------------------------------------------
    // 3. RECRUITER USERS & PROFILES
    // -------------------------------------------------------------
    // Recruiter 1: Zoho (Approved & Active)
    const recruiterZohoUserId = generateUuid();
    db.run(
      `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'RECRUITER', 'ACTIVE', datetime('now'), datetime('now'))`,
      [recruiterZohoUserId, 'recruiter@zoho.com', defaultPasswordHash]
    );

    db.run(
      `INSERT INTO recruiter_profiles (id, user_id, company_id, full_name, phone, designation, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        generateUuid(),
        recruiterZohoUserId,
        zohoCompanyId,
        'Sridhar Venkatesh',
        '+91 98401 22334',
        'Senior Lead Talent Acquisition Specialist'
      ]
    );

    // Recruiter 2: Cloudscale (Pending Approval)
    const recruiterCloudscaleUserId = generateUuid();
    db.run(
      `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'RECRUITER', 'PENDING', datetime('now'), datetime('now'))`,
      [recruiterCloudscaleUserId, 'hr@cloudscale.io', defaultPasswordHash]
    );

    db.run(
      `INSERT INTO recruiter_profiles (id, user_id, company_id, full_name, phone, designation, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        generateUuid(),
        recruiterCloudscaleUserId,
        cloudscaleCompanyId,
        'Ananya Roy',
        '+91 99304 88219',
        'University Relations Program Director'
      ]
    );

    // -------------------------------------------------------------
    // 4. STUDENTS (Class of 2026)
    // -------------------------------------------------------------
    // Student 1: Priya Sharma (CSE, 9.10 CGPA, 0 Arrears, VERIFIED)
    const priyaUserId = generateUuid();
    const priyaStudentId = generateUuid();
    db.run(
      `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'STUDENT', 'ACTIVE', datetime('now'), datetime('now'))`,
      [priyaUserId, 'priya.cse@college.edu', defaultPasswordHash]
    );

    db.run(
      `INSERT INTO students (
        id, user_id, register_number, full_name, phone, degree, department, specialization,
        graduation_year, current_year, completed_semesters, current_cgpa, tenth_percentage, twelfth_percentage,
        standing_arrears, history_of_arrears, verification_status, verified_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED', ?, datetime('now'), datetime('now'))`,
      [
        priyaStudentId,
        priyaUserId,
        '2022CS1042',
        'Priya Sharma',
        '+91 94451 12345',
        'B.Tech',
        'Computer Science and Engineering',
        'Artificial Intelligence & Data Systems',
        2026,
        4,
        6,
        9.10,
        95.50,
        94.00,
        0,
        0,
        adminId
      ]
    );

    // Student 2: Rajesh Kumar (ECE, 6.80 CGPA, 1 Arrear, VERIFIED) -> Ineligible Edge Case
    const rajeshUserId = generateUuid();
    const rajeshStudentId = generateUuid();
    db.run(
      `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'STUDENT', 'ACTIVE', datetime('now'), datetime('now'))`,
      [rajeshUserId, 'rajesh.ece@college.edu', defaultPasswordHash]
    );

    db.run(
      `INSERT INTO students (
        id, user_id, register_number, full_name, phone, degree, department, specialization,
        graduation_year, current_year, completed_semesters, current_cgpa, tenth_percentage, twelfth_percentage,
        standing_arrears, history_of_arrears, verification_status, verified_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED', ?, datetime('now'), datetime('now'))`,
      [
        rajeshStudentId,
        rajeshUserId,
        '2022EC2015',
        'Rajesh Kumar',
        '+91 98402 34567',
        'B.Tech',
        'Electronics and Communication Engineering',
        'VLSI & Embedded Systems',
        2026,
        4,
        6,
        6.80,
        88.00,
        86.50,
        1,
        1,
        adminId
      ]
    );

    // Student 3: Dinesh M (MECH, 8.00 CGPA, 0 Arrears, PENDING) -> Unverified Profile Edge Case
    const dineshUserId = generateUuid();
    const dineshStudentId = generateUuid();
    db.run(
      `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'STUDENT', 'ACTIVE', datetime('now'), datetime('now'))`,
      [dineshUserId, 'dinesh.mech@college.edu', defaultPasswordHash]
    );

    db.run(
      `INSERT INTO students (
        id, user_id, register_number, full_name, phone, degree, department, specialization,
        graduation_year, current_year, completed_semesters, current_cgpa, tenth_percentage, twelfth_percentage,
        standing_arrears, history_of_arrears, verification_status, verified_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NULL, datetime('now'), datetime('now'))`,
      [
        dineshStudentId,
        dineshUserId,
        '2022ME3089',
        'Dinesh M',
        '+91 97903 56789',
        'B.Tech',
        'Mechanical Engineering',
        'Robotics & Industrial Automation',
        2026,
        4,
        6,
        8.00,
        91.00,
        89.00,
        0,
        0
      ]
    );

    // -------------------------------------------------------------
    // 5. STUDENT RESUMES & MARKSHEETS
    // -------------------------------------------------------------
    const priyaResumeId = generateUuid();
    const priyaSamplePdf = Buffer.from(
      `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF`,
      'utf-8'
    );
    const priyaResumeChecksum = computeSha256(priyaSamplePdf);
    db.run(
      `INSERT INTO student_resumes (id, student_id, title, file_storage_key, file_checksum_sha256, file_size_bytes, file_data, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
      [
        priyaResumeId,
        priyaStudentId,
        'Priya_Sharma_Resume_Core_Software.pdf',
        'resumes/priya_sharma_core_sw_v1.pdf',
        priyaResumeChecksum,
        priyaSamplePdf.length,
        priyaSamplePdf
      ]
    );

    const priyaSecondResumeId = generateUuid();
    db.run(
      `INSERT INTO student_resumes (id, student_id, title, file_storage_key, file_checksum_sha256, file_size_bytes, file_data, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
      [
        priyaSecondResumeId,
        priyaStudentId,
        'Priya_Sharma_Resume_AI_ML_Specialist.pdf',
        'resumes/priya_sharma_ai_ml_v1.pdf',
        priyaResumeChecksum,
        priyaSamplePdf.length,
        priyaSamplePdf
      ]
    );

    // Documents for student vault (Marksheets)
    db.run(
      `INSERT INTO student_documents (id, student_id, document_type, title, file_storage_key, file_size_bytes, uploaded_at)
       VALUES (?, ?, 'MARKSHEET_10TH', '10th Standard Official Board Marksheet', 'docs/priya_10th.pdf', 380120, datetime('now'))`,
      [generateUuid(), priyaStudentId]
    );
    db.run(
      `INSERT INTO student_documents (id, student_id, document_type, title, file_storage_key, file_size_bytes, uploaded_at)
       VALUES (?, ?, 'MARKSHEET_12TH', '12th Standard Official Board Marksheet', 'docs/priya_12th.pdf', 412500, datetime('now'))`,
      [generateUuid(), priyaStudentId]
    );

    // Dinesh pending documents
    db.run(
      `INSERT INTO student_documents (id, student_id, document_type, title, file_storage_key, file_size_bytes, uploaded_at)
       VALUES (?, ?, 'MARKSHEET_10TH', 'Dinesh 10th Certificate', 'docs/dinesh_10th.pdf', 310400, datetime('now'))`,
      [generateUuid(), dineshStudentId]
    );

    // -------------------------------------------------------------
    // 6. JOBS & ELIGIBILITY CRITERIA & STAGES
    // -------------------------------------------------------------
    // Job 1: Zoho Member Technical Staff (Software Development)
    const zohoJobId = generateUuid();
    const deadlineFuture = new Date();
    deadlineFuture.setDate(deadlineFuture.getDate() + 25);

    db.run(
      `INSERT INTO jobs (
        id, company_id, title, description, location, work_mode, salary_package_lpa,
        application_deadline, status, created_by, approved_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'ON_SITE', 14.50, ?, 'PUBLISHED', ?, ?, datetime('now'), datetime('now'))`,
      [
        zohoJobId,
        zohoCompanyId,
        'Member Technical Staff (Software Development)',
        `Join Zoho's core product engineering teams. As an MTS, you will design, engineer, and deploy high-throughput, low-latency distributed systems powering millions of global business applications. Candidates will work with Java, C++, TypeScript, distributed databases, and high-performance Unix systems.`,
        'Chennai / Tenkasi Campus, India',
        deadlineFuture.toISOString(),
        recruiterZohoUserId,
        adminId
      ]
    );

    db.run(
      `INSERT INTO job_eligibility_criteria (
        id, job_id, criteria_version, min_cgpa, min_tenth_percentage, min_twelfth_percentage,
        max_standing_arrears, max_history_arrears, eligible_degrees, eligible_departments, eligible_graduation_years
      ) VALUES (?, ?, 1, 7.50, 75.00, 75.00, 0, 1, ?, ?, ?)`,
      [
        generateUuid(),
        zohoJobId,
        JSON.stringify(['B.Tech', 'M.Tech', 'Dual Degree']),
        JSON.stringify([
          'Computer Science and Engineering',
          'Information Technology',
          'Electronics and Communication Engineering',
          'Data Science & Artificial Intelligence'
        ]),
        JSON.stringify([2026])
      ]
    );

    const stage1Id = generateUuid();
    const stage2Id = generateUuid();
    const stage3Id = generateUuid();
    const stage4Id = generateUuid();

    db.run(
      `INSERT INTO job_stages (id, job_id, stage_name, sequence_order, description) VALUES
       (?, ?, 'Resume Screening & Profile Audit', 1, 'Initial academic and background check'),
       (?, ?, 'Technical MCQ & Coding Assessment', 2, 'DSA and Algorithms on Zoho Testing Platform'),
       (?, ?, 'Technical Round 1 (System Architecture & Coding)', 3, 'Deep-dive one-on-one technical discussion'),
       (?, ?, 'HR & Cultural Discussion & Offer', 4, 'Executive culture alignment and remuneration discussion')`,
      [stage1Id, zohoJobId, stage2Id, zohoJobId, stage3Id, zohoJobId, stage4Id, zohoJobId]
    );

    // Job 2: Zoho Cloud Infrastructure Engineer
    const zohoJob2Id = generateUuid();
    const deadlineFuture2 = new Date();
    deadlineFuture2.setDate(deadlineFuture2.getDate() + 30);

    db.run(
      `INSERT INTO jobs (
        id, company_id, title, description, location, work_mode, salary_package_lpa,
        application_deadline, status, created_by, approved_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'HYBRID', 12.00, ?, 'PUBLISHED', ?, ?, datetime('now'), datetime('now'))`,
      [
        zohoJob2Id,
        zohoCompanyId,
        'Cloud Infrastructure & DevOps Engineer',
        'Build, monitor, and scale Zoho private cloud clusters, multi-gigabit network fabrics, and secure Linux server environments.',
        'Chennai, India',
        deadlineFuture2.toISOString(),
        recruiterZohoUserId,
        adminId
      ]
    );

    db.run(
      `INSERT INTO job_eligibility_criteria (
        id, job_id, criteria_version, min_cgpa, min_tenth_percentage, min_twelfth_percentage,
        max_standing_arrears, max_history_arrears, eligible_degrees, eligible_departments, eligible_graduation_years
      ) VALUES (?, ?, 1, 7.00, 70.00, 70.00, 0, 2, ?, ?, ?)`,
      [
        generateUuid(),
        zohoJob2Id,
        JSON.stringify(['B.Tech', 'M.Tech']),
        JSON.stringify([
          'Computer Science and Engineering',
          'Information Technology',
          'Electronics and Communication Engineering',
          'Electrical and Electronics Engineering'
        ]),
        JSON.stringify([2026])
      ]
    );

    db.run(
      `INSERT INTO job_stages (id, job_id, stage_name, sequence_order, description) VALUES
       (?, ?, 'DevOps Written Test', 1, 'Linux, Networking and Scripting test'),
       (?, ?, 'Technical Interview', 2, 'Distributed Systems and Cloud Architecture')`,
      [generateUuid(), zohoJob2Id, generateUuid(), zohoJob2Id]
    );

    // Job 3: Cloudscale Systems (Draft / Pending Approval)
    const cloudscaleJobId = generateUuid();
    db.run(
      `INSERT INTO jobs (
        id, company_id, title, description, location, work_mode, salary_package_lpa,
        application_deadline, status, created_by, approved_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'REMOTE', 18.00, ?, 'PENDING_APPROVAL', ?, NULL, datetime('now'), datetime('now'))`,
      [
        cloudscaleJobId,
        cloudscaleCompanyId,
        'Distributed Systems Architect (Kernel & Storage)',
        'Work on next-generation edge storage hypervisors and low-overhead IO virtualization engines in Rust and Go.',
        'Bengaluru (Remote)',
        deadlineFuture.toISOString(),
        recruiterCloudscaleUserId
      ]
    );

    db.run(
      `INSERT INTO job_eligibility_criteria (
        id, job_id, criteria_version, min_cgpa, min_tenth_percentage, min_twelfth_percentage,
        max_standing_arrears, max_history_arrears, eligible_degrees, eligible_departments, eligible_graduation_years
      ) VALUES (?, ?, 1, 8.50, 80.00, 80.00, 0, 0, ?, ?, ?)`,
      [
        generateUuid(),
        cloudscaleJobId,
        JSON.stringify(['B.Tech', 'M.Tech']),
        JSON.stringify(['Computer Science and Engineering', 'Information Technology']),
        JSON.stringify([2026])
      ]
    );

    // -------------------------------------------------------------
    // 7. PRE-SEEDED APPLICATION WITH IMMUTABLE RESUME SNAPSHOT
    // -------------------------------------------------------------
    // Priya applied to Job 1 (Zoho MTS)
    const priyaAppId = generateUuid();
    db.run(
      `INSERT INTO applications (id, job_id, student_id, status, applied_at, updated_at)
       VALUES (?, ?, ?, 'IN_PROGRESS', datetime('now', '-5 days'), datetime('now'))`,
      [priyaAppId, zohoJobId, priyaStudentId]
    );

    // Snapshot of Priya's resume at submission time
    db.run(
      `INSERT INTO application_resume_snapshots (
        id, application_id, original_resume_id, snapshot_storage_key, file_checksum_sha256, file_size_bytes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-5 days'))`,
      [
        generateUuid(),
        priyaAppId,
        priyaResumeId,
        'resumes/snapshots/priya_sharma_core_sw_snapshot_v1.pdf',
        priyaResumeChecksum,
        245800
      ]
    );

    // Stage 1 passed
    db.run(
      `INSERT INTO application_stage_results (id, application_id, job_stage_id, outcome, evaluator_id, feedback, evaluated_at)
       VALUES (?, ?, ?, 'PASSED', ?, 'Verified academic transcripts and repository portfolio. Shortlisted for coding.', datetime('now', '-4 days'))`,
      [generateUuid(), priyaAppId, stage1Id, recruiterZohoUserId]
    );

    // Stage 2 passed
    db.run(
      `INSERT INTO application_stage_results (id, application_id, job_stage_id, outcome, evaluator_id, feedback, evaluated_at)
       VALUES (?, ?, ?, 'SHORTLISTED', ?, 'Scored 98/100 in Algorithms and Data Structures round.', datetime('now', '-2 days'))`,
      [generateUuid(), priyaAppId, stage2Id, recruiterZohoUserId]
    );

    // Upcoming interview for Stage 3
    const interviewDate = new Date();
    interviewDate.setDate(interviewDate.getDate() + 2);
    interviewDate.setHours(10, 30, 0, 0);

    const interviewEndDate = new Date(interviewDate);
    interviewEndDate.setHours(11, 45, 0, 0);

    db.run(
      `INSERT INTO interviews (
        id, application_id, job_stage_id, scheduled_start, scheduled_end, status, meeting_link, venue, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'SCHEDULED', 'https://meet.zoho.com/interview/spms-mts-7041', 'Zoho Video Conference Hall 4', 'Focus on High-throughput Distributed Queues & Concurrency.', datetime('now', '-1 days'), datetime('now'))`,
      [generateUuid(), priyaAppId, stage3Id, interviewDate.toISOString(), interviewEndDate.toISOString()]
    );

    // -------------------------------------------------------------
    // 8. AUDIT LOG INITIALIZATION
    // -------------------------------------------------------------
    db.run(
      `INSERT INTO audit_logs (id, actor_id, entity_name, entity_id, action, previous_state, new_state, ip_address, created_at)
       VALUES (?, ?, 'system', 'root', 'SYSTEM_INITIALIZED', NULL, '{"version":"4.0","status":"READY"}', '127.0.0.1', datetime('now'))`,
      [generateUuid(), adminId]
    );
  });

  console.log('========================================================================');
  console.log('🎉 SEED COMPLETED SUCCESSFULLY! DEMO CREDENTIALS LOADED:');
  console.log('========================================================================');
  console.log('ADMIN:');
  console.log('  Email:    admin@college.edu');
  console.log('  Password: DemoPassword123!');
  console.log('  Role:     ADMIN (Verified)');
  console.log('------------------------------------------------------------------------');
  console.log('RECRUITERS:');
  console.log('  1. Zoho Corporation (Approved):');
  console.log('     Email:    recruiter@zoho.com | Password: DemoPassword123!');
  console.log('  2. Cloudscale Systems (Pending Verification):');
  console.log('     Email:    hr@cloudscale.io    | Password: DemoPassword123!');
  console.log('------------------------------------------------------------------------');
  console.log('STUDENTS (Class of 2026):');
  console.log('  1. Priya Sharma (CSE, 9.10 CGPA, 0 Arrears) -> VERIFIED (Eligible)');
  console.log('     Email:    priya.cse@college.edu  | Password: DemoPassword123!');
  console.log('  2. Rajesh Kumar (ECE, 6.80 CGPA, 1 Arrear)  -> VERIFIED (Ineligible CGPA)');
  console.log('     Email:    rajesh.ece@college.edu | Password: DemoPassword123!');
  console.log('  3. Dinesh M (MECH, 8.00 CGPA, 0 Arrears)   -> PENDING (Unverified Profile)');
  console.log('     Email:    dinesh.mech@college.edu| Password: DemoPassword123!');
  console.log('========================================================================');
}

// Run directly if called as a script
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  runSeed();
}
