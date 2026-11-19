import express from 'express';
import { db } from '../../database/db.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { generateUuid } from '../../utils/security.js';
import { EligibilityEngine } from '../eligibility/engine.js';
import { logAudit, sendNotification } from '../audit/logger.js';

const router = express.Router();

/**
 * GET /api/v1/jobs
 * Lists jobs filtered by role and status
 */
router.get('/', authenticateToken, (req, res) => {
  const { role, id: userId } = req.user;
  let sql = '';
  let params = [];

  if (role === 'STUDENT') {
    // Students only see PUBLISHED jobs
    sql = `
      SELECT j.*, c.name as company_name, c.logo_url as company_logo, c.industry,
        cr.min_cgpa, cr.max_graduation_year,
        (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) as applicant_count,
        (SELECT a.status FROM applications a JOIN students s ON a.student_id = s.id WHERE a.job_id = j.id AND s.user_id = ?) as my_application_status
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      LEFT JOIN job_eligibility_criteria cr ON cr.job_id = j.id
      WHERE j.status = 'PUBLISHED'
      ORDER BY j.created_at DESC
    `;
    params = [userId];
  } else if (role === 'RECRUITER') {
    // Recruiters see own company jobs with authoritative criteria
    sql = `
      SELECT j.*, c.name as company_name, c.logo_url as company_logo,
        cr.min_cgpa, cr.min_tenth_percentage, cr.min_twelfth_percentage, cr.max_standing_arrears, cr.max_graduation_year,
        (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) as applicant_count
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      JOIN recruiter_profiles r ON r.company_id = c.id
      LEFT JOIN job_eligibility_criteria cr ON cr.job_id = j.id
      WHERE r.user_id = ?
      ORDER BY j.created_at DESC
    `;
    params = [userId];
  } else if (role === 'ADMIN') {
    // Admin sees all jobs across companies with corporate verification status
    sql = `
      SELECT j.*, c.name as company_name, c.logo_url as company_logo, c.approval_status as company_approval_status,
        cr.min_cgpa, cr.min_tenth_percentage, cr.min_twelfth_percentage, cr.max_standing_arrears, cr.max_graduation_year,
        (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) as applicant_count
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      LEFT JOIN job_eligibility_criteria cr ON cr.job_id = j.id
      ORDER BY j.created_at DESC
    `;
  }

  const jobs = db.all(sql, params);
  return res.json({ success: true, data: jobs });
});

/**
 * GET /api/v1/jobs/:id
 * Fetches full job detail including eligibility rules and recruitment stages
 */
router.get('/:id', authenticateToken, (req, res) => {
  const job = db.get(`
    SELECT j.*, c.name as company_name, c.website as company_website, c.description as company_description, c.logo_url as company_logo
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    WHERE j.id = ?
  `, [req.params.id]);

  if (!job) {
    return res.status(404).json({ success: false, error: { message: 'Job posting not found.' } });
  }

  const criteria = db.get(`SELECT * FROM job_eligibility_criteria WHERE job_id = ?`, [job.id]);
  const stages = db.all(`SELECT * FROM job_stages WHERE job_id = ? ORDER BY sequence_order ASC`, [job.id]);

  let myApplication = null;
  if (req.user.role === 'STUDENT') {
    const student = db.get(`SELECT id FROM students WHERE user_id = ?`, [req.user.id]);
    if (student) {
      myApplication = db.get(`
        SELECT a.*, s.snapshot_storage_key, s.file_checksum_sha256
        FROM applications a
        LEFT JOIN application_resume_snapshots s ON a.id = s.application_id
        WHERE a.job_id = ? AND a.student_id = ?
      `, [job.id, student.id]);
    }
  }

  return res.json({
    success: true,
    data: {
      job,
      criteria: criteria ? {
        ...criteria,
        eligible_degrees: JSON.parse(criteria.eligible_degrees || '[]'),
        eligible_departments: JSON.parse(criteria.eligible_departments || '[]'),
        eligible_graduation_years: JSON.parse(criteria.eligible_graduation_years || '[]')
      } : null,
      stages,
      myApplication
    }
  });
});

/**
 * POST /api/v1/jobs
 * Recruiter posts a new job opening with dynamic criteria & stages
 */
