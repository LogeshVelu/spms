import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../../database/db.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { generateUuid, computeSha256 } from '../../utils/security.js';
import { logAudit, sendNotification } from '../audit/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_RESUMES_DIR = path.resolve(__dirname, '../../../uploads/resumes');
if (!fs.existsSync(UPLOADS_RESUMES_DIR)) {
  fs.mkdirSync(UPLOADS_RESUMES_DIR, { recursive: true });
}

const router = express.Router();

/**
 * GET /api/v1/students/me
 * Retrieves current student's full profile, resumes, marksheets, and verification status
 */
router.get('/me', authenticateToken, requireRole('STUDENT'), (req, res) => {
  const student = db.get(`SELECT * FROM students WHERE user_id = ?`, [req.user.id]);
  if (!student) {
    return res.status(404).json({ success: false, error: { message: 'Student profile not found.' } });
  }

  const resumes = db.all(
    `SELECT id, title, file_storage_key, file_checksum_sha256, file_size_bytes, is_default, created_at
     FROM student_resumes
     WHERE student_id = ? AND deleted_at IS NULL
     ORDER BY is_default DESC, created_at DESC`,
    [student.id]
  );

  const documents = db.all(
    `SELECT id, document_type, title, file_size_bytes, uploaded_at
     FROM student_documents
     WHERE student_id = ?
     ORDER BY uploaded_at DESC`,
    [student.id]
  );

  return res.json({
    success: true,
    data: {
      student,
      resumes,
      documents
    }
  });
});

/**
 * PUT /api/v1/students/me
 * Updates editable contact and profile fields
 */
