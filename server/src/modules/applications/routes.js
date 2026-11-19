import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../../database/db.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { generateUuid, computeSha256 } from '../../utils/security.js';
import { EligibilityEngine } from '../eligibility/engine.js';
import { ApplicationStateMachine } from './stateMachine.js';
import { logAudit, sendNotification } from '../audit/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_RESUMES_DIR = path.resolve(__dirname, '../../../uploads/resumes');
if (!fs.existsSync(UPLOADS_RESUMES_DIR)) {
  fs.mkdirSync(UPLOADS_RESUMES_DIR, { recursive: true });
}

const router = express.Router();

/**
 * POST /api/v1/applications/apply
 * Transactional Application Flow with Immutable Resume Snapshot
 */
router.post('/apply', authenticateToken, requireRole('STUDENT'), (req, res) => {
  const student = db.get(`SELECT * FROM students WHERE user_id = ?`, [req.user.id]);
  if (!student) {
    return res.status(404).json({ success: false, error: { message: 'Student profile not found.' } });
  }

  const { jobId, resumeId } = req.body;
  if (!jobId) {
    return res.status(400).json({ success: false, error: { message: 'Job ID is required.' } });
  }

  const job = db.get(`SELECT * FROM jobs WHERE id = ?`, [jobId]);
  if (!job) {
    return res.status(404).json({ success: false, error: { message: 'Job posting not found.' } });
  }

  if (job.status !== 'PUBLISHED') {
    return res.status(400).json({ success: false, error: { message: 'This job posting is not open for applications.' } });
  }

  // 1. Authoritative Server-Side Cut-off Evaluation
  const criteria = db.get(`SELECT * FROM job_eligibility_criteria WHERE job_id = ?`, [job.id]);
  if (!criteria) {
    return res.status(400).json({ success: false, error: { message: 'Eligibility criteria not found for this job.' } });
  }

  const evalResult = EligibilityEngine.evaluate({
    student,
    criteria,
    jobDeadline: job.application_deadline,
    jobTitle: job.title
  });

  if (!evalResult.eligible) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'ELIGIBILITY_FAILED',
        message: 'You do not meet the minimum eligibility criteria for this opening.',
        blockers: evalResult.blockers,
        checks: evalResult.checks
      }
    });
  }

  // 2. Prevent Duplicate Application Check
  const existing = db.get(`SELECT id FROM applications WHERE student_id = ? AND job_id = ?`, [student.id, job.id]);
  if (existing) {
    return res.status(409).json({
      success: false,
      error: { code: 'DUPLICATE_APPLICATION', message: 'You have already submitted an application for this job.' }
    });
  }

  // 3. Locate Resume to Freeze
  let resume = null;
  if (resumeId) {
    resume = db.get(`SELECT * FROM student_resumes WHERE id = ? AND student_id = ? AND deleted_at IS NULL`, [resumeId, student.id]);
  }
  if (!resume) {
    // Pick default active resume
    resume = db.get(`SELECT * FROM student_resumes WHERE student_id = ? AND is_default = 1 AND deleted_at IS NULL`, [student.id]);
  }
  if (!resume) {
    // Pick any active resume
    resume = db.get(`SELECT * FROM student_resumes WHERE student_id = ? AND deleted_at IS NULL LIMIT 1`, [student.id]);
  }

  if (!resume) {
    return res.status(400).json({
      success: false,
      error: { code: 'RESUME_REQUIRED', message: 'Please upload at least one resume before submitting an application.' }
    });
  }

  const applicationId = generateUuid();
  const snapshotId = generateUuid();

  // Obtain the exact authentic PDF binary buffer from DB or disk
  let resumePdfBuffer = null;
  if (resume.file_data) {
    resumePdfBuffer = Buffer.from(resume.file_data);
  } else if (resume.file_storage_key && fs.existsSync(resume.file_storage_key)) {
    try {
      resumePdfBuffer = fs.readFileSync(resume.file_storage_key);
      // Backfill student_resumes so it is permanently in DB
      db.run(`UPDATE student_resumes SET file_data = ? WHERE id = ?`, [resumePdfBuffer, resume.id]);
    } catch (readErr) {
      console.warn('[Resume Read Error]', readErr.message);
    }
  }

  // Reject if resume does not contain genuine binary content (NEVER inject fake %PDF placeholder)
  if (!resumePdfBuffer || resumePdfBuffer.length < 50) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_RESUME_BINARY',
        message: `The selected resume "${resume.title}" does not contain verified PDF file data. Please re-upload your authentic PDF resume in the Resume Vault before submitting an application.`
      }
    });
  }

  const checksum = computeSha256(resumePdfBuffer);
  const sizeBytes = resumePdfBuffer.length;

  let snapshotKey = `snapshots/app_${applicationId}_resume_${resume.id}.pdf`;
  try {
    const snapDiskPath = path.join(UPLOADS_RESUMES_DIR, `snap_${snapshotId}_${resume.id}.pdf`);
    fs.writeFileSync(snapDiskPath, resumePdfBuffer);
    snapshotKey = snapDiskPath;
  } catch (fsErr) {
    console.error('[Snapshot Copy Error]', fsErr);
  }

  try {
    db.transaction(() => {
      // Create Application
      db.run(
        `INSERT INTO applications (id, job_id, student_id, status, applied_at, updated_at)
         VALUES (?, ?, ?, 'APPLIED', datetime('now'), datetime('now'))`,
        [applicationId, job.id, student.id]
      );

      // Freeze Immutable Resume Snapshot
      db.run(
        `INSERT INTO application_resume_snapshots (
          id, application_id, original_resume_id, snapshot_storage_key, file_checksum_sha256, file_size_bytes, file_data, file_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [snapshotId, applicationId, resume.id, snapshotKey, checksum, sizeBytes, resumePdfBuffer, resume.title]
      );

      // Initialize first stage result as PENDING
      const firstStage = db.get(`SELECT id FROM job_stages WHERE job_id = ? ORDER BY sequence_order ASC LIMIT 1`, [job.id]);
      if (firstStage) {
        db.run(
          `INSERT INTO application_stage_results (id, application_id, job_stage_id, outcome)
           VALUES (?, ?, ?, 'PENDING')`,
          [generateUuid(), applicationId, firstStage.id]
        );
      }
    });

    logAudit({
      actorId: req.user.id,
      entityName: 'applications',
      entityId: applicationId,
      action: 'APPLICATION_SUBMITTED',
      newState: { jobId: job.id, snapshotKey, checksum },
      ipAddress: req.ip
    });

    const companyRecruiter = db.get(`
      SELECT r.user_id FROM recruiter_profiles r WHERE r.company_id = ?
    `, [job.company_id]);

    if (companyRecruiter) {
      sendNotification({
        userId: companyRecruiter.user_id,
        title: 'New Candidate Applied',
        message: `${student.full_name} (${student.department}) applied for '${job.title}'.`
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Application submitted successfully! Your resume snapshot has been securely frozen for evaluation.',
      data: {
        applicationId,
        jobId: job.id,
        status: 'APPLIED',
        snapshotChecksum: checksum,
        submittedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { message: err.message } });
  }
});

/**
 * GET /api/v1/applications/my-applications
 * Student views all applications submitted with live stage progression
 */
router.get('/my-applications', authenticateToken, requireRole('STUDENT'), (req, res) => {
  const student = db.get(`SELECT id FROM students WHERE user_id = ?`, [req.user.id]);
  if (!student) {
    return res.status(404).json({ success: false, error: { message: 'Student profile not found.' } });
  }

  const applications = db.all(`
    SELECT a.*, j.title as job_title, j.location as job_location, j.work_mode, j.salary_package_lpa,
           c.name as company_name, c.logo_url as company_logo,
           s.snapshot_storage_key, s.file_checksum_sha256,
           o.id as offer_id, o.status as offer_status, o.ctc_amount as offer_ctc
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    JOIN companies c ON j.company_id = c.id
    LEFT JOIN application_resume_snapshots s ON a.id = s.application_id
    LEFT JOIN offers o ON a.id = o.application_id
    WHERE a.student_id = ?
    ORDER BY a.applied_at DESC
  `, [student.id]);

  // Attach stage results for each application
  const result = applications.map((app) => {
    const stages = db.all(`
      SELECT js.id, js.stage_name, js.sequence_order, js.description,
             asr.outcome, asr.feedback, asr.evaluated_at
      FROM job_stages js
      LEFT JOIN application_stage_results asr ON js.id = asr.job_stage_id AND asr.application_id = ?
      WHERE js.job_id = ?
      ORDER BY js.sequence_order ASC
    `, [app.id, app.job_id]);

    const interview = db.get(`
      SELECT i.*, js.stage_name
      FROM interviews i
      JOIN job_stages js ON i.job_stage_id = js.id
      WHERE i.application_id = ? AND i.status = 'SCHEDULED'
      ORDER BY i.scheduled_start DESC
      LIMIT 1
    `, [app.id]);

    const enhancedStages = stages.map(st => {
      if (interview && interview.job_stage_id === st.id && (!st.outcome || st.outcome === 'PENDING')) {
        return { ...st, outcome: 'SCHEDULED' };
      }
      return st;
    });

    return {
      ...app,
      stages: enhancedStages,
      upcomingInterview: interview || null
    };
  });

  return res.json({ success: true, data: result });
});

/**
 * GET /api/v1/applications/job/:jobId
 * Recruiter views applicant list for their company job (Protected with IDOR check)
 */
router.get('/job/:jobId', authenticateToken, requireRole('RECRUITER', 'ADMIN'), (req, res) => {
  const isAll = req.params.jobId === 'ALL' || req.params.jobId === 'all';

  let companyId = null;
  let recruiter = null;
  if (req.user.role === 'RECRUITER') {
    recruiter = db.get(`SELECT company_id FROM recruiter_profiles WHERE user_id = ?`, [req.user.id]);
    if (!recruiter) {
      return res.status(403).json({ success: false, error: { message: 'Recruiter profile not found.' } });
    }
    companyId = recruiter.company_id;
  }

  let job = null;
  let jobIds = [];

  if (isAll) {
    const companyJobs = companyId
      ? db.all(`SELECT id, title, company_id FROM jobs WHERE company_id = ?`, [companyId])
      : db.all(`SELECT id, title, company_id FROM jobs`);
    jobIds = companyJobs.map(j => j.id);
    job = { id: 'ALL', title: 'All Drives', company_id: companyId };
  } else {
    job = db.get(`SELECT * FROM jobs WHERE id = ?`, [req.params.jobId]);
    if (!job) {
      return res.status(404).json({ success: false, error: { message: 'Job not found.' } });
    }

    // IDOR Protection: If recruiter, must own the company job
    if (companyId && recruiter.company_id !== job.company_id) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN_JOB', message: 'You cannot view applicants for another company\'s job opening.' } });
    }
    jobIds = [job.id];
  }

  if (jobIds.length === 0) {
    return res.json({
      success: true,
      data: {
        job: job || { id: 'ALL', title: 'All Drives' },
        stages: [],
        applicants: []
      }
    });
  }

  const placeholders = jobIds.map(() => '?').join(',');

  const applicants = db.all(`
    SELECT a.*,
           j.title as job_title,
           s.register_number, s.full_name as student_name, s.department, s.degree, s.graduation_year,
           s.current_cgpa, s.tenth_percentage, s.twelfth_percentage, s.standing_arrears,
           u.email as student_email,
           snap.id as snapshot_id, snap.snapshot_storage_key, snap.file_checksum_sha256, snap.file_size_bytes,
           o.id as offer_id, o.status as offer_status, o.ctc_amount as offer_ctc,
           o.custom_company_name as offer_company_name, o.custom_designation as offer_designation
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    JOIN students s ON a.student_id = s.id
    JOIN users u ON s.user_id = u.id
    LEFT JOIN application_resume_snapshots snap ON a.id = snap.application_id
    LEFT JOIN offers o ON a.id = o.application_id
    WHERE a.job_id IN (${placeholders})
    ORDER BY a.applied_at DESC
  `, jobIds);

  const stages = db.all(`SELECT * FROM job_stages WHERE job_id IN (${placeholders}) ORDER BY sequence_order ASC`, jobIds);

  const enhanced = applicants.map((app) => {
    const appStages = stages.filter(st => st.job_id === app.job_id);

    const rawStageResults = db.all(`
      SELECT asr.*, js.stage_name, js.sequence_order
      FROM application_stage_results asr
      JOIN job_stages js ON asr.job_stage_id = js.id
      WHERE asr.application_id = ?
      ORDER BY js.sequence_order ASC
    `, [app.id]);

    const scheduledInterviews = db.all(`
      SELECT i.*, js.stage_name, js.sequence_order
      FROM interviews i
      JOIN job_stages js ON i.job_stage_id = js.id
      WHERE i.application_id = ? AND i.status = 'SCHEDULED'
      ORDER BY i.scheduled_start DESC
    `, [app.id]);

    const activeInterview = scheduledInterviews[0] || null;

    // Merge stage results and active interview statuses
    const stageMap = new Map();
    rawStageResults.forEach(sr => stageMap.set(sr.job_stage_id, { ...sr }));

    scheduledInterviews.forEach(inv => {
      const existingSr = stageMap.get(inv.job_stage_id);
      if (!existingSr) {
        stageMap.set(inv.job_stage_id, {
          id: inv.id,
          application_id: app.id,
          job_stage_id: inv.job_stage_id,
          stage_name: inv.stage_name,
          sequence_order: inv.sequence_order,
          outcome: 'SCHEDULED',
          scheduled_start: inv.scheduled_start
        });
      } else if (existingSr.outcome === 'PENDING') {
        existingSr.outcome = 'SCHEDULED';
        existingSr.scheduled_start = inv.scheduled_start;
      }
    });

    const stageResults = Array.from(stageMap.values()).sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));

    return {
      ...app,
      stages: appStages,
      stageResults,
      activeInterview
    };
  });

  return res.json({
    success: true,
    data: {
      job,
      stages,
      applicants: enhanced
    }
  });
});

/**
 * PUT /api/v1/applications/:id/stage-result
 * Recruiter updates outcome for a specific stage (Shortlisted, Passed, Rejected, On Hold)
 */
router.put('/:id/stage-result', authenticateToken, requireRole('RECRUITER', 'ADMIN'), (req, res) => {
  const { stageId, outcome, feedback } = req.body;
  if (!stageId || !outcome) {
    return res.status(400).json({ success: false, error: { message: 'stageId and outcome are required.' } });
  }

  const app = db.get(`
    SELECT a.*, j.company_id, j.title as job_title, s.user_id as student_user_id
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    JOIN students s ON a.student_id = s.id
    WHERE a.id = ?
  `, [req.params.id]);

  if (!app) {
    return res.status(404).json({ success: false, error: { message: 'Application not found.' } });
  }

  if (req.user.role === 'RECRUITER') {
    const recruiter = db.get(`SELECT company_id FROM recruiter_profiles WHERE user_id = ?`, [req.user.id]);
    if (!recruiter || recruiter.company_id !== app.company_id) {
      return res.status(403).json({ success: false, error: { message: 'Access denied.' } });
    }
  }

  const existingResult = db.get(`SELECT id FROM application_stage_results WHERE application_id = ? AND job_stage_id = ?`, [app.id, stageId]);

  db.transaction(() => {
    if (existingResult) {
      db.run(
        `UPDATE application_stage_results
         SET outcome = ?, evaluator_id = ?, feedback = ?, evaluated_at = datetime('now')
         WHERE id = ?`,
        [outcome, req.user.id, feedback || null, existingResult.id]
      );
    } else {
      db.run(
        `INSERT INTO application_stage_results (id, application_id, job_stage_id, outcome, evaluator_id, feedback, evaluated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [generateUuid(), app.id, stageId, outcome, req.user.id, feedback || null]
      );
    }

    // Mark any scheduled interview for this stage as COMPLETED
    db.run(
      `UPDATE interviews SET status = 'COMPLETED', updated_at = datetime('now')
       WHERE application_id = ? AND job_stage_id = ? AND status = 'SCHEDULED'`,
      [app.id, stageId]
    );

    // If candidate is rejected in a round, transition state machine to REJECTED
    if (outcome === 'REJECTED' && app.status !== 'REJECTED') {
      db.run(`UPDATE applications SET status = 'REJECTED', updated_at = datetime('now') WHERE id = ?`, [app.id]);
    } else if ((outcome === 'SHORTLISTED' || outcome === 'PASSED') && app.status === 'APPLIED') {
      db.run(`UPDATE applications SET status = 'IN_PROGRESS', updated_at = datetime('now') WHERE id = ?`, [app.id]);
    }
  });

  logAudit({
    actorId: req.user.id,
    entityName: 'application_stage_results',
    entityId: app.id,
    action: `STAGE_EVALUATION_${outcome}`,
    newState: { stageId, outcome, feedback },
    ipAddress: req.ip
  });

  sendNotification({
    userId: app.student_user_id,
    title: `Application Update: ${app.job_title}`,
    message: `Your stage evaluation result has been updated to: ${outcome}. Feedback: ${feedback || 'No comments'}`
  });

  return res.json({ success: true, message: `Stage evaluation recorded as ${outcome}.` });
});

/**
 * PUT /api/v1/applications/:id/status
 * Explicit State Machine Transition
 */
router.put('/:id/status', authenticateToken, requireRole('RECRUITER', 'ADMIN'), (req, res) => {
  const { status, notes } = req.body;
  try {
    const result = ApplicationStateMachine.transition({
      applicationId: req.params.id,
      newStatus: status,
      actorId: req.user.id,
      notes,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: `Application transitioned to ${status}`,
      data: result
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: { code: 'TRANSITION_FAILED', message: err.message }
    });
  }
});

export default router;