router.post('/', authenticateToken, requireRole('RECRUITER'), (req, res) => {
  const recruiter = db.get(`
    SELECT r.company_id, c.approval_status
    FROM recruiter_profiles r
    JOIN companies c ON r.company_id = c.id
    WHERE r.user_id = ?
  `, [req.user.id]);

  if (!recruiter) {
    return res.status(403).json({ success: false, error: { message: 'Recruiter profile not configured.' } });
  }

  const {
    title,
    description,
    location,
    workMode = 'ON_SITE',
    salaryPackageLpa,
    applicationDeadline,
    minCgpa = 6.0,
    minTenthPercentage = 60.0,
    minTwelfthPercentage = 60.0,
    maxStandingArrears = 0,
    maxHistoryArrears = 99,
    eligibleDegrees = ['B.Tech'],
    eligibleDepartments = ['Aerospace Engineering', 'Computer Science and Engineering', 'Mechanical Engineering'],
    eligibleGraduationYears = [2026],
    maxGraduationYear = 2030,
    stages = [
      { name: 'Resume Screening', order: 1, description: 'Academic profile review' },
      { name: 'Technical Interview', order: 2, description: 'Core problem solving & systems round' },
      { name: 'HR & Final Offer', order: 3, description: 'Culture fit & compensation discussion' }
    ]
  } = req.body;

  let cleanEligibleDepts = Array.isArray(eligibleDepartments) ? [...eligibleDepartments] : ['Aerospace Engineering', 'Computer Science and Engineering'];
  if (!cleanEligibleDepts.some(d => String(d).toLowerCase().includes('aerospace'))) {
    cleanEligibleDepts.unshift('Aerospace Engineering');
  }

  if (!title || !description || !location || !applicationDeadline) {
    return res.status(400).json({ success: false, error: { message: 'Mandatory job posting fields missing.' } });
  }

  const parsedMaxGradYear = maxGraduationYear !== undefined && maxGraduationYear !== null && maxGraduationYear !== ''
    ? parseInt(maxGraduationYear, 10)
    : null;

  const jobId = generateUuid();
  // All newly submitted job openings require Placement Directorate approval before publishing
  const initialStatus = 'PENDING_APPROVAL';

  db.transaction(() => {
    db.run(
      `INSERT INTO jobs (
        id, company_id, title, description, location, work_mode, salary_package_lpa,
        application_deadline, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        jobId,
        recruiter.company_id,
        title.trim(),
        description.trim(),
        location.trim(),
        workMode,
        parseFloat(salaryPackageLpa || 0),
        new Date(applicationDeadline).toISOString(),
        initialStatus,
        req.user.id
      ]
    );

    // Save criteria
    db.run(
      `INSERT INTO job_eligibility_criteria (
        id, job_id, criteria_version, min_cgpa, min_tenth_percentage, min_twelfth_percentage,
        max_standing_arrears, max_history_arrears, eligible_degrees, eligible_departments, eligible_graduation_years,
        max_graduation_year
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        generateUuid(),
        jobId,
        parseFloat(minCgpa),
        parseFloat(minTenthPercentage),
        parseFloat(minTwelfthPercentage),
        parseInt(maxStandingArrears, 10),
        parseInt(maxHistoryArrears, 10),
        JSON.stringify(eligibleDegrees),
        JSON.stringify(cleanEligibleDepts),
        JSON.stringify(eligibleGraduationYears.map(Number)),
        parsedMaxGradYear
      ]
    );

    // Save stages
    stages.forEach((st, idx) => {
      db.run(
        `INSERT INTO job_stages (id, job_id, stage_name, sequence_order, description)
         VALUES (?, ?, ?, ?, ?)`,
        [generateUuid(), jobId, st.name || `Stage ${idx + 1}`, st.order || (idx + 1), st.description || '']
      );
    });
  });

  logAudit({
    actorId: req.user.id,
    entityName: 'jobs',
    entityId: jobId,
    action: 'JOB_CREATED',
    newState: { title, status: initialStatus },
    ipAddress: req.ip
  });

  // Notify placement admins about new job opening requiring approval
  try {
    const company = db.get(`SELECT name FROM companies WHERE id = ?`, [recruiter.company_id]);
    const companyName = company?.name || 'A corporate partner';
    const admins = db.all(`SELECT id FROM users WHERE role = 'ADMIN'`);

    admins.forEach((adm) => {
      sendNotification({
        userId: adm.id,
        title: '💼 New Job Opening Pending Approval',
        message: `${companyName} has created a new job opening '${title.trim()}'. Please review and approve this drive before publishing to students.`
      });
    });
  } catch (notifErr) {
    console.error('[Admin Job Notification Error]', notifErr);
  }

  const created = db.get(`SELECT * FROM jobs WHERE id = ?`, [jobId]);
  return res.status(201).json({
    success: true,
    message: 'Job opening created and submitted for Placement Cell approval.',
    data: created
  });
});