router.put('/me', authenticateToken, requireRole('STUDENT'), (req, res) => {
  const student = db.get(`SELECT * FROM students WHERE user_id = ?`, [req.user.id]);
  if (!student) {
    return res.status(404).json({ success: false, error: { message: 'Student profile not found.' } });
  }

  const {
    phone,
    department,
    specialization,
    currentYear,
    completedSemesters,
    currentCgpa,
    standingArrears,
    historyOfArrears,
    tenthPercentage,
    twelfthPercentage,
    graduationYear
  } = req.body;

  const newPhone = phone !== undefined ? String(phone).trim() : student.phone;
  const newDept = (department !== undefined && String(department).trim()) ? String(department).trim() : student.department;
  const newSpec = specialization !== undefined ? (String(specialization).trim() || null) : student.specialization;

  let newCurrentYear = student.current_year || 4;
  if (currentYear !== undefined && currentYear !== '') {
    const yr = parseInt(currentYear, 10);
    if (!isNaN(yr) && yr >= 1 && yr <= 4) {
      // Forward-only rule: year cannot be downgraded
      newCurrentYear = Math.max(student.current_year || 1, yr);
    }
  }

  let newCompletedSemesters = student.completed_semesters ?? 8;
  if (completedSemesters !== undefined && completedSemesters !== '') {
    const sem = parseInt(completedSemesters, 10);
    if (!isNaN(sem) && sem >= 1 && sem <= 8) {
      // Forward-only rule: semester cannot be downgraded
      newCompletedSemesters = Math.max(student.completed_semesters || 1, sem);
    }
  }

  let newCgpa = student.current_cgpa;
  if (currentCgpa !== undefined && currentCgpa !== '') {
    const parsed = parseFloat(currentCgpa);
    if (isNaN(parsed) || parsed < 0 || parsed > 10) {
      return res.status(400).json({ success: false, error: { message: 'CGPA must be a valid number between 0.00 and 10.00.' } });
    }
    newCgpa = parsed;
  }

  let newStandingArrears = student.standing_arrears;
  if (standingArrears !== undefined && standingArrears !== '') {
    const parsed = parseInt(standingArrears, 10);
    if (isNaN(parsed) || parsed < 0) {
      return res.status(400).json({ success: false, error: { message: 'Standing arrears must be 0 or greater.' } });
    }
    newStandingArrears = parsed;
  }

  let newHistoryArrears = student.history_of_arrears;
  if (historyOfArrears !== undefined && historyOfArrears !== '') {
    const parsed = parseInt(historyOfArrears, 10);
    if (!isNaN(parsed) && parsed >= newStandingArrears) {
      newHistoryArrears = parsed;
    } else {
      newHistoryArrears = Math.max(newStandingArrears, newHistoryArrears);
    }
  } else {
    newHistoryArrears = Math.max(newStandingArrears, newHistoryArrears);
  }

  let newTenth = student.tenth_percentage;
  if (tenthPercentage !== undefined && tenthPercentage !== '') {
    const parsed = parseFloat(tenthPercentage);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) newTenth = parsed;
  }

  let newTwelfth = student.twelfth_percentage;
  if (twelfthPercentage !== undefined && twelfthPercentage !== '') {
    const parsed = parseFloat(twelfthPercentage);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) newTwelfth = parsed;
  }

  let newGradYear = student.graduation_year;
  if (graduationYear !== undefined && graduationYear !== '') {
    const parsed = parseInt(graduationYear, 10);
    if (!isNaN(parsed) && parsed >= 2020 && parsed <= 2035) newGradYear = parsed;
  }

  db.run(
    `UPDATE students 
     SET phone = ?, department = ?, specialization = ?, current_year = ?, completed_semesters = ?,
         current_cgpa = ?, standing_arrears = ?, history_of_arrears = ?,
         tenth_percentage = ?, twelfth_percentage = ?, graduation_year = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      newPhone,
      newDept,
      newSpec,
      newCurrentYear,
      newCompletedSemesters,
      newCgpa,
      newStandingArrears,
      newHistoryArrears,
      newTenth,
      newTwelfth,
      newGradYear,
      student.id
    ]
  );

  logAudit({
    actorId: req.user.id,
    entityName: 'students',
    entityId: student.id,
    action: 'STUDENT_PROFILE_UPDATE',
    ipAddress: req.ip
  });

  const updated = db.get(`SELECT * FROM students WHERE id = ?`, [student.id]);
  return res.json({
    success: true,
    message: 'Official academic record, latest semester CGPA, and arrears successfully updated.',
    data: updated
  });
});

/**
 * POST /api/v1/students/resumes
 * Uploads/registers a new versioned resume
 */
router.post('/resumes', authenticateToken, requireRole('STUDENT'), (req, res) => {
  const student = db.get(`SELECT id FROM students WHERE user_id = ?`, [req.user.id]);
  if (!student) {
    return res.status(404).json({ success: false, error: { message: 'Student profile not found.' } });
  }

  const { title, fileBase64, isDefault, fileSizeBytes } = req.body;
  if (!title) {
    return res.status(400).json({ success: false, error: { message: 'Resume title or file name is required.' } });
  }

  if (!fileBase64) {
    return res.status(400).json({
      success: false,
      error: { message: 'Original PDF file binary data is required. Please select a valid PDF file to upload.' }
    });
  }

  // Enforce PDF format
  const cleanTitle = title.trim();
  const finalTitle = cleanTitle.toLowerCase().endsWith('.pdf') ? cleanTitle : `${cleanTitle}.pdf`;

  const id = generateUuid();
  let cleanBase64 = fileBase64;
  if (cleanBase64.includes(',')) {
    cleanBase64 = cleanBase64.split(',')[1];
  }
  const fileBuffer = Buffer.from(cleanBase64, 'base64');

  // Verify that buffer is a valid authentic PDF (starts with %PDF)
  if (fileBuffer.length < 50 || !fileBuffer.subarray(0, 5).toString('latin1').startsWith('%PDF')) {
    return res.status(400).json({
      success: false,
      error: { message: 'The uploaded file is not a valid PDF document. Please upload an authentic PDF document.' }
    });
  }

  const checksum = computeSha256(fileBuffer);
  const sizeBytes = fileBuffer.length;
  const safeTitle = finalTitle.replace(/[^a-zA-Z0-9._-]/g, '_');
  const diskPath = path.join(UPLOADS_RESUMES_DIR, `${id}_${safeTitle}`);
  try {
    fs.writeFileSync(diskPath, fileBuffer);
  } catch (fsErr) {
    console.warn('[Resume Disk Write Warning]', fsErr.message);
  }
  const storageKey = diskPath;

  db.transaction(() => {
    const existingCount = db.get(
      `SELECT COUNT(*) as cnt FROM student_resumes WHERE student_id = ? AND deleted_at IS NULL`,
      [student.id]
    );
    const shouldBeDefault = Boolean(isDefault || (existingCount && existingCount.cnt === 0));

    if (shouldBeDefault) {
      // Unset previous defaults
      db.run(`UPDATE student_resumes SET is_default = 0 WHERE student_id = ?`, [student.id]);
    }

    db.run(
      `INSERT INTO student_resumes (id, student_id, title, file_storage_key, file_checksum_sha256, file_size_bytes, file_data, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, student.id, finalTitle, storageKey, checksum, sizeBytes, fileBuffer, shouldBeDefault ? 1 : 0]
    );
  });

  const created = db.get(`SELECT * FROM student_resumes WHERE id = ?`, [id]);
  return res.status(201).json({
    success: true,
    message: 'Resume uploaded successfully.',
    data: created
  });
});

