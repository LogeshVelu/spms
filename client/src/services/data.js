/**
 * API Endpoints & URI Master Registry (data.js)
 * 
 * Centralized URI mapping for all backend REST endpoints (/api/v1).
 * Having all URIs in one place enables:
 *  1. Reusability across services and components
 *  2. Quick backend route updates without searching through multiple files
 *  3. Dynamic path-builder functions for parameterized routes
 */

// Centralized API base supporting local dev (/api/v1) and cloud production (VITE_API_URL + /api/v1)
export const API_BASE = (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, '') : '') + '/api/v1';

export const API_ENDPOINTS = {
  // Authentication & Session
  AUTH: {
    DEMO_ACCOUNTS: '/auth/demo-accounts',
    LOGIN: '/auth/login',
    SWITCH_DEMO: '/auth/switch-demo',
    REGISTER_STUDENT: '/auth/register-student',
    REGISTER_RECRUITER: '/auth/register-recruiter',
    ME: '/auth/me'
  },

  // Student Profile, Academic Marksheets & Resumes
  STUDENTS: {
    ME: '/students/me',
    RESUMES: '/students/resumes',
    RESUME_DEFAULT: (id) => `/students/resumes/${id}/default`,
    RESUME_BY_ID: (id) => `/students/resumes/${id}`,
    RESUME_DOWNLOAD: (id) => `/students/resumes/${id}/download`,
    DOCUMENTS: '/students/documents',
    DOCUMENT_BY_ID: (id) => `/students/documents/${id}`,
    LIST: (queryString = '') => `/students/list${queryString ? `?${queryString}` : ''}`,
    DETAILS: (id) => `/students/${id}/details`,
    VERIFY: (id) => `/students/${id}/verify`,
    ARREARS: (id) => `/students/${id}/arrears`
  },

  // Corporate Partner / Company Profiles
  COMPANIES: {
    ALL: '/companies',
    PENDING: '/companies/pending',
    APPROVE: (id) => `/companies/${id}/approve`,
    MY_COMPANY: '/companies/my-company'
  },

  // Campus Recruitment Drives & Job Postings
  JOBS: {
    LIST: '/jobs',
    BY_ID: (id) => `/jobs/${id}`,
    APPROVE: (id) => `/jobs/${id}/approve`,
    CHECK_ELIGIBILITY: (id) => `/jobs/${id}/check-eligibility`
  },

  // Candidate Applications & Hiring Rounds
  APPLICATIONS: {
    APPLY: '/applications/apply',
    MY_APPLICATIONS: '/applications/my-applications',
    BY_JOB: (jobId) => `/applications/job/${jobId}`,
    STAGE_RESULT: (applicationId) => `/applications/${applicationId}/stage-result`,
    STATUS: (applicationId) => `/applications/${applicationId}/status`
  },

  // Interview Drive Slots & Calendar
  INTERVIEWS: {
    SCHEDULE: '/interviews/schedule',
    MY_INTERVIEWS: '/interviews/my-interviews',
    ALL: '/interviews/all',
    STATUS: (id) => `/interviews/${id}/status`
  },

  // Formal Placement Offers
  OFFERS: {
    ISSUE: '/offers/issue',
    MY_OFFERS: '/offers/my-offers',
    RESPOND: (id) => `/offers/${id}/respond`
  },

  // Institutional Placement Analytics & Placed Candidates
  ANALYTICS: {
    COHORT: (queryString = '') => `/analytics/cohort${queryString ? `?${queryString}` : ''}`,
    PLACED_STUDENTS: (queryString = '') => `/analytics/placed-students${queryString ? `?${queryString}` : ''}`,
    RECRUITER: '/analytics/recruiter'
  },

  // Immutable Audit Trail
  AUDIT: {
    LOGS: (queryString = '') => `/audit/logs${queryString ? `?${queryString}` : ''}`
  },

  // Real-Time System Notifications
  NOTIFICATIONS: {
    LIST: '/notifications',
    MARK_READ: (id) => `/notifications/${id}/read`,
    READ_ALL: '/notifications/read-all'
  },

  // Immutable Resume Snapshots
  RESUMES: {
    SNAPSHOT: (snapshotId) => `/resumes/download/${snapshotId}`,
    PDF: (snapshotId) => `/resumes/download/${snapshotId}/pdf`
  }
};

export default API_ENDPOINTS;