/**
 * PUT /api/v1/jobs/:id/approve
 * Admin approves pending job posting
 */
router.put('/:id/approve', authenticateToken, requireRole('ADMIN'), (req, res) => {
  const job = db.get(`SELECT * FROM jobs WHERE id = ?`, [req.params.id]);
  if (!job) {
    return res.status(404).json({ success: false, error: { message: 'Job not found.' } });
  }

  // Authoritative check: Corporate partner must be VERIFIED before job posting can be approved
  const company = db.get(`SELECT id, name, approval_status FROM companies WHERE id = ?`, [job.company_id]);
  if (!company) {
    return res.status(400).json({ success: false, error: { message: 'Associated corporate partner not found.' } });
  }

  if (company.approval_status !== 'VERIFIED') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'CORPORATE_APPROVAL_REQUIRED',
        message: `Cannot approve job posting: Corporate partner "${company.name}" has not been approved yet (Status: ${company.approval_status}). Please approve the company under CROP Approvals tab first.`
      }
    });
  }

  db.run(
    `UPDATE jobs SET status = 'PUBLISHED', approved_by = ?, updated_at = datetime('now') WHERE id = ?`,
    [req.user.id, job.id]
  );

  logAudit({
    actorId: req.user.id,
    entityName: 'jobs',
    entityId: job.id,
    action: 'JOB_APPROVED',
    previousState: { status: job.status },
    newState: { status: 'PUBLISHED' },
    ipAddress: req.ip
  });

  // Broadcast notification alert to all students on admin approval
  try {
    const company = db.get(`SELECT name FROM companies WHERE id = ?`, [job.company_id]);
    const companyName = company?.name || 'A partner company';
    const students = db.all(`SELECT user_id FROM students`);
    const deadlineFormatted = new Date(job.application_deadline).toLocaleDateString();

    students.forEach((st) => {
      sendNotification({
        userId: st.user_id,
        title: `📢 New Campus Drive Approved: ${companyName}`,
        message: `${companyName} drive for '${job.title}' (₹${job.salary_package_lpa} LPA) is now officially approved and open for applications! Apply before ${deadlineFormatted}.`
      });
    });

    if (job.created_by) {
      sendNotification({
        userId: job.created_by,
        title: `✅ Job Opening Approved: ${job.title}`,
        message: `Your campus drive '${job.title}' has been reviewed and approved by the Placement Cell. It is now published to eligible students.`
      });
    }
  } catch (notifErr) {
    console.error('[Notification Dispatch Error]', notifErr);
  }

  return res.json({ success: true, message: `Job '${job.title}' is now PUBLISHED and visible to eligible students.` });
});

/**
 * PUT /api/v1/jobs/:id
 * Recruiter updates job details, compensation, deadline, or cut-off criteria
 */