/**
 * PUT /api/v1/students/resumes/:id/default
 */
router.put('/resumes/:id/default', authenticateToken, requireRole('STUDENT'), (req, res) => {
  const student = db.get(`SELECT id FROM students WHERE user_id = ?`, [req.user.id]);
  const resume = db.get(`SELECT id FROM student_resumes WHERE id = ? AND student_id = ? AND deleted_at IS NULL`, [req.params.id, student.id]);

  if (!resume) {
    return res.status(404).json({ success: false, error: { message: 'Resume not found.' } });
  }

  db.transaction(() => {
    db.run(`UPDATE student_resumes SET is_default = 0 WHERE student_id = ?`, [student.id]);
    db.run(`UPDATE student_resumes SET is_default = 1 WHERE id = ?`, [resume.id]);
  });

  return res.json({ success: true, message: 'Default active resume updated.' });
});

/**
 * DELETE /api/v1/students/resumes/:id
 * Soft deletion to preserve snapshot references
 */
router.delete('/resumes/:id', authenticateToken, requireRole('STUDENT'), (req, res) => {
  const student = db.get(`SELECT id FROM students WHERE user_id = ?`, [req.user.id]);
  db.run(
    `UPDATE student_resumes SET deleted_at = datetime('now') WHERE id = ? AND student_id = ?`,
    [req.params.id, student.id]
  );
  return res.json({ success: true, message: 'Resume removed from active repository.' });
});

/**
 * GET /api/v1/students/resumes/:id/download
 * Student downloads their own uploaded resume directly from DB
 */
