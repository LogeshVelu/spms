import express from 'express';
import { db } from '../../database/db.js';
import { hashPassword, verifyPassword, generateToken, generateUuid } from '../../utils/security.js';
import { authenticateToken } from '../../middleware/auth.js';
import { logAudit, sendNotification } from '../audit/logger.js';

const router = express.Router();

/**
 * GET /api/v1/auth/demo-accounts
 * Returns pre-seeded demo accounts categorized by role
 */
router.get('/demo-accounts', (req, res) => {
  res.json({
    success: true,
    data: [
      {
        role: 'ADMIN',
        category: 'Placement Administrator',
        email: 'admin@college.edu',
        password: 'DemoPassword123!',
        name: 'Placement Directorate Admin',
        badge: 'Institutional Super Admin',
        description: 'Global verification queue, recruiter approvals, audit logs & placement analytics.'
      },
      {
        role: 'RECRUITER',
        category: 'Corporate Recruiter (Approved)',
        email: 'recruiter@zoho.com',
        password: 'DemoPassword123!',
        name: 'Sridhar Venkatesh',
        company: 'Zoho Corporation',
        badge: 'Active Recruiter',
        description: 'Post openings, review candidate resume snapshots, shortlist, schedule interviews & release offers.'
      },
      {
        role: 'RECRUITER',
        category: 'Corporate Recruiter (Pending Verification)',
        email: 'hr@cloudscale.io',
        password: 'DemoPassword123!',
        name: 'Ananya Roy',
        company: 'Cloudscale Systems',
        badge: 'Pending Review',
        description: 'Edge case demo: Company awaiting verification by placement cell.'
      },
      {
        role: 'STUDENT',
        category: 'Student (Verified & Fully Eligible)',
        email: 'priya.cse@college.edu',
        password: 'DemoPassword123!',
        name: 'Priya Sharma (CSE)',
        badge: 'CGPA 9.10 • 0 Arrears',
        description: 'Eligible for all software postings, test live application & resume snapshotting.'
      },
      {
        role: 'STUDENT',
        category: 'Student (Ineligible CGPA Edge Case)',
        email: 'rajesh.ece@college.edu',
        password: 'DemoPassword123!',
        name: 'Rajesh Kumar (ECE)',
        badge: 'CGPA 6.80 • 1 Arrear',
        description: 'Edge case demo: Demonstrates real-time cut-off engine blockers.'
      },
      {
        role: 'STUDENT',
        category: 'Student (Unverified Profile Edge Case)',
        email: 'dinesh.mech@college.edu',
        password: 'DemoPassword123!',
        name: 'Dinesh M (MECH)',
        badge: 'Profile Pending Admin Review',
        description: 'Edge case demo: Cannot apply until verified by admin.'
      }
    ]
  });
});

/**
 * POST /api/v1/auth/login
 * Supports login via either Email address or Student Roll / Register Number
 */
router.post('/login', (req, res) => {
  const identifier = (req.body.email || req.body.identifier || '').trim();
  const password = (req.body.password || '').trim();

  if (!identifier || !password) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Email or Roll/Register Number and password are required.' }
    });
  }

  // 1. Check if identifier matches user email
  let user = db.get(`SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL`, [identifier]);

  // 2. If not found by email, check if it matches a student's register_number (case-insensitive)
  if (!user) {
    user = db.get(
      `SELECT u.* 
       FROM users u 
       JOIN students s ON s.user_id = u.id 
       WHERE LOWER(s.register_number) = LOWER(?) AND u.deleted_at IS NULL`,
      [identifier]
    );
  }

  if (!user) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'No registered user found with this email or Roll/Register Number.' }
    });
  }

  const valid = verifyPassword(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect password provided.' }
    });
  }

  if (user.status === 'SUSPENDED' || user.status === 'REJECTED') {
    return res.status(403).json({
      success: false,
      error: { code: 'ACCOUNT_SUSPENDED', message: `Your account is ${user.status.toLowerCase()}. Please contact the Placement Cell.` }
    });
  }

  let profile = null;
  if (user.role === 'STUDENT') {
    profile = db.get(`SELECT * FROM students WHERE user_id = ?`, [user.id]);
  } else if (user.role === 'RECRUITER') {
    profile = db.get(`
      SELECT r.*, c.name as company_name, c.approval_status as company_approval_status, c.logo_url as company_logo
      FROM recruiter_profiles r
      JOIN companies c ON r.company_id = c.id
      WHERE r.user_id = ?
    `, [user.id]);
  }

  const token = generateToken({
    id: user.id,
    email: user.email,
    role: user.role
  });

  logAudit({
    actorId: user.id,
    entityName: 'users',
    entityId: user.id,
    action: 'USER_LOGIN',
    ipAddress: req.ip
  });

  return res.json({
    success: true,
    message: 'Authentication successful.',
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status
      },
      profile
    }
  });
});

