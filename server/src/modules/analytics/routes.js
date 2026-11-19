import express from 'express';
import { db } from '../../database/db.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/v1/analytics/cohort
 * Implements Section 4.1 De-duplicated Placement Analytics Query
 */
router.get('/cohort', authenticateToken, requireRole('ADMIN'), (req, res) => {
  const isAll = !req.query.graduationYear || req.query.graduationYear === 'ALL' || req.query.graduationYear === 'undefined';
  const graduationYear = isAll ? null : parseInt(req.query.graduationYear, 10);
  const department = req.query.department || null;

  // 1. Total Enrolled Students
  let enrolledQuery = `SELECT COUNT(*) as count FROM students WHERE 1=1`;
  const enrolledParams = [];
  if (!isAll) {
    enrolledQuery += ` AND graduation_year = ?`;
    enrolledParams.push(graduationYear);
  }
  if (department) {
    enrolledQuery += ` AND department = ?`;
    enrolledParams.push(department);
  }
  const totalEnrolled = db.get(enrolledQuery, enrolledParams)?.count || 0;

  // 2. Verified Students Count
  let verifiedQuery = `SELECT COUNT(*) as count FROM students WHERE verification_status = 'VERIFIED'`;
  const verifiedParams = [];
  if (!isAll) {
    verifiedQuery += ` AND graduation_year = ?`;
    verifiedParams.push(graduationYear);
  }
  if (department) {
    verifiedQuery += ` AND department = ?`;
    verifiedParams.push(department);
  }
  const verifiedStudents = db.get(verifiedQuery, verifiedParams)?.count || 0;

  // 3. Unique Placed Students (Distinct students with formal offers or acceptances)
  let placedQuery = `
    SELECT COUNT(DISTINCT s.id) as count
    FROM students s
    JOIN applications a ON s.id = a.student_id
    JOIN offers o ON a.id = o.application_id
    WHERE (o.status IN ('ISSUED', 'ACCEPTED') OR a.status IN ('OFFERED', 'ACCEPTED'))
  `;
  const placedParams = [];
  if (!isAll) {
    placedQuery += ` AND s.graduation_year = ?`;
    placedParams.push(graduationYear);
  }
  if (department) {
    placedQuery += ` AND s.department = ?`;
    placedParams.push(department);
  }
  const uniquePlaced = db.get(placedQuery, placedParams)?.count || 0;

  // 4. Gross Total Offers Released (ISSUED or ACCEPTED)
  let offersQuery = `
    SELECT COUNT(o.id) as count
    FROM students s
    JOIN applications a ON s.id = a.student_id
    JOIN offers o ON a.id = o.application_id
    WHERE o.status IN ('ISSUED', 'ACCEPTED')
  `;
  const offersParams = [];
  if (!isAll) {
    offersQuery += ` AND s.graduation_year = ?`;
    offersParams.push(graduationYear);
  }
  if (department) {
    offersQuery += ` AND s.department = ?`;
    offersParams.push(department);
  }
  const totalOffers = db.get(offersQuery, offersParams)?.count || 0;

  // 5. Compensation metrics
  let ctcQuery = `
    SELECT
      ROUND(AVG(o.ctc_amount), 2) as avg_ctc,
      ROUND(MAX(o.ctc_amount), 2) as highest_ctc,
      ROUND(MIN(o.ctc_amount), 2) as min_ctc
    FROM students s
    JOIN applications a ON s.id = a.student_id
    JOIN offers o ON a.id = o.application_id
    WHERE o.status IN ('ISSUED', 'ACCEPTED')
  `;
  const ctcParams = [];
  if (!isAll) {
    ctcQuery += ` AND s.graduation_year = ?`;
    ctcParams.push(graduationYear);
  }
  const ctcMetrics = db.get(ctcQuery, ctcParams);

  // 6. Department breakdown
  let depQuery = `
    SELECT
      s.department,
      COUNT(DISTINCT s.id) as enrolled,
      COUNT(DISTINCT CASE WHEN o.status IN ('ISSUED', 'ACCEPTED') OR a.status IN ('OFFERED', 'ACCEPTED') THEN s.id END) as placed,
      COUNT(o.id) as total_offers,
      ROUND(AVG(CASE WHEN o.status IN ('ISSUED', 'ACCEPTED') THEN o.ctc_amount END), 2) as avg_ctc
    FROM students s
    LEFT JOIN applications a ON s.id = a.student_id
    LEFT JOIN offers o ON a.id = o.application_id
    WHERE 1=1
  `;
  const depParams = [];
  if (!isAll) {
    depQuery += ` AND s.graduation_year = ?`;
    depParams.push(graduationYear);
  }
  depQuery += ` GROUP BY s.department ORDER BY placed DESC, enrolled DESC`;
  const departmentStats = db.all(depQuery, depParams);

  // Calculate percentage
  const placementPercentage = totalEnrolled === 0 ? 0 : Number(((uniquePlaced / totalEnrolled) * 100).toFixed(2));

  // 7. General System Counts
  const companiesCount = db.get(`SELECT COUNT(*) as count FROM companies WHERE approval_status = 'VERIFIED'`)?.count || 0;
  const pendingCompanies = db.get(`SELECT COUNT(*) as count FROM companies WHERE approval_status = 'PENDING'`)?.count || 0;
  const activeJobs = db.get(`SELECT COUNT(*) as count FROM jobs WHERE status = 'PUBLISHED'`)?.count || 0;
  const pendingStudents = db.get(`SELECT COUNT(*) as count FROM students WHERE verification_status = 'PENDING'`)?.count || 0;

  return res.json({
    success: true,
    data: {
      cohort: {
        graduationYear,
        departmentFilter: department || 'ALL'
      },
      metrics: {
        totalEnrolledStudents: totalEnrolled,
        verifiedStudents,
        pendingVerificationStudents: pendingStudents,
        uniquePlacedStudents: uniquePlaced,
        totalOffersReleased: totalOffers,
        multipleOfferHolders: Math.max(0, totalOffers - uniquePlaced),
        placementPercentage,
        avgCtcLpa: ctcMetrics?.avg_ctc || 0,
        highestCtcLpa: ctcMetrics?.highest_ctc || 0,
        minCtcLpa: ctcMetrics?.min_ctc || 0
      },
      counts: {
        companiesCount,
        pendingCompanies,
        activeJobs
      },
      departmentStats
    }
  });
});