router.get('/resumes/:id/download', authenticateToken, requireRole('STUDENT'), (req, res) => {
  const student = db.get(`SELECT id FROM students WHERE user_id = ?`, [req.user.id]);
  if (!student) {
    return res.status(404).json({ success: false, error: { message: 'Student profile not found.' } });
  }

  const resume = db.get(`SELECT * FROM student_resumes WHERE id = ? AND student_id = ? AND deleted_at IS NULL`, [req.params.id, student.id]);
  if (!resume) {
    return res.status(404).json({ success: false, error: { message: 'Resume not found.' } });
  }

  let fileBuffer = null;
  if (resume.file_data) {
    fileBuffer = Buffer.from(resume.file_data);
  } else if (resume.file_storage_key && fs.existsSync(resume.file_storage_key)) {
    fileBuffer = fs.readFileSync(resume.file_storage_key);
  }

  if (!fileBuffer) {
    return res.status(404).json({ success: false, error: { message: 'Resume file data not found.' } });
  }

  const cleanFileName = resume.title.toLowerCase().endsWith('.pdf') ? resume.title : `${resume.title}.pdf`;
  const safeAsciiFilename = cleanFileName.replace(/["\r\n\\]/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeAsciiFilename}"; filename*=UTF-8''${encodeURIComponent(cleanFileName)}`);
  res.setHeader('Content-Length', fileBuffer.length);
  return res.end(fileBuffer);
});

/**
 * POST /api/v1/students/documents
 * Uploads marksheets or certificates to private vault with academic percentage sync
 */
router.post('/documents', authenticateToken, requireRole('STUDENT'), (req, res) => {
  const student = db.get(`SELECT * FROM students WHERE user_id = ?`, [req.user.id]);
  const { documentType, title, percentage, fileName, fileSizeBytes } = req.body;

  if (!documentType || !title) {
    return res.status(400).json({ success: false, error: { message: 'Document type and title required.' } });
  }

  // Prevent duplicate uploads for the same document category
  const existingCategoryDoc = db.get(
    `SELECT id, title FROM student_documents WHERE student_id = ? AND document_type = ?`,
    [student.id, documentType]
  );
  if (existingCategoryDoc) {
    return res.status(409).json({
      success: false,
      error: { message: 'This document category is already uploaded. Please use Edit below to update it.' }
    });
  }

  const id = generateUuid();
  const safeFileName = (fileName || `${title.replace(/\s+/g, '_')}.pdf`).trim();
  const storageKey = `vault/${student.id}/${Date.now()}_${safeFileName}`;
  const sizeBytes = parseInt(fileSizeBytes || 250000, 10);
  const parsedPercentage = percentage !== undefined && percentage !== '' ? parseFloat(percentage) : null;

  db.transaction(() => {
    db.run(
      `INSERT INTO student_documents (
        id, student_id, document_type, title, file_storage_key, file_size_bytes, percentage_or_cgpa, file_name, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, student.id, documentType, title.trim(), storageKey, sizeBytes, parsedPercentage, safeFileName]
    );

    // Synchronize student academic profile percentages with verified document entry
    if (parsedPercentage !== null && !isNaN(parsedPercentage)) {
      if (documentType === 'MARKSHEET_10TH') {
        db.run(`UPDATE students SET tenth_percentage = ?, updated_at = datetime('now') WHERE id = ?`, [parsedPercentage, student.id]);
      } else if (documentType === 'MARKSHEET_12TH') {
        db.run(`UPDATE students SET twelfth_percentage = ?, updated_at = datetime('now') WHERE id = ?`, [parsedPercentage, student.id]);
      } else if (documentType === 'SEMESTER_TRANSCRIPT') {
        db.run(`UPDATE students SET current_cgpa = ?, updated_at = datetime('now') WHERE id = ?`, [parsedPercentage, student.id]);
      }
    }
  });

  const doc = db.get(`SELECT * FROM student_documents WHERE id = ?`, [id]);
  const updatedStudent = db.get(`SELECT * FROM students WHERE id = ?`, [student.id]);

  return res.status(201).json({
    success: true,
    message: 'Academic marksheet securely saved to verification vault.',
    data: { document: doc, student: updatedStudent }
  });
});

/**
 * PUT /api/v1/students/documents/:id
 * Allows student to edit document title, type, and correct mistake in percentage/marks
 */