/**
 * POST /api/v1/auth/switch-demo
 * Fast 1-click login helper for demo presentations
 */
router.post('/switch-demo', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: { message: 'Demo email required.' } });
  }

  const user = db.get(`SELECT * FROM users WHERE email = ? AND deleted_at IS NULL`, [email.trim().toLowerCase()]);
  if (!user) {
    return res.status(404).json({ success: false, error: { message: 'Demo account not found.' } });
  }

  let profile = null;
  if (user.role === 'STUDENT') {
    profile = db.get(`SELECT * FROM students WHERE user_id = ?`, [user.id]);
  } else if (user.role === 'RECRUITER') {
    profile = db.get(`
      SELECT r.*, c.name as company_name, c.approval_status as company_approval_status, c.logo_url as company_logo
      FROM recruiter_profiles r
      JOIN companies c ON r.company_id = c.id
      WHERE r.user_id = ?
    `, [user.id]);
  }

  const token = generateToken({
    id: user.id,
    email: user.email,
    role: user.role
  });

  return res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status
      },
      profile
    }
  });
});

/**
 * POST /api/v1/auth/register-student
 */
router.post('/register-student', (req, res) => {
  const {
    email,
    password,
    registerNumber,
    fullName,
    phone,
    degree,
    department,
    specialization,
    graduationYear,
    currentYear,
    completedSemesters,
    currentCgpa,
    tenthPercentage,
    twelfthPercentage
  } = req.body;

  if (!email || !password || !registerNumber || !fullName || !phone || !degree || !department || !graduationYear || currentCgpa === undefined || currentCgpa === '' || req.body.currentYear === undefined || req.body.currentYear === '' || req.body.completedSemesters === undefined || req.body.completedSemesters === '') {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'Please provide all mandatory student registration fields, including year of study and semester.' }
    });
  }

  // Validate Email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_EMAIL', message: 'Please enter a valid email address.' }
    });
  }

  // Validate Register Number format
  const regNumberClean = registerNumber.trim().toUpperCase();
  if (!/^[A-Z0-9]{5,20}$/.test(regNumberClean)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_REG_NUMBER', message: 'Register number must be 5-20 alphanumeric characters (e.g., 2022CS1042).' }
    });
  }

  // Validate CGPA (0.00 to 10.00)
  const cgpaNum = parseFloat(currentCgpa);
  if (isNaN(cgpaNum) || cgpaNum < 0 || cgpaNum > 10) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_CGPA', message: 'CGPA must be a valid number between 0.00 and 10.00.' }
    });
  }

  const existingEmail = db.get(`SELECT id FROM users WHERE email = ?`, [email.trim().toLowerCase()]);
  if (existingEmail) {
    return res.status(409).json({
      success: false,
      error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' }
    });
  }

  const existingReg = db.get(`SELECT id FROM students WHERE register_number = ?`, [registerNumber.trim().toUpperCase()]);
  if (existingReg) {
    return res.status(409).json({
      success: false,
      error: { code: 'REG_NUMBER_EXISTS', message: 'Register number already registered.' }
    });
  }

  const standingArrearsVal = Math.max(0, parseInt(req.body.standingArrears || '0', 10));
  const historyOfArrearsVal = Math.max(standingArrearsVal, parseInt(req.body.historyOfArrears || '0', 10));
  const currentYearVal = Math.min(4, Math.max(1, parseInt(req.body.currentYear, 10)));
  const completedSemestersVal = Math.min(8, Math.max(1, parseInt(req.body.completedSemesters, 10)));

  try {
    const userId = generateUuid();
    const studentId = generateUuid();
    const passHash = hashPassword(password);

    db.transaction(() => {
      db.run(
        `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
         VALUES (?, ?, ?, 'STUDENT', 'ACTIVE', datetime('now'), datetime('now'))`,
        [userId, email.trim().toLowerCase(), passHash]
      );

      db.run(
        `INSERT INTO students (
          id, user_id, register_number, full_name, phone, degree, department, specialization,
          graduation_year, current_year, completed_semesters, current_cgpa, tenth_percentage, twelfth_percentage,
          standing_arrears, history_of_arrears, verification_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', datetime('now'), datetime('now'))`,
        [
          studentId,
          userId,
          registerNumber.trim().toUpperCase(),
          fullName.trim(),
          phone.trim(),
          degree.trim(),
          department.trim(),
          specialization ? specialization.trim() : null,
          parseInt(graduationYear, 10),
          currentYearVal,
          completedSemestersVal,
          parseFloat(currentCgpa),
          parseFloat(tenthPercentage || 0),
          parseFloat(twelfthPercentage || 0),
          standingArrearsVal,
          historyOfArrearsVal
        ]
      );
    });

    logAudit({
      actorId: userId,
      entityName: 'students',
      entityId: studentId,
      action: 'STUDENT_REGISTER',
      ipAddress: req.ip
    });

    const token = generateToken({ id: userId, email: email.trim().toLowerCase(), role: 'STUDENT' });
    const profile = db.get(`SELECT * FROM students WHERE id = ?`, [studentId]);

    return res.status(201).json({
      success: true,
      message: 'Student registration successful. Pending placement cell verification.',
      data: {
        token,
        user: { id: userId, email: email.trim().toLowerCase(), role: 'STUDENT', status: 'ACTIVE' },
        profile
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

/**
 * POST /api/v1/auth/register-recruiter
 */
router.post('/register-recruiter', (req, res) => {
  const {
    email,
    password,
    fullName,
    phone,
    designation,
    companyName,
    website,
    industry,
    description
  } = req.body;

  if (!email || !password || !fullName || !companyName) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'Mandatory company and recruiter details missing.' }
    });
  }

  const existingEmail = db.get(`SELECT id FROM users WHERE email = ?`, [email.trim().toLowerCase()]);
  if (existingEmail) {
    return res.status(409).json({
      success: false,
      error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' }
    });
  }

  try {
    const userId = generateUuid();
    const companyId = generateUuid();
    const recruiterId = generateUuid();
    const passHash = hashPassword(password);

    db.transaction(() => {
      // Create user with PENDING status until approved
      db.run(
        `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
         VALUES (?, ?, ?, 'RECRUITER', 'PENDING', datetime('now'), datetime('now'))`,
        [userId, email.trim().toLowerCase(), passHash]
      );

      // Create company record with PENDING approval
      db.run(
        `INSERT INTO companies (id, name, website, industry, description, approval_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'PENDING', datetime('now'), datetime('now'))`,
        [companyId, companyName.trim(), website || null, industry || null, description || null]
      );

      // Create recruiter profile
      db.run(
        `INSERT INTO recruiter_profiles (id, user_id, company_id, full_name, phone, designation, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [recruiterId, userId, companyId, fullName.trim(), phone || null, designation || 'Recruiting Lead']
      );
    });

    logAudit({
      actorId: userId,
      entityName: 'companies',
      entityId: companyId,
      action: 'RECRUITER_ONBOARDING_REGISTER',
      ipAddress: req.ip
    });

    // Notify all placement admins that a new recruiter registered and is pending approval
    try {
      const admins = db.all(`SELECT id FROM users WHERE role = 'ADMIN'`);
      admins.forEach((adm) => {
        sendNotification({
          userId: adm.id,
          title: '🏢 New Recruiter Registered (Pending Approval)',
          message: `${companyName.trim()} (${fullName.trim()}${designation ? ', ' + designation.trim() : ''}) has registered and is pending placement admin approval.`
        });
      });
    } catch (notifErr) {
      console.error('[Admin Recruiter Registration Notification Error]', notifErr);
    }

    const token = generateToken({ id: userId, email: email.trim().toLowerCase(), role: 'RECRUITER' });

    return res.status(201).json({
      success: true,
      message: 'Recruiter and company onboarding submitted. Account is under verification by placement admin.',
      data: {
        token,
        user: { id: userId, email: email.trim().toLowerCase(), role: 'RECRUITER', status: 'PENDING' }
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

/**
 * GET /api/v1/auth/me
 */
router.get('/me', authenticateToken, (req, res) => {
  let profile = null;
  if (req.user.role === 'STUDENT') {
    profile = db.get(`SELECT * FROM students WHERE user_id = ?`, [req.user.id]);
  } else if (req.user.role === 'RECRUITER') {
    profile = db.get(`
      SELECT r.*, c.name as company_name, c.approval_status as company_approval_status, c.logo_url as company_logo
      FROM recruiter_profiles r
      JOIN companies c ON r.company_id = c.id
      WHERE r.user_id = ?
    `, [req.user.id]);
  }

  return res.json({
    success: true,
    data: {
      user: req.user,
      profile
    }
  });
});

export default router;
