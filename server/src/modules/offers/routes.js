import express from 'express';
import { db } from '../../database/db.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { generateUuid } from '../../utils/security.js';
import { ApplicationStateMachine } from '../applications/stateMachine.js';
import { logAudit, sendNotification } from '../audit/logger.js';

const router = express.Router();

/**
 * POST /api/v1/offers/issue
 * Recruiter generates formal offer for an applicant
 */
router.post('/issue', authenticateToken, requireRole('RECRUITER', 'ADMIN'), (req, res) => {
  const { applicationId, ctcAmount, validUntilDays = 30, customCompanyName, customDesignation, notes } = req.body;

  if (!applicationId || !ctcAmount) {
    return res.status(400).json({ success: false, error: { message: 'Application ID and CTC Amount are required.' } });
  }

  const app = db.get(`
    SELECT a.*, j.company_id, j.title as job_title, c.name as company_name, s.user_id as student_user_id, s.full_name as student_name
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    JOIN companies c ON j.company_id = c.id
    JOIN students s ON a.student_id = s.id
    WHERE a.id = ?
  `, [applicationId]);

  if (!app) {
    return res.status(404).json({ success: false, error: { message: 'Application not found.' } });
  }

  if (req.user.role === 'RECRUITER') {
    const recruiter = db.get(`SELECT company_id FROM recruiter_profiles WHERE user_id = ?`, [req.user.id]);
    if (!recruiter || recruiter.company_id !== app.company_id) {
      return res.status(403).json({ success: false, error: { message: 'Access denied.' } });
    }
  }

  const existingOffer = db.get(`SELECT id FROM offers WHERE application_id = ?`, [app.id]);
  if (existingOffer) {
    return res.status(409).json({ success: false, error: { message: 'An offer has already been issued for this application.' } });
  }

  const offerId = generateUuid();
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + Number(validUntilDays));

  const finalCompanyName = customCompanyName && customCompanyName.trim() ? customCompanyName.trim() : app.company_name;
  const finalDesignation = customDesignation && customDesignation.trim() ? customDesignation.trim() : app.job_title;

  db.transaction(() => {
    // 1. Insert offer record with custom company entity & designation
    db.run(
      `INSERT INTO offers (id, application_id, status, ctc_amount, valid_until, custom_company_name, custom_designation, created_at, updated_at)
       VALUES (?, ?, 'ISSUED', ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [offerId, app.id, parseFloat(ctcAmount), validUntil.toISOString(), finalCompanyName, finalDesignation]
    );

    // 2. Transition application to OFFERED
    ApplicationStateMachine.transition({
      applicationId: app.id,
      newStatus: 'OFFERED',
      actorId: req.user.id,
      notes: `Formal offer letter issued with CTC ${ctcAmount} LPA by ${finalCompanyName}`,
      ipAddress: req.ip
    });
  });

  logAudit({
    actorId: req.user.id,
    entityName: 'offers',
    entityId: offerId,
    action: 'OFFER_ISSUED',
    newState: { applicationId: app.id, ctcAmount, company: finalCompanyName, designation: finalDesignation, validUntil: validUntil.toISOString() },
    ipAddress: req.ip
  });

  sendNotification({
    userId: app.student_user_id,
    title: `🎉 Formal Placement Offer: ${finalCompanyName}!`,
    message: `Congratulations ${app.student_name}! ${finalCompanyName} has extended a formal employment offer letter for '${finalDesignation}' with an Annual CTC Package of ₹${ctcAmount} LPA.`
  });

  const offer = db.get(`SELECT * FROM offers WHERE id = ?`, [offerId]);
  return res.status(201).json({
    success: true,
    message: 'Formal placement offer letter issued successfully.',
    data: offer
  });
});

/**
 * GET /api/v1/offers/my-offers
 * Student retrieves all offers extended to them
 */
router.get('/my-offers', authenticateToken, requireRole('STUDENT'), (req, res) => {
  const student = db.get(`SELECT id FROM students WHERE user_id = ?`, [req.user.id]);
  if (!student) {
    return res.status(404).json({ success: false, error: { message: 'Student profile not found.' } });
  }

  const list = db.all(`
    SELECT o.*, a.job_id,
           COALESCE(o.custom_designation, j.title) as job_title,
           j.location as job_location, j.work_mode,
           COALESCE(o.custom_company_name, c.name) as company_name,
           c.logo_url as company_logo, c.website as company_website,
           s.full_name as student_name, s.register_number, s.department, s.degree, s.graduation_year
    FROM offers o
    JOIN applications a ON o.application_id = a.id
    JOIN jobs j ON a.job_id = j.id
    JOIN companies c ON j.company_id = c.id
    JOIN students s ON a.student_id = s.id
    WHERE a.student_id = ?
    ORDER BY o.created_at DESC
  `, [student.id]);

  return res.json({ success: true, data: list });
});

/**
 * PUT /api/v1/offers/:id/respond
 * Student ACCEPTS or DECLINES the offer
 */
router.put('/:id/respond', authenticateToken, requireRole('STUDENT'), (req, res) => {
  const { action, reason } = req.body; // 'ACCEPTED' or 'DECLINED'
  if (!['ACCEPTED', 'DECLINED'].includes(action)) {
    return res.status(400).json({ success: false, error: { message: 'Action must be ACCEPTED or DECLINED.' } });
  }

  const student = db.get(`SELECT id, full_name FROM students WHERE user_id = ?`, [req.user.id]);
  const offer = db.get(`
    SELECT o.*, a.id as application_id, a.job_id, j.title as job_title, c.name as company_name, c.id as company_id
    FROM offers o
    JOIN applications a ON o.application_id = a.id
    JOIN jobs j ON a.job_id = j.id
    JOIN companies c ON j.company_id = c.id
    WHERE o.id = ? AND a.student_id = ?
  `, [req.params.id, student.id]);

  if (!offer) {
    return res.status(404).json({ success: false, error: { message: 'Offer record not found.' } });
  }

  if (offer.status !== 'ISSUED') {
    return res.status(400).json({ success: false, error: { message: `Offer has already been responded to (${offer.status}).` } });
  }

  // Check deadline
  if (new Date() > new Date(offer.valid_until)) {
    return res.status(400).json({ success: false, error: { message: 'Offer validity period has expired.' } });
  }

  db.transaction(() => {
    // 1. Update offer status
    db.run(
      `UPDATE offers SET status = ?, response_date = datetime('now'), rejection_reason = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [action, reason || null, offer.id]
    );

    // 2. Transition application status
    ApplicationStateMachine.transition({
      applicationId: offer.application_id,
      newStatus: action,
      actorId: req.user.id,
      notes: reason || `Candidate explicitly ${action} offer`,
      ipAddress: req.ip
    });
  });

  logAudit({
    actorId: req.user.id,
    entityName: 'offers',
    entityId: offer.id,
    action: `OFFER_${action}`,
    newState: { status: action, reason },
    ipAddress: req.ip
  });

  const recruiter = db.get(`SELECT user_id FROM recruiter_profiles WHERE company_id = ?`, [offer.company_id]);
  if (recruiter) {
    sendNotification({
      userId: recruiter.user_id,
      title: `Offer ${action}: ${student.full_name}`,
      message: `${student.full_name} has ${action.toLowerCase()} the offer for '${offer.job_title}'.`
    });
  }

  return res.json({
    success: true,
    message: action === 'ACCEPTED'
      ? 'Congratulations on your campus placement! Offer officially accepted and confirmed.'
      : 'Offer has been formally declined.'
  });
});

export default router;
