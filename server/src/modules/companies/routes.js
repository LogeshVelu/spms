import express from 'express';
import { db } from '../../database/db.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { logAudit, sendNotification } from '../audit/logger.js';

const router = express.Router();

/**
 * GET /api/v1/companies
 * Lists corporate partners with recruiter details and drive counts.
 * Supports query params: status ('ALL' | 'VERIFIED' | 'PENDING' | 'REJECTED'), all ('true')
 */
router.get('/', (req, res) => {
  const { status, all } = req.query;
  let whereClause = '';
  const params = [];

  if (status && status !== 'ALL') {
    whereClause = 'WHERE c.approval_status = ?';
    params.push(status);
  } else if (!all && status !== 'ALL' && !req.headers.authorization) {
    // Unauthenticated public requests only see verified corporate partners
    whereClause = "WHERE c.approval_status = 'VERIFIED'";
  }

  const query = `
    SELECT c.*,
      r.full_name as recruiter_name,
      r.designation as recruiter_designation,
      r.phone as recruiter_phone,
      u.email as recruiter_email,
      u.status as user_status,
      (SELECT COUNT(*) FROM jobs j WHERE j.company_id = c.id AND j.status = 'PUBLISHED') as active_jobs_count,
      (SELECT COUNT(*) FROM jobs j WHERE j.company_id = c.id) as total_jobs_count
    FROM companies c
    LEFT JOIN recruiter_profiles r ON r.company_id = c.id
    LEFT JOIN users u ON r.user_id = u.id
    ${whereClause}
    ORDER BY c.created_at DESC, c.name ASC
  `;

  const companies = db.all(query, params);
  return res.json({ success: true, data: companies });
});

/**
 * GET /api/v1/companies/pending
 * Admin queue for corporate partners awaiting approval
 */
router.get('/pending', authenticateToken, requireRole('ADMIN'), (req, res) => {
  const pending = db.all(`
    SELECT c.*, r.full_name as recruiter_name, r.designation, r.phone, u.email as recruiter_email, u.id as recruiter_user_id
    FROM companies c
    JOIN recruiter_profiles r ON r.company_id = c.id
    JOIN users u ON r.user_id = u.id
    WHERE c.approval_status = 'PENDING'
    ORDER BY c.created_at DESC
  `);

  return res.json({ success: true, data: pending });
});

/**
 * PUT /api/v1/companies/:id/approve
 * Admin approves or rejects corporate partner
 */
router.put('/:id/approve', authenticateToken, requireRole('ADMIN'), (req, res) => {
  const { status } = req.body; // 'VERIFIED' or 'REJECTED'
  if (!['VERIFIED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid status. Must be VERIFIED or REJECTED.' } });
  }

  const company = db.get(`SELECT * FROM companies WHERE id = ?`, [req.params.id]);
  if (!company) {
    return res.status(404).json({ success: false, error: { message: 'Company not found.' } });
  }

  const recruiterProfile = db.get(`SELECT user_id FROM recruiter_profiles WHERE company_id = ?`, [company.id]);

  db.transaction(() => {
    db.run(
      `UPDATE companies SET approval_status = ?, approved_by = ?, updated_at = datetime('now') WHERE id = ?`,
      [status, req.user.id, company.id]
    );

    if (recruiterProfile) {
      db.run(
        `UPDATE users SET status = ? WHERE id = ?`,
        [status === 'VERIFIED' ? 'ACTIVE' : 'REJECTED', recruiterProfile.user_id]
      );
    }
  });

  logAudit({
    actorId: req.user.id,
    entityName: 'companies',
    entityId: company.id,
    action: `COMPANY_${status}`,
    previousState: { approval_status: company.approval_status },
    newState: { approval_status: status },
    ipAddress: req.ip
  });

  if (recruiterProfile) {
    sendNotification({
      userId: recruiterProfile.user_id,
      title: `Company Onboarding: ${status === 'VERIFIED' ? 'Approved' : 'Rejected'}`,
      message: status === 'VERIFIED'
        ? `Your organization '${company.name}' has been verified. You can now post jobs and access campus talent.`
        : `Your organization onboarding was not approved. Please contact the Directorate of Placement.`
    });
  }

  return res.json({
    success: true,
    message: `Company '${company.name}' onboarding status updated to ${status}.`
  });
});

/**
 * GET /api/v1/companies/my-company
 * Recruiter gets current organization profile
 */
router.get('/my-company', authenticateToken, requireRole('RECRUITER'), (req, res) => {
  const recruiter = db.get(`SELECT company_id FROM recruiter_profiles WHERE user_id = ?`, [req.user.id]);
  if (!recruiter) {
    return res.status(404).json({ success: false, error: { message: 'Recruiter profile not linked to company.' } });
  }

  const company = db.get(`SELECT * FROM companies WHERE id = ?`, [recruiter.company_id]);
  return res.json({ success: true, data: company });
});

/**
 * PUT /api/v1/companies/my-company
 * Recruiter updates company description, website, or logo
 */
router.put('/my-company', authenticateToken, requireRole('RECRUITER'), (req, res) => {
  const recruiter = db.get(`SELECT company_id FROM recruiter_profiles WHERE user_id = ?`, [req.user.id]);
  if (!recruiter) {
    return res.status(404).json({ success: false, error: { message: 'Recruiter profile not found.' } });
  }

  const { description, website, industry, logoUrl } = req.body;

  db.run(
    `UPDATE companies
     SET description = COALESCE(?, description),
         website = COALESCE(?, website),
         industry = COALESCE(?, industry),
         logo_url = COALESCE(?, logo_url),
         updated_at = datetime('now')
     WHERE id = ?`,
    [description, website, industry, logoUrl, recruiter.company_id]
  );

  const updated = db.get(`SELECT * FROM companies WHERE id = ?`, [recruiter.company_id]);
  return res.json({ success: true, message: 'Company profile updated.', data: updated });
});

export default router;
