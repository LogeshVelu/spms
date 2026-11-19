/**
 * SPMS Unified API Client Service
 * 
 * Handles all authenticated communication between the React frontend
 * and the Express REST API (/api/v1). Automatically handles bearer tokens,
 * JSON serialization, and error propagation.
 * 
 * All endpoint URIs are centralized in ./data.js for reusability.
 */

import { API_BASE, API_ENDPOINTS } from './data.js';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('spms_token') || null;
  }

  // =========================================================================
  // 1. TOKEN & SESSION MANAGEMENT
  // =========================================================================

  /**
   * Sets or clears the active JWT authentication token.
   * @param {string|null} token 
   */
  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('spms_token', token);
    } else {
      localStorage.removeItem('spms_token');
    }
  }

  /**
   * Retrieves the current active JWT token.
   * @returns {string|null}
   */
  getToken() {
    return this.token;
  }

  /**
   * Core HTTP request wrapper with automatic Authorization header injection.
   * @param {string} endpoint API endpoint relative to /api/v1
   * @param {RequestInit} options Fetch options
   * @returns {Promise<any>}
   */
  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(options.headers || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error = new Error(data.error?.message || `Request failed with status ${response.status}`);
        error.code = data.error?.code || 'API_ERROR';
        error.details = data.error || {};
        error.status = response.status;
        throw error;
      }

      return data;
    } catch (err) {
      console.error(`[API Error] ${endpoint}:`, err);
      throw err;
    }
  }

  // =========================================================================
  // 2. AUTHENTICATION & DEMO SWITCHER
  // =========================================================================

  /**
   * Returns predefined demo accounts for one-click testing.
   */
  async getDemoAccounts() {
    return this.request(API_ENDPOINTS.AUTH.DEMO_ACCOUNTS);
  }

  /**
   * Performs standard user email/password login.
   */
  async login(email, password) {
    const res = await this.request(API_ENDPOINTS.AUTH.LOGIN, {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (res.data?.token) this.setToken(res.data.token);
    return res;
  }

  /**
   * Instant persona switcher for demo workflows.
   */
  async switchDemo(email) {
    const res = await this.request(API_ENDPOINTS.AUTH.SWITCH_DEMO, {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    if (res.data?.token) this.setToken(res.data.token);
    return res;
  }

  /**
   * Registers a new student candidate profile.
   * Note: Registration does not automatically log in; user must sign in.
   */
  async registerStudent(formData) {
    const res = await this.request(API_ENDPOINTS.AUTH.REGISTER_STUDENT, {
      method: 'POST',
      body: JSON.stringify(formData)
    });
    return res;
  }

  /**
   * Registers a new corporate recruiter partner.
   * Note: Registration does not automatically log in; user must sign in.
   */
  async registerRecruiter(formData) {
    const res = await this.request(API_ENDPOINTS.AUTH.REGISTER_RECRUITER, {
      method: 'POST',
      body: JSON.stringify(formData)
    });
    return res;
  }

  /**
   * Returns current authenticated user and role profile.
   */
  async getMe() {
    return this.request(API_ENDPOINTS.AUTH.ME);
  }

  /**
   * Logs out the user and clears stored session token.
   */
  logout() {
    this.setToken(null);
  }

  // =========================================================================
  // 3. STUDENT PROFILE & VAULT SERVICES
  // =========================================================================

  /**
   * Fetches the current logged-in student's full academic and vault profile.
   */
  async getStudentProfile() {
    return this.request(API_ENDPOINTS.STUDENTS.ME);
  }

  /**
   * Updates student personal and academic profile fields.
   */
  async updateStudentProfile(data) {
    return this.request(API_ENDPOINTS.STUDENTS.ME, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * Uploads a structured JSON resume into the student vault.
   */
  async uploadResume(data) {
    return this.request(API_ENDPOINTS.STUDENTS.RESUMES, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Designates a specific resume version as primary/default.
   */
  async setDefaultResume(id) {
    return this.request(API_ENDPOINTS.STUDENTS.RESUME_DEFAULT(id), { method: 'PUT' });
  }

  /**
   * Deletes a non-frozen resume from the vault.
   */
  async deleteResume(id) {
    return this.request(API_ENDPOINTS.STUDENTS.RESUME_BY_ID(id), { method: 'DELETE' });
  }

  /**
   * Downloads a student resume rendered as standard PDF.
   */
  async downloadStudentResume(id, title = 'Resume.pdf') {
    const token = this.getToken();
    const downloadUri = `${API_BASE}${API_ENDPOINTS.STUDENTS.RESUME_DOWNLOAD(id)}`;
    const response = await fetch(downloadUri, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || 'Failed to download resume PDF.');
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanName = title.toLowerCase().endsWith('.pdf') ? title : `${title}.pdf`;
    a.download = cleanName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  /**
   * Uploads an academic certificate or marksheet document to the vault.
   */
  async uploadDocument(data) {
    return this.request(API_ENDPOINTS.STUDENTS.DOCUMENTS, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Updates an existing document record.
   */
  async updateDocument(id, data) {
    return this.request(API_ENDPOINTS.STUDENTS.DOCUMENT_BY_ID(id), {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * Deletes an uploaded document from the vault.
   */
  async deleteDocument(id) {
    return this.request(API_ENDPOINTS.STUDENTS.DOCUMENT_BY_ID(id), {
      method: 'DELETE'
    });
  }

  // =========================================================================
  // 4. SUPER ADMIN PORTAL SERVICES
  // =========================================================================

  /**
   * Lists student cohort directory with optional status/batch filters.
   */
  async listStudents(params = {}) {
    const cleanParams = {};
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== 'ALL' && v !== 'undefined') {
        cleanParams[k] = v;
      }
    });
    const qs = new URLSearchParams(cleanParams).toString();
    return this.request(API_ENDPOINTS.STUDENTS.LIST(qs));
  }

  /**
   * Retrieves comprehensive student profile with all uploaded vault documents.
   */
  async getStudentDetails(id) {
    return this.request(API_ENDPOINTS.STUDENTS.DETAILS(id));
  }

  /**
   * Verifies or rejects student academic profile for campus placement eligibility.
   */
  async verifyStudent(id, data) {
    return this.request(API_ENDPOINTS.STUDENTS.VERIFY(id), {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * Adjusts official active arrears count for a candidate.
   */
  async updateStudentArrears(id, data) {
    return this.request(API_ENDPOINTS.STUDENTS.ARREARS(id), {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  // =========================================================================
  // 5. CORPORATE PARTNER & COMPANY DIRECTORY
  // =========================================================================

  /**
   * Lists corporate recruitment partners.
   */
  async getCompanies(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const uri = qs ? `${API_ENDPOINTS.COMPANIES.ALL}?${qs}` : API_ENDPOINTS.COMPANIES.ALL;
    return this.request(uri);
  }

  /**
   * Lists corporate partner accounts pending Super Admin verification.
   */
  async getPendingCompanies() {
    return this.request(API_ENDPOINTS.COMPANIES.PENDING);
  }

  /**
   * Approves or rejects corporate partner registration.
   */
  async approveCompany(id, status) {
    return this.request(API_ENDPOINTS.COMPANIES.APPROVE(id), {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  }

  /**
   * Fetches the current logged-in recruiter's company profile.
   */
  async getMyCompany() {
    return this.request(API_ENDPOINTS.COMPANIES.MY_COMPANY);
  }

  /**
   * Updates recruiter organization details.
   */
  async updateMyCompany(data) {
    return this.request(API_ENDPOINTS.COMPANIES.MY_COMPANY, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  // =========================================================================
  // 6. CAMPUS RECRUITMENT OPENINGS & JOBS
  // =========================================================================

  /**
   * Lists published campus recruitment openings.
   */
  async getJobs() {
    return this.request(API_ENDPOINTS.JOBS.LIST);
  }

  /**
   * Fetches specific job details with requirements and hiring stages.
   */
  async getJob(id) {
    return this.request(API_ENDPOINTS.JOBS.BY_ID(id));
  }

  /**
   * Recruiter posts a new campus recruitment job drive.
   */
  async createJob(data) {
    return this.request(API_ENDPOINTS.JOBS.LIST, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Recruiter updates job details, compensation, or cut-offs.
   */
  async updateJob(id, data) {
    return this.request(API_ENDPOINTS.JOBS.BY_ID(id), {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * Deletes a campus recruitment opening.
   */
  async deleteJob(id) {
    return this.request(API_ENDPOINTS.JOBS.BY_ID(id), {
      method: 'DELETE'
    });
  }

  /**
   * Admin approves a corporate job opening for publishing.
   */
  async approveJob(id) {
    return this.request(API_ENDPOINTS.JOBS.APPROVE(id), { method: 'PUT' });
  }

  /**
   * Executes authoritative server-side rule engine evaluation against student profile.
   */
  async checkEligibility(jobId) {
    return this.request(API_ENDPOINTS.JOBS.CHECK_ELIGIBILITY(jobId));
  }

  // =========================================================================
  // 7. APPLICATIONS & MULTI-ROUND EVALUATIONS
  // =========================================================================

  /**
   * Student applies to a job opening with an immutable resume snapshot.
   */
  async applyToJob(jobId, resumeId) {
    return this.request(API_ENDPOINTS.APPLICATIONS.APPLY, {
      method: 'POST',
      body: JSON.stringify({ jobId, resumeId })
    });
  }

  /**
   * Retrieves all applications submitted by the current student.
   */
  async getMyApplications() {
    return this.request(API_ENDPOINTS.APPLICATIONS.MY_APPLICATIONS);
  }

  /**
   * Recruiter retrieves candidate applications for a specific job drive.
   */
  async getJobApplicants(jobId) {
    return this.request(API_ENDPOINTS.APPLICATIONS.BY_JOB(jobId));
  }

  /**
   * Recruiter records stage evaluation outcome (SHORTLISTED, PASSED, REJECTED).
   */
  async updateStageResult(applicationId, data) {
    return this.request(API_ENDPOINTS.APPLICATIONS.STAGE_RESULT(applicationId), {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * Advances application lifecycle status (IN_PROGRESS, OFFERED, REJECTED).
   */
  async transitionApplicationStatus(applicationId, status, notes) {
    return this.request(API_ENDPOINTS.APPLICATIONS.STATUS(applicationId), {
      method: 'PUT',
      body: JSON.stringify({ status, notes })
    });
  }

  // =========================================================================
  // 8. INTERVIEWS & CALENDAR SCHEDULING
  // =========================================================================

  /**
   * Recruiter schedules or updates an interview slot for a candidate round.
   */
  async scheduleInterview(data) {
    return this.request(API_ENDPOINTS.INTERVIEWS.SCHEDULE, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Retrieves upcoming and past interviews for the current student.
   */
  async getMyInterviews() {
    return this.request(API_ENDPOINTS.INTERVIEWS.MY_INTERVIEWS);
  }

  /**
   * Super Admin retrieves all interview sessions across all drives.
   */
  async getAllInterviews() {
    return this.request(API_ENDPOINTS.INTERVIEWS.ALL);
  }

  /**
   * Updates interview status (SCHEDULED, COMPLETED, CANCELLED).
   */
  async updateInterviewStatus(id, status, notes) {
    return this.request(API_ENDPOINTS.INTERVIEWS.STATUS(id), {
      method: 'PUT',
      body: JSON.stringify({ status, notes })
    });
  }

  // =========================================================================
  // 9. FORMAL PLACEMENT OFFERS
  // =========================================================================

  /**
   * Recruiter formally issues a placement offer letter to a candidate.
   */
  async issueOffer(data) {
    return this.request(API_ENDPOINTS.OFFERS.ISSUE, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Student fetches all formal placement offers extended to them.
   */
  async getMyOffers() {
    return this.request(API_ENDPOINTS.OFFERS.MY_OFFERS);
  }

  /**
   * Student accepts or declines a formal placement offer.
   */
  async respondToOffer(id, action, reason) {
    return this.request(API_ENDPOINTS.OFFERS.RESPOND(id), {
      method: 'PUT',
      body: JSON.stringify({ action, reason })
    });
  }

  // =========================================================================
  // 10. INSTITUTIONAL ANALYTICS & PLACED DIRECTORY
  // =========================================================================

  /**
   * Super Admin cohort metrics & department-wise placement statistics.
   */
  async getCohortAnalytics(params = {}) {
    const cleanParams = {};
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== 'ALL' && v !== 'undefined') {
        cleanParams[k] = v;
      }
    });
    const qs = new URLSearchParams(cleanParams).toString();
    return this.request(API_ENDPOINTS.ANALYTICS.COHORT(qs));
  }

  /**
   * Super Admin verified placed student candidate registry.
   */
  async getPlacedStudents(params = {}) {
    const cleanParams = {};
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== 'ALL' && v !== 'undefined') {
        cleanParams[k] = v;
      }
    });
    const qs = new URLSearchParams(cleanParams).toString();
    return this.request(API_ENDPOINTS.ANALYTICS.PLACED_STUDENTS(qs));
  }

  /**
   * Recruiter drive analytics and hiring funnel statistics.
   */
  async getRecruiterAnalytics() {
    return this.request(API_ENDPOINTS.ANALYTICS.RECRUITER);
  }

  // =========================================================================
  // 11. AUDIT LOGS & NOTIFICATIONS
  // =========================================================================

  /**
   * Super Admin immutable audit trail.
   */
  async getAuditLogs(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(API_ENDPOINTS.AUDIT.LOGS(qs));
  }

  /**
   * Fetches real-time notifications for the logged-in user.
   */
  async getNotifications() {
    return this.request(API_ENDPOINTS.NOTIFICATIONS.LIST);
  }

  /**
   * Marks a single notification as read.
   */
  async markNotificationRead(id) {
    return this.request(API_ENDPOINTS.NOTIFICATIONS.MARK_READ(id), { method: 'PUT' });
  }

  /**
   * Marks all user notifications as read.
   */
  async markAllNotificationsRead() {
    return this.request(API_ENDPOINTS.NOTIFICATIONS.READ_ALL, { method: 'PUT' });
  }

  // =========================================================================
  // 12. IMMUTABLE RESUME SNAPSHOTS & AUDIT INSPECTIONS
  // =========================================================================

  /**
   * Inspects frozen snapshot details and integrity checksum.
   */
  async getResumeSnapshot(snapshotId) {
    return this.request(API_ENDPOINTS.RESUMES.SNAPSHOT(snapshotId));
  }

  /**
   * Downloads official frozen PDF snapshot associated with an application.
   */
  async downloadResumePdf(snapshotId, candidateName = 'Candidate') {
    const token = this.getToken();
    const pdfUri = `${API_BASE}${API_ENDPOINTS.RESUMES.PDF(snapshotId)}`;
    const response = await fetch(pdfUri, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || 'Failed to download resume PDF.');
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Preserve original filename from Content-Disposition header if present
    const disposition = response.headers.get('content-disposition');
    let filename = `${candidateName.replace(/\s+/g, '_')}_Resume.pdf`;
    if (disposition) {
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const regularMatch = disposition.match(/filename="?([^";]+)"?/i);
      if (utf8Match && utf8Match[1]) {
        filename = decodeURIComponent(utf8Match[1].trim());
      } else if (regularMatch && regularMatch[1]) {
        filename = regularMatch[1].trim();
      }
    }
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    if (a.parentNode) {
      a.parentNode.removeChild(a);
    }
  }
}

export { API_BASE, API_ENDPOINTS };
export const api = new ApiService();
export default api;
