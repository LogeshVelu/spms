/**
 * Application Constants
 * Authoritative constants used across Student, Recruiter, and Admin portals.
 */

export const DOCUMENT_CATEGORIES = [
  { value: 'MARKSHEET_10TH', title: '10th Secondary School Marksheet (SSLC)', scoreLabel: '10th Board Percentage (%)', placeholder: 'e.g. 91.50', max: 100, step: '0.01' },
  { value: 'MARKSHEET_12TH', title: '12th Higher Secondary Marksheet (HSC)', scoreLabel: '12th Board Percentage (%)', placeholder: 'e.g. 93.20', max: 100, step: '0.01' },
  { value: 'SEMESTER_1', title: 'Semester 1 Grade Sheet (SGPA)', scoreLabel: 'Semester 1 SGPA / Score', placeholder: 'e.g. 8.50', max: 10, step: '0.01' },
  { value: 'SEMESTER_2', title: 'Semester 2 Grade Sheet (SGPA)', scoreLabel: 'Semester 2 SGPA / Score', placeholder: 'e.g. 8.65', max: 10, step: '0.01' },
  { value: 'SEMESTER_3', title: 'Semester 3 Grade Sheet (SGPA)', scoreLabel: 'Semester 3 SGPA / Score', placeholder: 'e.g. 8.80', max: 10, step: '0.01' },
  { value: 'SEMESTER_4', title: 'Semester 4 Grade Sheet (SGPA)', scoreLabel: 'Semester 4 SGPA / Score', placeholder: 'e.g. 8.75', max: 10, step: '0.01' },
  { value: 'SEMESTER_5', title: 'Semester 5 Grade Sheet (SGPA)', scoreLabel: 'Semester 5 SGPA / Score', placeholder: 'e.g. 8.90', max: 10, step: '0.01' },
  { value: 'SEMESTER_6', title: 'Semester 6 Grade Sheet (SGPA)', scoreLabel: 'Semester 6 SGPA / Score', placeholder: 'e.g. 9.10', max: 10, step: '0.01' },
  { value: 'SEMESTER_7', title: 'Semester 7 Grade Sheet (SGPA)', scoreLabel: 'Semester 7 SGPA / Score', placeholder: 'e.g. 9.05', max: 10, step: '0.01' },
  { value: 'SEMESTER_8', title: 'Semester 8 Grade Sheet (SGPA)', scoreLabel: 'Semester 8 SGPA / Score', placeholder: 'e.g. 9.20', max: 10, step: '0.01' },
  { value: 'SEMESTER_TRANSCRIPT', title: 'Consolidated Semester Grade Sheet / Transcript', scoreLabel: 'Cumulative CGPA (out of 10.00)', placeholder: 'e.g. 8.95', max: 10, step: '0.01' },
  { value: 'DEGREE_CERT', title: 'Provisional Degree Certificate / Course Completion', scoreLabel: 'Overall Degree CGPA / Percentage', placeholder: 'e.g. 8.80', max: 100, step: '0.01' }
];

export const APPLICATION_STAGES = [
  { sequence: 1, name: 'Resume Screening & Eligibility Audit' },
  { sequence: 2, name: 'Round 2: Technical Interview' },
  { sequence: 3, name: 'Round 3: Final Executive & Culture Fit' }
];
