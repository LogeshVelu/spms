import express from 'express';
import { db } from '../../database/db.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { generateUuid } from '../../utils/security.js';
import { logAudit, sendNotification } from '../audit/logger.js';

const router = express.Router();

/**
 * POST /api/v1/interviews/schedule
 * Recruiter schedules an interview with Candidate Clash / Conflict Detection and Deduplication
 */
router.post('/schedule', authenticateToken, requireRole('RECRUITER', 'ADMIN'), (req, res) => {
  const { applicationId, jobStageId, scheduledStart, scheduledEnd, meetingLink, venue, notes } = req.body;

  if (!applicationId || !jobStageId || !scheduledStart || !scheduledEnd) {
    return res.status(400).json({ success: false, error: { message: 'Missing mandatory interview schedule fields.' } });
  }

  const startDate = new Date(scheduledStart);
  const endDate = new Date(scheduledEnd);

  if (endDate <= startDate) {
    return res.status(400).json({ success: false, error: { message: 'Interview end time must be after start time.' } });
  }

  const app = db.get(`
    SELECT a.*, s.id as student_id, s.full_name as student_name, s.user_id as student_user_id,
           j.title as job_title, c.name as company_name
    FROM applications a
    JOIN students s ON a.student_id = s.id
    JOIN jobs j ON a.job_id = j.id
    JOIN companies c ON j.company_id = c.id
    WHERE a.id = ?
  `, [applicationId]);

  if (!app) {
    return res.status(404).json({ success: false, error: { message: 'Application not found.' } });
  }

  const newStartIso = startDate.toISOString();
  const newEndIso = endDate.toISOString();
  const newLink = meetingLink ? meetingLink.trim() : null;
  const newVenue = venue ? venue.trim() : 'Campus Virtual Conference Room';
  const newNotes = notes ? notes.trim() : null;

  // Check if an interview already exists for this application and stage
  const existingInterview = db.get(`
    SELECT * FROM interviews
    WHERE application_id = ? AND job_stage_id = ?
  `, [applicationId, jobStageId]);

  if (existingInterview) {
    // Check if incoming details are completely identical
    const isSame =
      new Date(existingInterview.scheduled_start).getTime() === startDate.getTime() &&
      new Date(existingInterview.scheduled_end).getTime() === endDate.getTime() &&
      (existingInterview.meeting_link || null) === newLink &&
      (existingInterview.venue || null) === newVenue &&
      (existingInterview.notes || null) === newNotes;

    if (isSame) {
      // Reject duplicate insert: interview is already scheduled with identical record
      return res.status(200).json({
        success: true,
        message: 'Interview is already scheduled with these exact details.',
        data: existingInterview
      });
    }

    // Details changed (time, venue, link, notes) -> Update existing record
    // Candidate Clash Detection: Check if candidate has overlapping interview (excluding this interview)
    const conflict = db.get(`
      SELECT i.*, j.title as conflicting_job, c.name as conflicting_company
      FROM interviews i
      JOIN applications a ON i.application_id = a.id
      JOIN jobs j ON a.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      WHERE a.student_id = ?
        AND i.id != ?
        AND i.status = 'SCHEDULED'
        AND (datetime(?) < datetime(i.scheduled_end) AND datetime(?) > datetime(i.scheduled_start))
    `, [app.student_id, existingInterview.id, newEndIso, newStartIso]);

    if (conflict) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'INTERVIEW_COLLISION',
          message: `Schedule conflict detected! ${app.student_name} already has an active interview with ${conflict.conflicting_company} (${conflict.conflicting_job}) scheduled from ${new Date(conflict.scheduled_start).toLocaleTimeString()} to ${new Date(conflict.scheduled_end).toLocaleTimeString()}.`,
          conflictingInterview: conflict
        }
      });
    }

    // UPDATE the existing interview record instead of creating a duplicate row
    db.run(
      `UPDATE interviews
       SET scheduled_start = ?, scheduled_end = ?, meeting_link = ?, venue = ?, notes = ?, status = 'SCHEDULED', updated_at = datetime('now')
       WHERE id = ?`,
      [newStartIso, newEndIso, newLink, newVenue, newNotes, existingInterview.id]
    );

    logAudit({
      actorId: req.user.id,
      entityName: 'interviews',
      entityId: existingInterview.id,
      action: 'INTERVIEW_RESCHEDULED',
      previousState: {
        start: existingInterview.scheduled_start,
        end: existingInterview.scheduled_end,
        link: existingInterview.meeting_link
      },
      newState: { applicationId, start: newStartIso, end: newEndIso, link: newLink },
      ipAddress: req.ip
    });

    sendNotification({
      userId: app.student_user_id,
      title: `Interview Updated: ${app.company_name}`,
      message: `Your interview for '${app.job_title}' has been updated to ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString()}. Venue: ${newVenue}. Check your portal for updated link & details.`
    });

    const updated = db.get(`SELECT * FROM interviews WHERE id = ?`, [existingInterview.id]);
    return res.status(200).json({
      success: true,
      message: 'Interview schedule successfully updated.',
      data: updated
    });
  }

  // Conflict Detection Engine for new interview
  const conflict = db.get(`
    SELECT i.*, j.title as conflicting_job, c.name as conflicting_company
    FROM interviews i
    JOIN applications a ON i.application_id = a.id
    JOIN jobs j ON a.job_id = j.id
    JOIN companies c ON j.company_id = c.id
    WHERE a.student_id = ?
      AND i.status = 'SCHEDULED'
      AND (datetime(?) < datetime(i.scheduled_end) AND datetime(?) > datetime(i.scheduled_start))
  `, [app.student_id, newEndIso, newStartIso]);

  if (conflict) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'INTERVIEW_COLLISION',
        message: `Schedule conflict detected! ${app.student_name} already has an active interview with ${conflict.conflicting_company} (${conflict.conflicting_job}) scheduled from ${new Date(conflict.scheduled_start).toLocaleTimeString()} to ${new Date(conflict.scheduled_end).toLocaleTimeString()}.`,
        conflictingInterview: conflict
      }
    });
  }

  const interviewId = generateUuid();
  db.run(
    `INSERT INTO interviews (
      id, application_id, job_stage_id, scheduled_start, scheduled_end, status, meeting_link, venue, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      interviewId,
      applicationId,
      jobStageId,
      newStartIso,
      newEndIso,
      newLink,
      newVenue,
      newNotes
    ]
  );

  logAudit({
    actorId: req.user.id,
    entityName: 'interviews',
    entityId: interviewId,
    action: 'INTERVIEW_SCHEDULED',
    newState: { applicationId, start: startDate, end: endDate },
    ipAddress: req.ip
  });

  sendNotification({
    userId: app.student_user_id,
    title: `Interview Scheduled: ${app.company_name}`,
    message: `You have an interview scheduled for '${app.job_title}' on ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString()}. Check your portal for meeting links.`
  });

  const created = db.get(`SELECT * FROM interviews WHERE id = ?`, [interviewId]);
  return res.status(201).json({
    success: true,
    message: 'Interview successfully scheduled without candidate time conflicts.',
    data: created
  });
});

/**
 * GET /api/v1/interviews/my-interviews
 * Student retrieves their scheduled interviews & round progression
 */
router.get('/my-interviews', authenticateToken, requireRole('STUDENT'), (req, res) => {
  const student = db.get(`SELECT id FROM students WHERE user_id = ?`, [req.user.id]);
  if (!student) {
    return res.status(404).json({ success: false, error: { message: 'Student profile not found.' } });
  }

  const list = db.all(`
    SELECT 
      COALESCE(i.id, asr.id) as id,
      a.id as application_id,
      js.id as job_stage_id,
      js.sequence_order,
      js.stage_name,
      j.title as job_title,
      c.name as company_name,
      c.logo_url as company_logo,
      i.scheduled_start,
      i.scheduled_end,
      i.meeting_link,
      i.venue,
      i.notes,
      i.status as interview_status,
      asr.outcome,
      asr.feedback,
      asr.evaluated_at,
      a.status as application_status
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    JOIN companies c ON j.company_id = c.id
    JOIN job_stages js ON js.job_id = j.id
    LEFT JOIN interviews i ON i.application_id = a.id AND i.job_stage_id = js.id
    LEFT JOIN application_stage_results asr ON asr.application_id = a.id AND asr.job_stage_id = js.id
    WHERE a.student_id = ?
      AND (
        (i.id IS NOT NULL) OR 
        (asr.outcome IS NOT NULL AND asr.outcome != 'PENDING')
      )
    GROUP BY a.id, js.id
    ORDER BY a.applied_at DESC, js.sequence_order ASC
  `, [student.id]);

  return res.json({ success: true, data: list });
});

/**
 * GET /api/v1/interviews/all
 * Admin and Recruiter view of interviews
 */
router.get('/all', authenticateToken, (req, res) => {
  let sql = `
    SELECT i.*, s.full_name as student_name, s.register_number, s.department,
           j.title as job_title, c.name as company_name, js.stage_name
    FROM interviews i
    JOIN applications a ON i.application_id = a.id
    JOIN students s ON a.student_id = s.id
    JOIN jobs j ON a.job_id = j.id
    JOIN companies c ON j.company_id = c.id
    JOIN job_stages js ON i.job_stage_id = js.id
  `;
  const params = [];

  if (req.user.role === 'RECRUITER') {
    sql += ` JOIN recruiter_profiles r ON r.company_id = c.id WHERE r.user_id = ?`;
    params.push(req.user.id);
  }

  sql += ` GROUP BY i.application_id, i.job_stage_id ORDER BY i.scheduled_start ASC`;
  const list = db.all(sql, params);
  return res.json({ success: true, data: list });
});

/**
 * PUT /api/v1/interviews/:id/status
 */
router.put('/:id/status', authenticateToken, requireRole('RECRUITER', 'ADMIN'), (req, res) => {
  const { status, notes } = req.body;
  const interview = db.get(`SELECT * FROM interviews WHERE id = ?`, [req.params.id]);
  if (!interview) {
    return res.status(404).json({ success: false, error: { message: 'Interview not found.' } });
  }

  db.run(
    `UPDATE interviews SET status = ?, notes = COALESCE(?, notes), updated_at = datetime('now') WHERE id = ?`,
    [status, notes, interview.id]
  );

  return res.json({ success: true, message: `Interview status updated to ${status}.` });
});

export default router;