/**
 * GET /api/v1/analytics/placed-students
 * Super Admin directory of all placed students with corporate hiring details
 */
router.get('/placed-students', authenticateToken, requireRole('ADMIN'), (req, res) => {
  const isAllGrad = !req.query.graduationYear || req.query.graduationYear === 'ALL' || req.query.graduationYear === 'undefined';
  const graduationYear = isAllGrad ? null : parseInt(req.query.graduationYear, 10);
  const department = req.query.department && req.query.department !== 'ALL' && req.query.department !== 'undefined' ? req.query.department : null;

  let sql = `
    SELECT 
      s.id as student_id,
      s.full_name as student_name,
      s.register_number,
      s.department,
      s.degree,
      s.graduation_year,
      s.current_cgpa,
      u.email as student_email,
      o.id as offer_id,
      o.status as offer_status,
      o.ctc_amount,
      COALESCE(o.custom_company_name, c.name) as company_name,
      c.logo_url as company_logo,
      COALESCE(o.custom_designation, j.title) as job_title,
      o.created_at as offer_date,
      a.id as application_id,
      a.status as application_status
    FROM students s
    JOIN users u ON s.user_id = u.id
    JOIN applications a ON s.id = a.student_id
    JOIN offers o ON a.id = o.application_id
    JOIN jobs j ON a.job_id = j.id
    JOIN companies c ON j.company_id = c.id
    WHERE (o.status IN ('ISSUED', 'ACCEPTED') OR a.status IN ('OFFERED', 'ACCEPTED'))
  `;
  const params = [];

  if (graduationYear) {
    sql += ` AND s.graduation_year = ?`;
    params.push(graduationYear);
  }
  if (department) {
    sql += ` AND s.department = ?`;
    params.push(department);
  }

  sql += ` ORDER BY o.created_at DESC, s.full_name ASC`;

  const rows = db.all(sql, params);
  return res.json({ success: true, data: rows });
});

/**
 * GET /api/v1/analytics/recruiter
 * Recruiter recruitment funnel
 */
router.get('/recruiter', authenticateToken, requireRole('RECRUITER'), (req, res) => {
  const recruiter = db.get(`SELECT company_id FROM recruiter_profiles WHERE user_id = ?`, [req.user.id]);
  if (!recruiter) {
    return res.status(404).json({ success: false, error: { message: 'Recruiter not found.' } });
  }

  const jobs = db.all(`SELECT id, title, status FROM jobs WHERE company_id = ?`, [recruiter.company_id]);
  const jobIds = jobs.map(j => `'${j.id}'`).join(',') || "''";

  const totalApplications = db.get(`SELECT COUNT(*) as count FROM applications WHERE job_id IN (${jobIds})`)?.count || 0;
  const inProgress = db.get(`SELECT COUNT(*) as count FROM applications WHERE job_id IN (${jobIds}) AND status = 'IN_PROGRESS'`)?.count || 0;
  const offered = db.get(`SELECT COUNT(*) as count FROM applications WHERE job_id IN (${jobIds}) AND status IN ('OFFERED', 'ACCEPTED')`)?.count || 0;
  const accepted = db.get(`SELECT COUNT(*) as count FROM applications WHERE job_id IN (${jobIds}) AND status = 'ACCEPTED'`)?.count || 0;
  const rejected = db.get(`SELECT COUNT(*) as count FROM applications WHERE job_id IN (${jobIds}) AND status = 'REJECTED'`)?.count || 0;

  return res.json({
    success: true,
    data: {
      activeJobsCount: jobs.filter(j => j.status === 'PUBLISHED').length,
      funnel: {
        totalApplications,
        inProgress,
        offered,
        accepted,
        rejected
      }
    }
  });
});

export default router;