router.put('/:id', authenticateToken, requireRole('RECRUITER'), (req, res) => {
  const recruiter = db.get(`SELECT company_id FROM recruiter_profiles WHERE user_id = ?`, [req.user.id]);
  if (!recruiter) {
    return res.status(403).json({ success: false, error: { message: 'Recruiter profile not linked.' } });
  }

  const job = db.get(`SELECT * FROM jobs WHERE id = ? AND company_id = ?`, [req.params.id, recruiter.company_id]);
  if (!job) {
    return res.status(404).json({ success: false, error: { message: 'Job opening not found or unauthorized.' } });
  }

  const {
    title = job.title,
    description = job.description,
    location = job.location,
    workMode = job.work_mode,
    salaryPackageLpa = job.salary_package_lpa,
    applicationDeadline = job.application_deadline,
    status = job.status,
    minCgpa,
    minTenthPercentage,
    minTwelfthPercentage,
    maxStandingArrears,
    maxHistoryArrears,
    maxGraduationYear
  } = req.body;

  db.transaction(() => {
    db.run(
      `UPDATE jobs
       SET title = ?, description = ?, location = ?, work_mode = ?, salary_package_lpa = ?,
           application_deadline = ?, status = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        title.trim(),
        description.trim(),
        location.trim(),
        workMode,
        parseFloat(salaryPackageLpa || 0),
        new Date(applicationDeadline).toISOString(),
        status,
        job.id
      ]
    );

    if (minCgpa !== undefined || maxStandingArrears !== undefined || maxGraduationYear !== undefined) {
      db.run(
        `UPDATE job_eligibility_criteria
         SET min_cgpa = COALESCE(?, min_cgpa),
             min_tenth_percentage = COALESCE(?, min_tenth_percentage),
             min_twelfth_percentage = COALESCE(?, min_twelfth_percentage),
             max_standing_arrears = COALESCE(?, max_standing_arrears),
             max_history_arrears = COALESCE(?, max_history_arrears),
             max_graduation_year = COALESCE(?, max_graduation_year)
         WHERE job_id = ?`,
        [
          minCgpa !== undefined ? parseFloat(minCgpa) : null,
          minTenthPercentage !== undefined ? parseFloat(minTenthPercentage) : null,
          minTwelfthPercentage !== undefined ? parseFloat(minTwelfthPercentage) : null,
          maxStandingArrears !== undefined ? parseInt(maxStandingArrears, 10) : null,
          maxHistoryArrears !== undefined ? parseInt(maxHistoryArrears, 10) : null,
          maxGraduationYear !== undefined && maxGraduationYear !== '' ? parseInt(maxGraduationYear, 10) : null,
          job.id
        ]
      );
    }
  });

  logAudit({
    actorId: req.user.id,
    entityName: 'jobs',
    entityId: job.id,
    action: 'JOB_UPDATED',
    newState: { title, salaryPackageLpa, status },
    ipAddress: req.ip
  });

  const updated = db.get(`SELECT * FROM jobs WHERE id = ?`, [job.id]);
  return res.json({ success: true, message: 'Campus job opening updated successfully.', data: updated });
});

/**
 * DELETE /api/v1/jobs/:id
 * Recruiter closes or deletes job opening
 */
router.delete('/:id', authenticateToken, requireRole('RECRUITER'), (req, res) => {
  const recruiter = db.get(`SELECT company_id FROM recruiter_profiles WHERE user_id = ?`, [req.user.id]);
  if (!recruiter) {
    return res.status(403).json({ success: false, error: { message: 'Recruiter profile not linked.' } });
  }

  const job = db.get(`SELECT * FROM jobs WHERE id = ? AND company_id = ?`, [req.params.id, recruiter.company_id]);
  if (!job) {
    return res.status(404).json({ success: false, error: { message: 'Job opening not found or unauthorized.' } });
  }

  const appCount = db.get(`SELECT COUNT(*) as count FROM applications WHERE job_id = ?`, [job.id])?.count || 0;

  if (appCount > 0) {
    db.run(`UPDATE jobs SET status = 'CLOSED', updated_at = datetime('now') WHERE id = ?`, [job.id]);
    return res.json({
      success: true,
      message: `Drive has ${appCount} active candidate application(s). Drive status successfully moved to CLOSED.`
    });
  } else {
    db.transaction(() => {
      db.run(`DELETE FROM job_eligibility_criteria WHERE job_id = ?`, [job.id]);
      db.run(`DELETE FROM job_stages WHERE job_id = ?`, [job.id]);
      db.run(`DELETE FROM jobs WHERE id = ?`, [job.id]);
    });
    return res.json({ success: true, message: `Job opening '${job.title}' deleted successfully.` });
  }
});

/**
 * GET /api/v1/jobs/:id/check-eligibility
 * Student calls server-side Eligibility Engine
 */
router.get('/:id/check-eligibility', authenticateToken, requireRole('STUDENT'), (req, res) => {
  const student = db.get(`SELECT * FROM students WHERE user_id = ?`, [req.user.id]);
  if (!student) {
    return res.status(404).json({ success: false, error: { message: 'Student profile not found.' } });
  }

  const job = db.get(`SELECT id, title, application_deadline, status FROM jobs WHERE id = ?`, [req.params.id]);
  if (!job) {
    return res.status(404).json({ success: false, error: { message: 'Job opening not found.' } });
  }

  const criteria = db.get(`SELECT * FROM job_eligibility_criteria WHERE job_id = ?`, [job.id]);
  if (!criteria) {
    return res.status(404).json({ success: false, error: { message: 'Eligibility criteria not configured for this job.' } });
  }

  const result = EligibilityEngine.evaluate({
    student,
    criteria,
    jobDeadline: job.application_deadline,
    jobTitle: job.title
  });

  // Also check if already applied
  const existingApp = db.get(`SELECT id, status, applied_at FROM applications WHERE job_id = ? AND student_id = ?`, [job.id, student.id]);

  return res.json({
    success: true,
    data: {
      ...result,
      alreadyApplied: !!existingApp,
      existingApplication: existingApp
    }
  });
});

export default router;