router.put('/documents/:id', authenticateToken, requireRole('STUDENT'), (req, res) => {
  const student = db.get(`SELECT * FROM students WHERE user_id = ?`, [req.user.id]);
  const doc = db.get(`SELECT * FROM student_documents WHERE id = ? AND student_id = ?`, [req.params.id, student.id]);

  if (!doc) {
    return res.status(404).json({ success: false, error: { message: 'Document not found in your vault.' } });
  }

  const { documentType = doc.document_type, title = doc.title, percentage, fileName, fileSizeBytes } = req.body;
  if (!documentType || !title) {
    return res.status(400).json({ success: false, error: { message: 'Document type and title required.' } });
  }

  // If changing category to another type, check that another document of that type does not already exist
  if (documentType !== doc.document_type) {
    const existingCat = db.get(
      `SELECT id, title FROM student_documents WHERE student_id = ? AND document_type = ? AND id != ?`,
      [student.id, documentType, doc.id]
    );
    if (existingCat) {
      return res.status(409).json({
        success: false,
        error: { message: `Another document with category '${documentType}' already exists in your vault.` }
      });
    }
  }

  const parsedPercentage = percentage !== undefined && percentage !== '' ? parseFloat(percentage) : doc.percentage_or_cgpa;
  const safeFileName = fileName ? fileName.trim() : doc.file_name;
  const sizeBytes = fileSizeBytes ? parseInt(fileSizeBytes, 10) : doc.file_size_bytes;

  db.transaction(() => {
    db.run(
      `UPDATE student_documents 
       SET document_type = ?, title = ?, percentage_or_cgpa = ?, file_name = ?, file_size_bytes = ?
       WHERE id = ? AND student_id = ?`,
      [documentType, title.trim(), parsedPercentage, safeFileName, sizeBytes, doc.id, student.id]
    );

    // Re-synchronize academic percentage in student profile if modified
    if (parsedPercentage !== null && !isNaN(parsedPercentage)) {
      if (documentType === 'MARKSHEET_10TH') {
        db.run(`UPDATE students SET tenth_percentage = ?, updated_at = datetime('now') WHERE id = ?`, [parsedPercentage, student.id]);
      } else if (documentType === 'MARKSHEET_12TH') {
        db.run(`UPDATE students SET twelfth_percentage = ?, updated_at = datetime('now') WHERE id = ?`, [parsedPercentage, student.id]);
      } else if (documentType === 'SEMESTER_TRANSCRIPT') {
        db.run(`UPDATE students SET current_cgpa = ?, updated_at = datetime('now') WHERE id = ?`, [parsedPercentage, student.id]);
      }
    }
  });

  const updatedDoc = db.get(`SELECT * FROM student_documents WHERE id = ?`, [doc.id]);
  const updatedStudent = db.get(`SELECT * FROM students WHERE id = ?`, [student.id]);

  return res.json({
    success: true,
    message: 'Vault document details successfully updated.',
    data: { document: updatedDoc, student: updatedStudent }
  });
});

/**
 * DELETE /api/v1/students/documents/:id
 * Removes a marksheet / document uploaded by mistake
 */
router.delete('/documents/:id', authenticateToken, requireRole('STUDENT'), (req, res) => {
  const student = db.get(`SELECT id FROM students WHERE user_id = ?`, [req.user.id]);
  const doc = db.get(`SELECT * FROM student_documents WHERE id = ? AND student_id = ?`, [req.params.id, student.id]);

  if (!doc) {
    return res.status(404).json({ success: false, error: { message: 'Document not found in your vault.' } });
  }

  db.run(`DELETE FROM student_documents WHERE id = ? AND student_id = ?`, [doc.id, student.id]);

  return res.json({
    success: true,
    message: `Document '${doc.title}' removed from verification vault.`
  });
});

/**
 * GET /api/v1/students/list
 * Admin endpoint to view and filter all students with academic metrics
 */
router.get('/list', authenticateToken, requireRole('ADMIN'), (req, res) => {
  const { status, department, graduationYear } = req.query;

  let sql = `
    SELECT s.*, u.email, u.status as user_status
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    sql += ` AND s.verification_status = ?`;
    params.push(status);
  }
  if (department) {
    sql += ` AND s.department = ?`;
    params.push(department);
  }
  if (graduationYear && graduationYear !== 'ALL' && graduationYear !== 'undefined' && !isNaN(Number(graduationYear))) {
    sql += ` AND s.graduation_year = ?`;
    params.push(Number(graduationYear));
  }

  sql += ` ORDER BY s.created_at DESC`;
  const students = db.all(sql, params);

  return res.json({
    success: true,
    data: students
  });
});

/**
 * GET /api/v1/students/:id/details
 * Admin endpoint to inspect student verification details and marksheets
 */
router.get('/:id/details', authenticateToken, requireRole('ADMIN'), (req, res) => {
  const student = db.get(`
    SELECT s.*, u.email
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `, [req.params.id]);

  if (!student) {
    return res.status(404).json({ success: false, error: { message: 'Student not found.' } });
  }

  const documents = db.all(`SELECT * FROM student_documents WHERE student_id = ?`, [student.id]);
  const resumes = db.all(`SELECT * FROM student_resumes WHERE student_id = ? AND deleted_at IS NULL`, [student.id]);
  const applications = db.all(`
    SELECT a.*, j.title as job_title, c.name as company_name
    FROM applications a
    JOIN jobs j ON a.job_id = j.id
    JOIN companies c ON j.company_id = c.id
    WHERE a.student_id = ?
  `, [student.id]);

  return res.json({
    success: true,
    data: {
      student,
      documents,
      resumes,
      applications
    }
  });
});

/**
 * PUT /api/v1/students/:id/verify
 * Admin action to approve or flag a student profile and commit verified arrears
 */
router.put('/:id/verify', authenticateToken, requireRole('ADMIN'), (req, res) => {
  const { status, remarks, standingArrears, historyOfArrears } = req.body;
  if (!['VERIFIED', 'CORRECTION_REQUIRED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid verification status.' } });
  }

  const student = db.get(`SELECT * FROM students WHERE id = ?`, [req.params.id]);
  if (!student) {
    return res.status(404).json({ success: false, error: { message: 'Student record not found.' } });
  }

  const newStanding = standingArrears !== undefined ? Math.max(0, parseInt(standingArrears, 10)) : student.standing_arrears;
  const newHistory = historyOfArrears !== undefined ? Math.max(newStanding, parseInt(historyOfArrears, 10)) : student.history_of_arrears;

  db.run(
    `UPDATE students 
     SET verification_status = ?, 
         standing_arrears = ?, 
         history_of_arrears = ?, 
         verified_by = ?, 
         updated_at = datetime('now') 
     WHERE id = ?`,
    [status, newStanding, newHistory, req.user.id, student.id]
  );

  logAudit({
    actorId: req.user.id,
    entityName: 'students',
    entityId: student.id,
    action: `STUDENT_VERIFICATION_${status}`,
    previousState: { verification_status: student.verification_status, standing_arrears: student.standing_arrears },
    newState: { verification_status: status, standing_arrears: newStanding, history_of_arrears: newHistory, remarks },
    ipAddress: req.ip
  });

  sendNotification({
    userId: student.user_id,
    title: `Academic Profile Verification: ${status}`,
    message: status === 'VERIFIED'
      ? `Congratulations! Your profile has been officially verified by the Placement Cell (Verified Active Arrears: ${newStanding}). You are now eligible to apply for campus drives.`
      : `Placement Cell update: ${remarks || 'Please update your academic certificates and marksheets.'}`
  });

  const updated = db.get(`SELECT * FROM students WHERE id = ?`, [student.id]);
  return res.json({
    success: true,
    message: `Student status successfully set to ${status} with ${newStanding} standing arrears.`,
    data: updated
  });
});

/**
 * PUT /api/v1/students/:id/arrears
 * Quick 1-click update of student standing backlogs by Placement Admin
 */
router.put('/:id/arrears', authenticateToken, requireRole('ADMIN'), (req, res) => {
  const { standingArrears, historyOfArrears, remarks } = req.body;
  const student = db.get(`SELECT * FROM students WHERE id = ?`, [req.params.id]);
  if (!student) {
    return res.status(404).json({ success: false, error: { message: 'Student not found.' } });
  }

  const newStanding = Math.max(0, parseInt(standingArrears ?? student.standing_arrears, 10));
  const newHistory = Math.max(newStanding, parseInt(historyOfArrears ?? student.history_of_arrears, 10));

  db.run(
    `UPDATE students SET standing_arrears = ?, history_of_arrears = ?, updated_at = datetime('now') WHERE id = ?`,
    [newStanding, newHistory, student.id]
  );

  logAudit({
    actorId: req.user.id,
    entityName: 'students',
    entityId: student.id,
    action: 'UPDATE_ARREARS_RECORD',
    previousState: { standing_arrears: student.standing_arrears, history_of_arrears: student.history_of_arrears },
    newState: { standing_arrears: newStanding, history_of_arrears: newHistory, remarks },
    ipAddress: req.ip
  });

  return res.json({
    success: true,
    message: `Active standing arrears updated to ${newStanding} for ${student.full_name}.`,
    data: { id: student.id, standing_arrears: newStanding, history_of_arrears: newHistory }
  });
});

export default router;
