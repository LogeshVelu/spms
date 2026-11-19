import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';

const checkDeadlineExceeded = (deadlineStr) => {
  if (!deadlineStr) return false;
  const deadline = new Date(deadlineStr);
  if (typeof deadlineStr === 'string' && deadlineStr.trim().length <= 10) {
    deadline.setHours(23, 59, 59, 999);
  }
  return new Date() > deadline;
};

export const calculateJoiningDate = (createdAt) => {
  const base = createdAt ? new Date(createdAt) : new Date();
  if (isNaN(base.getTime())) return 'January 1, 2027';
  // Joining date formula: 1st of the month ~2-3 months ahead
  const d = new Date(base.getFullYear(), base.getMonth() + 3, 1);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
};

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

export const StudentPortal = ({ user, profile, onRefresh }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [studentData, setStudentData] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [eligibilityModal, setEligibilityModal] = useState(null); // { job, result, loading }
  const [applyingJob, setApplyingJob] = useState(null); // { job, selectedResumeId, loading }
  const [offerActionModal, setOfferActionModal] = useState(null); // { offer, action: 'ACCEPTED'|'DECLINED' }
  const [selectedOfferLetter, setSelectedOfferLetter] = useState(null);
  const [hasAutoOpenedOffer, setHasAutoOpenedOffer] = useState(false);
  const resumeFileInputRef = useRef(null);
  const [selectedApplyResumeId, setSelectedApplyResumeId] = useState('');
  const [submittingApplication, setSubmittingApplication] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [isResumeDragging, setIsResumeDragging] = useState(false);
  const [newResumeTitle, setNewResumeTitle] = useState('');
  const [newDocType, setNewDocType] = useState('MARKSHEET_10TH');
  const [newDocTitle, setNewDocTitle] = useState('10th Secondary School Marksheet (SSLC)');
  const [newDocPercentage, setNewDocPercentage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [editingDoc, setEditingDoc] = useState(null);
  const [editAcademicModal, setEditAcademicModal] = useState(false);
  const [academicForm, setAcademicForm] = useState({
    currentYear: 4,
    completedSemesters: 6,
    currentCgpa: '',
    standingArrears: '0',
    historyOfArrears: '0',
    graduationYear: 2026,
    tenthPercentage: '',
    twelfthPercentage: '',
    phone: '',
    specialization: ''
  });
  const [message, setMessage] = useState(null);
  const [resumeSuccessMessage, setResumeSuccessMessage] = useState(null);
  const [expandedCheck, setExpandedCheck] = useState({});

  // Filter strictly for interviews currently in SCHEDULED state across all applied drives
  const scheduledInterviewsCount = interviews.filter(inv => {
    const isShortlisted = inv.outcome === 'SHORTLISTED' || inv.outcome === 'PASSED';
    const isRejected = inv.outcome === 'REJECTED';
    return !isShortlisted && !isRejected && (inv.interview_status === 'SCHEDULED' || inv.outcome === 'SCHEDULED');
  }).length;

  useEffect(() => {
    loadAllData();
  }, [user]);

  useEffect(() => {
    if (activeTab === 'interviews_offers' && offers.length > 0 && !hasAutoOpenedOffer && !selectedOfferLetter) {
      setSelectedOfferLetter(offers[0]);
      setHasAutoOpenedOffer(true);
    }
  }, [activeTab, offers, hasAutoOpenedOffer, selectedOfferLetter]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [profileRes, jobsRes, appsRes, intRes, offersRes] = await Promise.all([
        api.getStudentProfile().catch(() => ({ data: {} })),
        api.getJobs().catch(() => ({ data: [] })),
        api.getMyApplications().catch(() => ({ data: [] })),
        api.getMyInterviews().catch(() => ({ data: [] })),
        api.getMyOffers().catch(() => ({ data: [] }))
      ]);

      setStudentData(profileRes.data || null);
      setJobs(jobsRes.data || []);
      setApplications(appsRes.data || []);
      setInterviews(intRes.data || []);
      setOffers(offersRes.data || []);
    } catch (err) {
      console.error('Failed to load student portal data', err);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  // Eligibility Check Handler
  const handleCheckEligibility = async (job) => {
    const curRes = studentData?.resumes || [];
    const def = curRes.find(r => r.is_default) || curRes[0];
    setSelectedApplyResumeId(def?.id || '');
    setEligibilityModal({ job, loading: true, result: null });
    try {
      const res = await api.checkEligibility(job.id);
      setEligibilityModal({ job, loading: false, result: res.data });
    } catch (err) {
      showToast(err.message, 'error');
      setEligibilityModal(null);
    }
  };

  // Application Submission Handler
  const handleApply = async (jobId, resumeId) => {
    if (!resumeId) {
      showToast('Please select a resume before submitting an application.', 'error');
      return;
    }
    setSubmittingApplication(true);
    try {
      const res = await api.applyToJob(jobId, resumeId);
      showToast(res.message || 'Application submitted successfully!');
      setApplyingJob(null);
      setEligibilityModal(null);
      loadAllData();
      if (onRefresh) onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmittingApplication(false);
    }
  };

  // Resume File Upload Handler (PDF only)
  const handleUploadResumeFile = async (file) => {
    if (!file) return;

    // Strict PDF file validation
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      showToast('Only PDF resume files (.pdf) are allowed. Please upload a PDF document.', 'error');
      return;
    }

    const curResumes = studentData?.resumes || [];
    let isDefault = false;

    if (curResumes.length === 0) {
      isDefault = true;
    } else {
      isDefault = window.confirm(
        `Resume "${file.name}" selected.\n\nDo you want to set this as your DEFAULT active resume for campus job applications?`
      );
    }

    setUploadingResume(true);
    const reader = new FileReader();
    reader.onerror = () => {
      setUploadingResume(false);
      showToast('Failed to read the selected PDF file.', 'error');
    };
    reader.onload = async () => {
      try {
        const base64Data = reader.result ? reader.result.split(',')[1] : null;
        const res = await api.uploadResume({
          title: file.name,
          fileSizeBytes: file.size,
          fileBase64: base64Data,
          isDefault
        });
        const successMsg = `Successfully uploaded your resume "${file.name}" to the vault!`;
        setResumeSuccessMessage(successMsg);
        showToast(successMsg);
        setTimeout(() => setResumeSuccessMessage(null), 8000);
        loadAllData();
        if (onRefresh) onRefresh();
      } catch (err) {
        showToast(err.message || 'Failed to upload resume.', 'error');
      } finally {
        setUploadingResume(false);
        if (resumeFileInputRef.current) {
          resumeFileInputRef.current.value = '';
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResumeFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUploadResumeFile(file);
    }
  };

  // Set Default Resume
  const handleSetDefaultResume = async (id, title) => {
    try {
      await api.setDefaultResume(id);
      showToast(`Default active resume set to "${title || 'selected resume'}".`);
      loadAllData();
      if (onRefresh) onRefresh();
    } catch (err) {
      showToast(err.message || 'Failed to update default resume.', 'error');
    }
  };

  // Delete Resume
  const handleDeleteResume = async (id, title) => {
    if (!window.confirm(`Are you sure you want to remove resume "${title}" from your vault?`)) return;
    try {
      await api.deleteResume(id);
      showToast(`Resume "${title}" removed successfully.`);
      loadAllData();
      if (onRefresh) onRefresh();
    } catch (err) {
      showToast(err.message || 'Failed to delete resume.', 'error');
    }
  };

  const getScoreMeta = (docType) => {
    const found = DOCUMENT_CATEGORIES.find(c => c.value === docType);
    if (found) {
      return { label: found.scoreLabel, placeholder: found.placeholder, step: found.step, max: found.max };
    }
    return { label: 'Academic Score / %', placeholder: 'e.g. 85.00', step: '0.01', max: 100 };
  };

  // Immediate category change updates title and score placeholder
  const handleCategoryChange = (catType) => {
    setNewDocType(catType);
    const found = DOCUMENT_CATEGORIES.find(c => c.value === catType);
    if (found) {
      setNewDocTitle(found.title);
    }
  };

  const handleEditCategoryChange = (catType) => {
    const found = DOCUMENT_CATEGORIES.find(c => c.value === catType);
    setEditingDoc(prev => ({
      ...prev,
      documentType: catType,
      title: found ? found.title : prev.title
    }));
  };

  // Open Academic Record Editor
  const handleOpenAcademicModal = () => {
    const curStudent = studentData?.student || profile;
    setAcademicForm({
      department: curStudent?.department || '',
      specialization: curStudent?.specialization || '',
      currentYear: curStudent?.current_year || 4,
      completedSemesters: curStudent?.completed_semesters ?? 8,
      currentCgpa: curStudent?.current_cgpa !== undefined && curStudent?.current_cgpa !== null ? String(curStudent.current_cgpa) : '',
      standingArrears: curStudent?.standing_arrears !== undefined && curStudent?.standing_arrears !== null ? String(curStudent.standing_arrears) : '0'
    });
    setEditAcademicModal(true);
  };

  // Save Academic Record
  const handleSaveAcademicRecord = async (e) => {
    e.preventDefault();
    const cgpaVal = parseFloat(academicForm.currentCgpa);
    if (isNaN(cgpaVal) || cgpaVal < 0 || cgpaVal > 10) {
      showToast('Please enter a valid Cumulative CGPA between 0.00 and 10.00', 'error');
      return;
    }
    const arrearsVal = Math.max(0, parseInt(academicForm.standingArrears || '0', 10));

    try {
      await api.updateStudentProfile({
        department: academicForm.department?.trim(),
        specialization: academicForm.specialization?.trim() || null,
        currentYear: parseInt(academicForm.currentYear, 10),
        completedSemesters: parseInt(academicForm.completedSemesters, 10),
        currentCgpa: cgpaVal,
        standingArrears: arrearsVal
      });
      setEditAcademicModal(false);
      showToast('Academic profile, department, specialization, and CGPA updated successfully!');
      loadAllData();
      if (onRefresh) onRefresh();
    } catch (err) {
      showToast(err.message || 'Failed to update academic record.', 'error');
    }
  };

  // Upload Document Vault
  const handleUploadDocument = async (e) => {
    e.preventDefault();
    const curUploaded = new Set((studentData?.documents || []).map(d => d.document_type));
    if (curUploaded.has(newDocType)) {
      showToast('You have already uploaded this marksheet category. Please use Edit below to update it.', 'error');
      return;
    }
    const title = (newDocTitle || selectedFile?.name?.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ') || `${newDocType} Marksheet`).trim();
    if (!title) {
      showToast('Please provide a document title or select a marksheet file.', 'error');
      return;
    }

    try {
      await api.uploadDocument({
        documentType: newDocType,
        title,
        percentage: newDocPercentage !== '' ? parseFloat(newDocPercentage) : undefined,
        fileName: selectedFile?.name || `${title.replace(/\s+/g, '_')}.pdf`,
        fileSizeBytes: selectedFile?.size || 250000
      });
      const curCat = DOCUMENT_CATEGORIES.find(c => c.value === newDocType);
      setNewDocTitle(curCat ? curCat.title : '');
      setNewDocPercentage('');
      setSelectedFile(null);
      showToast('Academic marksheet and verified score saved to vault.');
      loadAllData();
      if (onRefresh) onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Start Editing Document
  const handleStartEditDocument = (doc) => {
    setEditingDoc({
      id: doc.id,
      documentType: doc.document_type,
      title: doc.title,
      percentage: doc.percentage_or_cgpa !== null && doc.percentage_or_cgpa !== undefined ? String(doc.percentage_or_cgpa) : '',
      fileName: doc.file_name || '',
      fileSizeBytes: doc.file_size_bytes || 250000
    });
  };

  // Save Document Edits
  const handleSaveEditDocument = async (e) => {
    e.preventDefault();
    if (!editingDoc) return;
    try {
      await api.updateDocument(editingDoc.id, {
        documentType: editingDoc.documentType,
        title: editingDoc.title.trim(),
        percentage: editingDoc.percentage !== '' ? parseFloat(editingDoc.percentage) : undefined,
        fileName: editingDoc.fileName,
        fileSizeBytes: editingDoc.fileSizeBytes
      });
      setEditingDoc(null);
      showToast('Marksheet corrections updated and synced to profile.');
      loadAllData();
      if (onRefresh) onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Delete Document
  const handleDeleteDocument = async (docId, docTitle) => {
    if (!window.confirm(`Are you sure you want to remove "${docTitle}" from your academic vault?`)) {
      return;
    }
    try {
      await api.deleteDocument(docId);
      showToast(`Document "${docTitle}" removed from vault.`);
      loadAllData();
      if (onRefresh) onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Offer Response
  const handleRespondOffer = async (offerId, action, reason) => {
    try {
      const res = await api.respondToOffer(offerId, action, reason);
      showToast(res.message);
      setOfferActionModal(null);
      loadAllData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const student = studentData?.student || profile;
  const resumes = studentData?.resumes || [];
  const documents = studentData?.documents || [];
  const uploadedCategories = new Set(documents.map(d => d.document_type));
  const allCategoriesUploaded = DOCUMENT_CATEGORIES.length > 0 && DOCUMENT_CATEGORIES.every(c => uploadedCategories.has(c.value));

  // Auto-switch newDocType if currently selected category has already been uploaded
  useEffect(() => {
    const uploadedSet = new Set((studentData?.documents || []).map(d => d.document_type));
    if (uploadedSet.has(newDocType)) {
      const nextAvailable = DOCUMENT_CATEGORIES.find(c => !uploadedSet.has(c.value));
      if (nextAvailable) {
        setNewDocType(nextAvailable.value);
        setNewDocTitle(nextAvailable.title);
      }
    }
  }, [studentData?.documents, newDocType]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Floating Sticky Toast Alert */}
      {message && (
        <div className={`fixed top-5 right-5 z-50 max-w-md w-full p-4 rounded-xl text-sm font-semibold flex items-center justify-between shadow-2xl border transition-all ${
          message.type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
        }`}>
          <div className="flex items-center gap-2">
            <span>{message.type === 'error' ? '⚠️' : '✅'}</span>
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-xs font-bold underline ml-4 cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Top Banner / Student Identity Capsule */}
      <div className="bg-gradient-to-r from-[#001F44] to-[#032D5B] text-white rounded-2xl p-6 shadow-xl mb-8 border border-[#D4AF37]/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight">{student?.full_name || 'Student Candidate'}</h1>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
              student?.verification_status === 'VERIFIED'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : student?.verification_status === 'REJECTED'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}>
              {student?.verification_status || 'PENDING'} PROFILE
            </span>
          </div>
          <p className="text-slate-300 text-sm mt-1">
            Roll No: <span className="font-mono text-[#D4AF37] font-semibold">{student?.register_number}</span> • {student?.degree} ({student?.department}) • Class of {student?.graduation_year}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs bg-slate-900/50 p-3 rounded-xl border border-slate-700/60">
          <div className="text-center px-3 border-r border-slate-700">
            <div className="text-slate-400">Current CGPA</div>
            <div className="text-base font-extrabold text-[#D4AF37]">{student?.current_cgpa ? Number(student.current_cgpa).toFixed(2) : '--'}</div>
          </div>
          <div className="text-center px-3 border-r border-slate-700">
            <div className="text-slate-400">Standing Arrears</div>
            <div className={`text-base font-extrabold ${student?.standing_arrears > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {student?.standing_arrears ?? 0}
            </div>
          </div>
          <div className="text-center px-3">
            <div className="text-slate-400">Active Applications</div>
            <div className="text-base font-extrabold text-white">{applications.length}</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 mb-8 pb-1">
        {[
          { id: 'dashboard', label: '📊 Dashboard Overview' },
          { id: 'explore', label: `💼 Explore Jobs (${jobs.length})` },
          { id: 'applications', label: `📝 My Applications (${applications.length})` },
          { id: 'interviews_offers', label: `🎯 Interviews & Offers (${offers.length + scheduledInterviewsCount})` },
          { id: 'resumes', label: `📄 Resume Vault (${resumes.length})` },
          { id: 'profile', label: '🎓 Academic Profile & Marksheets' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === 'interviews_offers') {
                api.getMyOffers().then(res => setOffers(res.data || [])).catch(() => {});
                api.getMyInterviews().then(res => setInterviews(res.data || [])).catch(() => {});
              }
            }}
            className={`px-4 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              activeTab === tab.id
                ? 'bg-[#001F44] text-[#D4AF37] shadow-sm font-bold'
                : 'text-slate-600 hover:text-[#001F44] hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="space-y-8">
          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Eligible Drives</span>
              <div className="text-3xl font-extrabold text-[#001F44] mt-1">{jobs.length}</div>
              <p className="text-xs text-slate-500 mt-2">Active campus postings</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Submitted Applications</span>
              <div className="text-3xl font-extrabold text-[#001F44] mt-1">{applications.length}</div>
              <p className="text-xs text-slate-500 mt-2">Submitted & Under Review</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Upcoming Interviews</span>
              <div className="text-3xl font-extrabold text-blue-600 mt-1">{scheduledInterviewsCount}</div>
              <p className="text-xs text-slate-500 mt-2">Active scheduled slots</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Formal Offers</span>
              <div className="text-3xl font-extrabold text-[#D4AF37] mt-1">{offers.length}</div>
              <p className="text-xs text-slate-500 mt-2">Extended packages</p>
            </div>
          </div>

          {/* Pending Verification Notice if applicable */}
          {student?.verification_status !== 'VERIFIED' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-amber-800">
              <div className="flex items-start gap-3">
                <span className="text-xl">⚠️</span>
                <div>
                  <h3 className="font-bold text-sm">Academic Verification In Progress</h3>
                  <p className="text-xs mt-1 leading-relaxed">
                    Your profile is currently awaiting verification by the Placement Directorate. You can browse job descriptions, but server-side cut-off evaluation will require admin verification before you can submit applications.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Active Applications Quick Tracker */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#001F44] mb-4">Active Placement Applications</h2>
            {applications.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                You have not applied to any job drives yet. Visit the <button onClick={() => setActiveTab('explore')} className="text-[#001F44] font-bold underline">Explore Jobs</button> tab to apply.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {applications.map(app => {
                  const isOffered = app.status === 'OFFERED' || app.status === 'ACCEPTED' || Boolean(app.offer_id) || offers.some(o => o.application_id === app.id || o.job_id === app.job_id);

                  return (
                    <div key={app.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="font-bold text-base text-[#001F44]">{app.job_title}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {app.company_name} • Package: <span className="font-semibold text-slate-700">₹{app.salary_package_lpa} LPA</span> • Applied: {new Date(app.applied_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {isOffered ? (
                          <span className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-black uppercase tracking-wider shadow-xs flex items-center gap-1.5 border border-emerald-500">
                            <span>✓</span>
                            <span>Selected</span>
                          </span>
                        ) : (
                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                            app.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                            app.status === 'REJECTED' ? 'bg-rose-100 text-rose-800' :
                            'bg-slate-100 text-slate-800'
                          }`}>
                            {app.status}
                          </span>
                        )}
                        <button
                          onClick={() => setActiveTab('applications')}
                          className="text-xs font-bold text-[#001F44] hover:underline px-3 py-1 bg-slate-50 rounded-lg border border-slate-200"
                        >
                          Track Stages
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: EXPLORE JOBS */}
      {activeTab === 'explore' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[#001F44]">Campus Recruitment Openings</h2>
              <p className="text-xs text-slate-500 mt-0.5">Explore active company drives. Check your authoritative cut-off eligibility before applying.</p>
            </div>
            <div className="text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              Showing {jobs.length} published openings
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {jobs.map(job => (
              <div key={job.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={job.company_logo || '/assets/default-company.png'}
                        alt={job.company_name}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 bg-slate-50 p-1"
                        onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1549923746-c502d488b3ea?auto=format&fit=crop&w=100&h=100&q=80'; }}
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{job.company_name}</span>
                        <h3 className="text-base font-bold text-[#001F44] leading-snug">{job.title}</h3>
                      </div>
                    </div>
                    <span className="text-xs font-extrabold px-2.5 py-1 rounded-md bg-[#001F44]/5 text-[#001F44] border border-[#001F44]/10">
                      ₹{job.salary_package_lpa} LPA
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mt-4 leading-relaxed line-clamp-3">
                    {job.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 mt-4 text-[11px] font-medium">
                    <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md">📍 {job.location}</span>
                    <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md">🏢 {job.work_mode}</span>
                    {checkDeadlineExceeded(job.application_deadline) ? (
                      <span className="bg-rose-50 text-rose-700 border border-rose-300 font-extrabold px-2.5 py-1 rounded-md">
                        ⛔ Deadline Exceeded ({new Date(job.application_deadline).toLocaleDateString()})
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md">
                        ⏳ Deadline: {new Date(job.application_deadline).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100 mt-6 pt-4 flex items-center justify-between">
                  {job.my_application_status ? (
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-600">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      Applied ({job.my_application_status})
                    </div>
                  ) : checkDeadlineExceeded(job.application_deadline) ? (
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-rose-600">
                      <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                      Deadline Exceeded
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">
                      {job.applicant_count || 0} candidates applied
                    </div>
                  )}

                  {job.my_application_status ? (
                    <button
                      onClick={() => handleCheckEligibility(job)}
                      className="px-4 py-2 text-xs font-bold rounded-lg bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] transition shadow-sm"
                    >
                      View Eligibility Details
                    </button>
                  ) : checkDeadlineExceeded(job.application_deadline) ? (
                    <button
                      disabled
                      title="Application deadline has passed. New submissions are closed."
                      className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                    >
                      Apply Disabled (Closed)
                    </button>
                  ) : (
                    <button
                      onClick={() => handleCheckEligibility(job)}
                      className="px-4 py-2 text-xs font-bold rounded-lg bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] transition shadow-sm"
                    >
                      Check Eligibility & Apply
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ELIGIBILITY & APPLY MODAL */}
      {eligibilityModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider">{eligibilityModal.job.company_name}</span>
                <h3 className="text-lg font-extrabold text-[#001F44]">{eligibilityModal.job.title}</h3>
                <p className="text-xs text-slate-500">Authoritative Server-Side Eligibility Engine Evaluation</p>
              </div>
              <button
                onClick={() => setEligibilityModal(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {eligibilityModal.loading ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                Running server-side eligibility checks against criteria...
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                {/* Deadline Warning Banner if Expired */}
                {checkDeadlineExceeded(eligibilityModal.job.application_deadline) && (
                  <div className="bg-rose-50 border border-rose-300 rounded-xl p-3.5 flex items-center gap-3 text-rose-800">
                    <span className="text-xl">⛔</span>
                    <div>
                      <h4 className="font-extrabold text-xs uppercase tracking-wider text-rose-900">Application Deadline Exceeded</h4>
                      <p className="text-xs text-rose-700 mt-0.5">
                        The deadline ({new Date(eligibilityModal.job.application_deadline).toLocaleDateString()}) has passed. Student applications are officially locked for this drive.
                      </p>
                    </div>
                  </div>
                )}

                {/* Eligibility Result Banner */}
                <div className={`p-4 rounded-xl flex items-center gap-3 border ${
                  eligibilityModal.result?.eligible
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}>
                  <span className="text-2xl">{eligibilityModal.result?.eligible ? '✅' : '🚫'}</span>
                  <div>
                    <h4 className="font-extrabold text-sm">
                      {eligibilityModal.result?.eligible
                        ? 'Congratulations! You meet all cut-off and eligibility criteria for this drive.'
                        : 'Eligibility Requirements Not Met'}
                    </h4>
                    <p className="text-xs mt-0.5 opacity-90">
                      Criteria Version: v{eligibilityModal.result?.criteriaVersion} • Evaluated at: {new Date(eligibilityModal.result?.evaluatedAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                {/* Explicit Blockers list if any */}
                {eligibilityModal.result?.blockers?.length > 0 && (
                  <div className="bg-rose-100/60 border border-rose-200 rounded-xl p-4">
                    <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">Blocking Reasons:</span>
                    <ul className="list-disc list-inside text-xs text-rose-900 mt-1 space-y-1">
                      {eligibilityModal.result.blockers.map((b, idx) => (
                        <li key={idx}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 9-Point Criteria Checklist */}
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Verification Matrix</h4>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                    {eligibilityModal.result?.checks?.map((chk) => {
                      const isArray = Array.isArray(chk.required);
                      const isExpanded = !!expandedCheck[chk.code];
                      
                      let requiredContent;
                      if (isArray && chk.required.length > 2 && !isExpanded) {
                        requiredContent = (
                          <span>
                            <span className="font-medium text-slate-700">{chk.required.slice(0, 2).join(', ')}...</span>
                            <button
                              type="button"
                              onClick={() => setExpandedCheck(prev => ({ ...prev, [chk.code]: true }))}
                              className="text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer ml-1.5 text-[11px]"
                            >
                              +{chk.required.length - 2} more (View all)
                            </button>
                          </span>
                        );
                      } else if (isArray && chk.required.length > 2 && isExpanded) {
                        requiredContent = (
                          <span>
                            <span className="font-medium text-slate-700">{chk.required.join(', ')}</span>
                            <button
                              type="button"
                              onClick={() => setExpandedCheck(prev => ({ ...prev, [chk.code]: false }))}
                              className="text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer ml-1.5 text-[11px]"
                            >
                              (Show less)
                            </button>
                          </span>
                        );
                      } else {
                        requiredContent = (
                          <span className="font-medium text-slate-700">
                            {isArray ? chk.required.join(', ') : String(chk.required)}
                          </span>
                        );
                      }

                      return (
                        <div key={chk.code} className="p-3 flex items-center justify-between hover:bg-slate-50 gap-3">
                          <div className="flex-1">
                            <div className="font-bold text-[#001F44]">{chk.label}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Required: {requiredContent} • Your Record: <span className="font-medium text-slate-700">{String(chk.actual)}</span>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                            chk.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {chk.passed ? 'PASSED' : 'FAILED'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Application Section */}
                <div className="border-t border-slate-100 pt-6">
                  {eligibilityModal.result?.alreadyApplied ? (
                    <div className="bg-slate-50 p-4 rounded-xl text-center border border-slate-200 text-xs text-slate-600 font-semibold">
                      You have already submitted an application for this opening on {new Date(eligibilityModal.result.existingApplication?.applied_at).toLocaleDateString()}.
                    </div>
                  ) : eligibilityModal.result?.eligible ? (
                    <div>
                      <div className="space-y-3 mb-5">
                        {resumes.length > 0 ? (
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label htmlFor="select-resume-for-apply" className="block text-xs font-bold text-[#001F44]">
                                Select from Existing Resumes
                              </label>
                              <span className="text-[11px] text-emerald-700 font-semibold">
                                ✓ Verified Original PDF
                              </span>
                            </div>
                            <select
                              id="select-resume-for-apply"
                              value={selectedApplyResumeId || (resumes.find(r => r.is_default)?.id || resumes[0]?.id || '')}
                              onChange={(e) => setSelectedApplyResumeId(e.target.value)}
                              className="w-full text-xs p-2.5 rounded-lg border border-slate-300 font-medium focus:ring-2 focus:ring-[#001F44] focus:outline-none bg-white text-slate-800"
                            >
                              {resumes.map(r => (
                                <option key={r.id} value={r.id}>
                                  {r.title} {r.is_default ? '(Default Active Resume)' : ''}
                                </option>
                              ))}
                            </select>

                            {/* Meta Preview for the selected resume */}
                            {(() => {
                              const activeResumeId = selectedApplyResumeId || (resumes.find(r => r.is_default)?.id || resumes[0]?.id);
                              const cur = resumes.find(r => r.id === activeResumeId);
                              if (!cur) return null;
                              return (
                                <div className="mt-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-600">
                                  <div className="flex items-center gap-2.5">
                                    <span className="text-xl">📄</span>
                                    <div>
                                      <div className="font-bold text-slate-900">{cur.title}</div>
                                      <div className="text-[10px] text-slate-500 mt-0.5">
                                        Uploaded PDF ({(Number(cur.file_size_bytes || 0) / 1024).toFixed(1)} KB) • Immutable Snapshot will be frozen
                                      </div>
                                    </div>
                                  </div>
                                  {cur.is_default ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#001F44] text-[#D4AF37]">
                                      DEFAULT
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                                      ALTERNATIVE
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center">
                            <div className="text-amber-800 text-xs font-bold mb-1">No Verified Resume in Vault</div>
                            <p className="text-slate-600 text-[11px] mb-3">
                              Please upload your original PDF resume in the <strong>Resume Vault</strong> tab before submitting your application.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setEligibilityModal(null);
                                setActiveTab('resumes');
                              }}
                              className="px-4 py-2 text-xs font-extrabold bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] rounded-lg transition shadow-xs cursor-pointer"
                            >
                              📂 Go to Resume Vault to Upload Resume
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setEligibilityModal(null)}
                          className="px-4 py-2 text-xs font-bold rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={submittingApplication || resumes.length === 0}
                          onClick={() => {
                            const targetResumeId = selectedApplyResumeId || (resumes.find(r => r.is_default)?.id || resumes[0]?.id);
                            handleApply(eligibilityModal.job.id, targetResumeId);
                          }}
                          className={`px-6 py-2.5 text-xs font-extrabold rounded-lg transition shadow-md cursor-pointer ${
                            submittingApplication || resumes.length === 0
                              ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                              : 'bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B]'
                          }`}
                        >
                          {submittingApplication ? 'Submitting Application...' : 'Submit Formal Application'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-right">
                      <button
                        onClick={() => setEligibilityModal(null)}
                        className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: MY APPLICATIONS & TIMELINE */}
      {activeTab === 'applications' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-[#001F44]">My Application Portfolio & Stage Tracker</h2>
            <p className="text-xs text-slate-500 mt-0.5">Track multi-round recruitment progression across interview stages.</p>
          </div>

          {applications.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center text-slate-400 border border-slate-200">
              No applications submitted yet.
            </div>
          ) : (
            <div className="space-y-6">
              {applications.map(app => {
                const isOffered = app.status === 'OFFERED' || app.status === 'ACCEPTED' || Boolean(app.offer_id) || offers.some(o => o.application_id === app.id || o.job_id === app.job_id);

                return (
                  <div key={app.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-lg text-[#001F44]">{app.job_title}</h3>
                          {!isOffered && (
                            <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                              app.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                              app.status === 'REJECTED' ? 'bg-rose-100 text-rose-800' :
                              'bg-slate-100 text-slate-800'
                            }`}>
                              {app.status}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Company: <span className="font-semibold text-slate-700">{app.company_name}</span> • CTC: <span className="font-semibold text-[#001F44]">₹{app.salary_package_lpa} LPA</span> • Applied on: {new Date(app.applied_at).toLocaleDateString()}
                        </p>
                      </div>

                      {/* Right-aligned prominent Selected / Offer card */}
                      {isOffered && (
                        <div className="flex items-center gap-2.5 self-start md:self-center">
                          <div className="px-4 py-2 rounded-xl bg-emerald-600 text-white shadow-sm flex items-center gap-2 font-black text-xs tracking-wider uppercase border border-emerald-500 select-none">
                            <span className="text-sm font-black">✓</span>
                            <span>Selected</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const matchedOffer = offers.find(o => o.application_id === app.id || o.job_id === app.job_id) || {
                                id: app.offer_id || 'OFFER',
                                job_title: app.job_title,
                                company_name: app.company_name,
                                ctc_amount: app.offer_ctc || app.salary_package_lpa,
                                created_at: app.applied_at,
                                student_name: profile?.fullName || user?.fullName || 'Candidate'
                              };
                              setSelectedOfferLetter(matchedOffer);
                            }}
                            className="px-3.5 py-2 rounded-xl bg-[#001F44] hover:bg-[#032D5B] text-[#D4AF37] font-bold text-xs transition shadow-sm flex items-center gap-1.5 cursor-pointer"
                            title="View Formal Placement Offer Letter"
                          >
                            <span>📄</span>
                            <span>View Offer Letter</span>
                          </button>
                        </div>
                      )}
                    </div>

                  {/* Multi-Round Stage Progress Tracker */}
                  <div className="mt-6">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Recruitment Evaluation Stages</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {app.stages?.map((st) => (
                        <div
                          key={st.id}
                          className={`p-3 rounded-xl border text-xs transition ${
                            st.outcome === 'PASSED' || st.outcome === 'SHORTLISTED'
                              ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900'
                              : st.outcome === 'REJECTED'
                              ? 'bg-rose-50 border-rose-300 text-rose-900'
                              : st.outcome === 'ON_HOLD'
                              ? 'bg-amber-50 border-amber-300 text-amber-900'
                              : 'bg-slate-50 border-slate-200 text-slate-600'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold text-[11px] mb-1">
                            <span>Round {st.sequence_order}</span>
                            <span className="uppercase text-[10px] font-extrabold">{st.outcome || 'PENDING'}</span>
                          </div>
                          <div className="font-semibold text-slate-900 truncate">{st.stage_name}</div>
                          {st.feedback && (
                            <p className="text-[11px] text-slate-600 mt-1 italic">"{st.feedback}"</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Upcoming Interview Banner for this Application if scheduled */}
                  {app.upcomingInterview && (
                    <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-blue-900">
                      <div>
                        <span className="font-extrabold uppercase tracking-wider text-[10px] bg-blue-200 text-blue-800 px-2 py-0.5 rounded mr-2">
                          Upcoming Interview
                        </span>
                        <span className="font-bold">{app.upcomingInterview.stage_name}</span>: {new Date(app.upcomingInterview.scheduled_start).toLocaleString()}
                        {app.upcomingInterview.venue && <div className="text-slate-600 mt-0.5">Venue: {app.upcomingInterview.venue}</div>}
                      </div>
                      {app.upcomingInterview.meeting_link && (
                        <a
                          href={app.upcomingInterview.meeting_link}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-center hover:bg-blue-700"
                        >
                          Join Virtual Hall
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: INTERVIEWS & OFFERS */}
      {activeTab === 'interviews_offers' && (
        <div className="space-y-8">
          {/* Formal Offers Section */}
          <div>
            <h2 className="text-xl font-bold text-[#001F44] mb-1">Formal Placement Offers</h2>
            <p className="text-xs text-slate-500 mb-4">Official employment offers extended by corporate partners through the Placement Directorate.</p>

            {offers.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-200 text-xs">
                No formal placement offers issued yet. Keep progressing through interview rounds!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {offers.map(off => (
                  <div key={off.id} className="bg-white rounded-2xl border-2 border-[#D4AF37]/50 p-6 shadow-md relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-[#D4AF37] text-[#001F44] text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-bl-lg flex items-center gap-1">
                      <span>⭐</span>
                      <span>OFFICIAL OFFER LETTER</span>
                    </div>

                    <div className="font-bold text-sm text-slate-500">{off.company_name}</div>
                    <div className="text-xl font-extrabold text-[#001F44] mt-0.5">{off.job_title}</div>

                    <div className="bg-emerald-50/50 rounded-xl p-4 my-4 border border-emerald-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-emerald-800 font-bold uppercase tracking-wider">Annual CTC Package:</span>
                        <span className="text-2xl font-black text-emerald-700">₹{off.ctc_amount} LPA</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-700 bg-white/80 p-2.5 rounded-lg border border-emerald-100 shadow-2xs">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <span>🗓️</span>
                          <span>Expected Joining Date:</span>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-[#001F44] text-xs">{calculateJoiningDate(off.created_at)}</span>
                          <span className="text-[10px] text-slate-400 block font-medium">(2-3 months post-offer window)</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                        <span>Offer Issued On:</span>
                        <span className="font-semibold text-slate-700">{new Date(off.created_at || Date.now()).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Placement Status:</span>
                        <span className="font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded text-[10px] border border-emerald-200">
                          🎉 Placed / Offer Extended
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                      <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                        <span>🎓</span>
                        <span>Campus Placement Confirmed</span>
                      </span>
                      <button
                        onClick={() => setSelectedOfferLetter(off)}
                        className="py-2 px-4 text-xs font-black rounded-lg bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>📄</span>
                        <span>View Formal Offer Letter</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Scheduled Interviews & Round Progression Section */}
          <div className="border-t border-slate-200 pt-8">
            <h2 className="text-xl font-bold text-[#001F44] mb-1">Upcoming Interview Calendar & Round Progression</h2>
            <p className="text-xs text-slate-500 mb-4">Track scheduled interview sessions, meeting links, and round-by-round shortlist outcomes across your drives.</p>

            {interviews.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-200 text-xs">
                No active interview slots or round evaluations yet. Keep checking as recruiters review your profile!
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
                {interviews.map(inv => {
                  const isShortlisted = inv.outcome === 'SHORTLISTED' || inv.outcome === 'PASSED';
                  const isRejected = inv.outcome === 'REJECTED';
                  const isScheduled = !isShortlisted && !isRejected && (inv.interview_status === 'SCHEDULED' || inv.outcome === 'SCHEDULED');

                  return (
                    <div
                      key={inv.id || `${inv.application_id}-${inv.job_stage_id}`}
                      className={`p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition ${
                        isShortlisted
                          ? 'bg-emerald-50/20'
                          : isScheduled
                          ? 'bg-amber-50/20'
                          : ''
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-black uppercase border border-slate-200">
                            Round {inv.sequence_order || 1}
                          </span>
                          <span className="font-extrabold text-base text-[#001F44]">
                            {inv.stage_name}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="font-bold text-sm text-slate-700">
                            {inv.job_title}
                          </span>
                        </div>

                        <div className="text-xs text-slate-500 mt-1.5 flex items-center gap-2 flex-wrap">
                          <span>
                            Company: <strong className="text-slate-800 font-semibold">{inv.company_name}</strong>
                          </span>
                          {inv.scheduled_start && (
                            <>
                              <span>•</span>
                              <span>
                                {isShortlisted ? 'Conducted on:' : 'Timing:'}{' '}
                                <strong className={isScheduled ? 'text-blue-700 font-bold' : 'text-slate-700 font-semibold'}>
                                  {new Date(inv.scheduled_start).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(inv.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </strong>
                              </span>
                            </>
                          )}
                          {inv.venue && (
                            <>
                              <span>•</span>
                              <span className="text-slate-600">📍 {inv.venue}</span>
                            </>
                          )}
                          {isShortlisted && inv.evaluated_at && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-700 font-medium">
                                Shortlisted on {new Date(inv.evaluated_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                              </span>
                            </>
                          )}
                        </div>

                        {inv.notes && (
                          <div className="text-xs text-slate-600 mt-1 italic">
                            Note: {inv.notes}
                          </div>
                        )}

                        {inv.feedback && (
                          <div className="text-xs text-emerald-800 mt-1.5 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 inline-block font-medium">
                            Feedback: {inv.feedback}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3 self-start md:self-center">
                        {isShortlisted ? (
                          <span className="px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5 shadow-2xs">
                            <span>✓</span>
                            <span>Shortlisted</span>
                          </span>
                        ) : isScheduled ? (
                          <div className="flex items-center gap-2.5">
                            <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                              <span>🕒</span>
                              <span>Scheduled</span>
                            </span>
                            {inv.meeting_link && (
                              <a
                                href={inv.meeting_link}
                                target="_blank"
                                rel="noreferrer"
                                className="px-4 py-2 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                              >
                                <span>📹</span>
                                <span>Join Meeting</span>
                              </a>
                            )}
                          </div>
                        ) : isRejected ? (
                          <span className="px-3.5 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                            <span>✕</span>
                            <span>Not Shortlisted</span>
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                            Under Evaluation
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: RESUMES */}
      {activeTab === 'resumes' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[#001F44]">Resume Management Vault</h2>
              <p className="text-xs text-slate-500 mt-0.5">Manage and view your uploaded campus placement resumes.</p>
            </div>
          </div>

          {/* Success Banner when resume is uploaded */}
          {resumeSuccessMessage && (
            <div className="bg-emerald-50 border-2 border-emerald-400 p-4 rounded-xl flex items-center justify-between text-emerald-900 shadow-md">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎉</span>
                <div>
                  <h4 className="font-extrabold text-sm text-emerald-800">Resume Uploaded Successfully!</h4>
                  <p className="text-xs text-emerald-700 mt-0.5">{resumeSuccessMessage}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResumeSuccessMessage(null)}
                className="text-emerald-700 hover:text-emerald-900 font-bold text-xs p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Upload Resume Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-bold text-base text-[#001F44]">Upload Resume</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select and upload your resume file in PDF format (.pdf) from your local device.
                </p>
              </div>

              {/* Hidden Native File Input (PDF only) */}
              <input
                type="file"
                ref={resumeFileInputRef}
                accept=".pdf,application/pdf"
                onChange={handleResumeFileSelected}
                className="hidden"
                id="resume-file-picker"
              />

              <button
                type="button"
                disabled={uploadingResume}
                onClick={() => resumeFileInputRef.current?.click()}
                className="px-6 py-2.5 text-xs font-extrabold rounded-lg bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] transition shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {uploadingResume ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <span>📁</span>
                    <span>Upload Resume</span>
                  </>
                )}
              </button>
            </div>

            {/* Clickable Drag & Drop Zone */}
            <div
              onClick={() => resumeFileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsResumeDragging(true); }}
              onDragLeave={() => setIsResumeDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsResumeDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleUploadResumeFile(e.dataTransfer.files[0]);
                }
              }}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                isResumeDragging ? 'border-[#001F44] bg-blue-50/50' : 'border-slate-300 hover:border-[#001F44] hover:bg-slate-50/50'
              }`}
            >
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-2xl mb-2">
                📄
              </div>
              <div className="text-xs font-bold text-[#001F44]">
                Click here or drag and drop your resume file to upload
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Accepted format: PDF (.pdf) only • Max 10MB
              </div>
            </div>
          </div>

          {/* Resumes List */}
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
            <div className="p-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-[#001F44] uppercase tracking-wider">
                Uploaded Resumes ({resumes.length})
              </span>
              <span className="text-[11px] text-slate-500">
                Mark whichever resume you wish as Default for new applications
              </span>
            </div>

            {resumes.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                No resumes uploaded yet. Click <strong>Upload Resume</strong> above to add your first resume.
              </div>
            ) : (
              resumes.map(r => (
                <div key={r.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 transition">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📄</span>
                      <span className="font-bold text-sm text-[#001F44]">{r.title}</span>
                      {r.is_default ? (
                        <span className="text-[10px] bg-[#001F44] text-[#D4AF37] font-extrabold px-2.5 py-0.5 rounded-full border border-[#D4AF37]/50 inline-flex items-center gap-1 shadow-xs">
                          ⭐ CURRENT DEFAULT
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 font-medium">
                      Size: {(r.file_size_bytes / 1024).toFixed(1)} KB • Uploaded: {new Date(r.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-center">
                    <button
                      onClick={async () => {
                        try {
                          showToast(`Downloading ${r.title}...`);
                          await api.downloadStudentResume(r.id, r.title);
                          showToast(`Downloaded ${r.title} successfully!`);
                        } catch (err) {
                          showToast(err.message || 'Failed to download resume.', 'error');
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                      title="Download this resume PDF"
                    >
                      <span>📥</span>
                      <span>Download</span>
                    </button>
                    {r.is_default ? (
                      <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 rounded-lg flex items-center gap-1.5">
                        <span>✓</span>
                        <span>Active Default</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSetDefaultResume(r.id, r.title)}
                        className="px-3.5 py-1.5 text-xs font-bold rounded-lg border border-[#001F44]/30 text-[#001F44] hover:bg-[#001F44] hover:text-[#D4AF37] transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>⭐</span>
                        <span>Set as Default</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteResume(r.id, r.title)}
                      title="Remove resume"
                      className="px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition cursor-pointer"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 6: ACADEMIC PROFILE & MARKSHEETS */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-3">
              <div>
                <h2 className="text-xl font-bold text-[#001F44]">Official Academic Record</h2>
                <p className="text-xs text-slate-500">
                  Semester completion, current year of study, and live Cumulative CGPA cut-off anchors.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenAcademicModal}
                className="px-4 py-2 rounded-xl text-xs font-extrabold bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] shadow-sm transition flex items-center gap-2 self-start sm:self-auto cursor-pointer"
              >
                <span>✏️</span>
                <span>Update Academic Profile & CGPA</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
              <div>
                <span className="text-slate-400">Full Legal Name:</span>
                <div className="font-bold text-slate-800 text-sm mt-0.5">{student?.full_name}</div>
              </div>
              <div>
                <span className="text-slate-400">Institute Register Number:</span>
                <div className="font-bold text-slate-800 text-sm mt-0.5 font-mono">{student?.register_number}</div>
              </div>
              <div>
                <span className="text-slate-400">Registered Email:</span>
                <div className="font-bold text-slate-800 text-sm mt-0.5">{user?.email}</div>
              </div>
              <div>
                <span className="text-slate-400">Current Year of Study:</span>
                <div className="font-bold text-[#001F44] text-sm mt-0.5">
                  {student?.current_year === 1 ? '1st Year' :
                   student?.current_year === 2 ? '2nd Year' :
                   student?.current_year === 3 ? '3rd Year' :
                   '4th Year'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Semesters Completed:</span>
                <div className="font-bold text-slate-800 text-sm mt-0.5">
                  Semester {student?.completed_semesters ?? 8}
                </div>
                <span className="text-[10px] text-slate-400 italic block mt-0.5">
                  (CGPA calculated up to Sem {student?.completed_semesters ?? 8})
                </span>
              </div>
              <div>
                <span className="text-slate-400">Cumulative CGPA (Live Cut-off):</span>
                <div className="font-black text-[#001F44] text-base mt-0.5">
                  {student?.current_cgpa ? Number(student.current_cgpa).toFixed(2) : '--'} <span className="text-xs text-slate-400 font-normal">/ 10.00</span>
                </div>
              </div>
              <div>
                <span className="text-slate-400">Standing (Active) Arrears:</span>
                <div className="mt-0.5">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    student?.standing_arrears > 0 ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}>
                    {student?.standing_arrears > 0 ? `⚠️ ${student.standing_arrears} Active Arrears` : '✓ 0 (No Active Arrears)'}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-slate-400">Graduation Year:</span>
                <div className="font-bold text-slate-800 text-sm mt-0.5">
                  Class of {student?.graduation_year}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Department / Discipline:</span>
                <div className="font-bold text-slate-800 text-sm mt-0.5">{student?.department || '--'}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Program: {student?.degree || 'B.Tech'}</div>
              </div>
              <div>
                <span className="text-slate-400">Specialization / Domain Focus:</span>
                <div className="font-bold text-[#001F44] text-sm mt-0.5">
                  {student?.specialization ? student.specialization : <span className="text-slate-400 font-normal italic">Not specified (Click Update to set)</span>}
                </div>
              </div>
              <div>
                <span className="text-slate-400">10th Standard Board Percentage:</span>
                <div className="font-bold text-slate-800 text-sm mt-0.5">{student?.tenth_percentage}%</div>
              </div>
              <div>
                <span className="text-slate-400">12th Standard Board Percentage:</span>
                <div className="font-bold text-slate-800 text-sm mt-0.5">{student?.twelfth_percentage}%</div>
              </div>
            </div>
          </div>

          {/* Documents Vault */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-[#001F44]">Marksheet & Certificate Vault</h3>
              </div>
            </div>

            {/* Document Upload Form with Percentage and Real File Upload */}
            <form onSubmit={handleUploadDocument} className="bg-slate-50 p-5 rounded-xl border border-slate-200 mb-6 space-y-4">
              <div className="text-xs font-bold text-[#001F44] border-b border-slate-200 pb-2">
                Upload New Academic Marksheet / Certificate
              </div>

              {allCategoriesUploaded && (
                <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-xs font-semibold border border-amber-200">
                  All marksheet categories have already been uploaded to your vault. To modify any uploaded document or marksheet, please click <strong>Edit</strong> on the respective record below.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold text-[11px] mb-1">
                    Select Document Category:
                  </label>
                  <select
                    value={newDocType}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    disabled={allCategoriesUploaded}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {DOCUMENT_CATEGORIES.map(cat => {
                      const isUploaded = uploadedCategories.has(cat.value);
                      return (
                        <option key={cat.value} value={cat.value} disabled={isUploaded}>
                          {cat.title} {isUploaded ? '— (Already Uploaded - Use Edit below)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold text-[11px] mb-1">
                    {getScoreMeta(newDocType).label}:
                  </label>
                  <input
                    type="number"
                    step={getScoreMeta(newDocType).step}
                    max={getScoreMeta(newDocType).max}
                    min="0"
                    placeholder={getScoreMeta(newDocType).placeholder}
                    value={newDocPercentage}
                    onChange={(e) => setNewDocPercentage(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 font-bold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-slate-700 font-bold text-[11px] mb-1">
                    Document Title / Label:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 10th_Standard_Official_Marksheet.pdf"
                    value={newDocTitle}
                    onChange={(e) => setNewDocTitle(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold text-[11px] mb-1">
                    Attach Certificate / Marksheet File:
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer px-3 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 font-bold text-xs text-slate-700 flex items-center gap-1.5 shadow-sm transition">
                      <span>📄</span>
                      <span>{selectedFile ? 'Change File' : 'Browse File (.pdf, .png, .jpg)'}</span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            setSelectedFile(f);
                            if (!newDocTitle) {
                              setNewDocTitle(f.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
                            }
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                    {selectedFile ? (
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200 truncate max-w-[200px]" title={selectedFile.name}>
                        ✓ {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">No file chosen</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={allCategoriesUploaded}
                  className={`px-5 py-2.5 text-xs font-extrabold rounded-lg transition shadow-sm ${
                    allCategoriesUploaded
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] cursor-pointer'
                  }`}
                >
                  Upload Marksheet
                </button>
              </div>
            </form>

            {/* Document List with Edit and Delete options */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Academic Marksheets & Documents in Vault ({documents.length})
              </div>

              {documents.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No academic documents uploaded yet. Use the form above to securely vault your marksheets.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {documents.map(doc => (
                    <div key={doc.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 transition text-xs">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 text-base font-bold shrink-0">
                          📄
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-[#001F44] text-xs">{doc.title}</span>
                            <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-slate-200">
                              {doc.document_type}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 flex-wrap">
                            {doc.percentage_or_cgpa !== null && doc.percentage_or_cgpa !== undefined && (
                              <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                Certified Score: {doc.percentage_or_cgpa}%
                              </span>
                            )}
                            <span className="font-mono text-slate-400">
                              {doc.file_name || 'marksheet.pdf'} • {(doc.file_size_bytes / 1024).toFixed(1)} KB
                            </span>
                            <span className="text-slate-400">
                              Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleStartEditDocument(doc)}
                          className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition shadow-sm cursor-pointer"
                          title="Correct document title, category, or percentage"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDocument(doc.id, doc.title)}
                          className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition shadow-sm cursor-pointer"
                          title="Delete uploaded marksheet"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EDIT DOCUMENT MODAL */}
      {editingDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-base font-extrabold text-[#001F44]">Edit Marksheet & Academic Record</h3>
                <p className="text-xs text-slate-500">Correct certificate category, score percentage, or document title.</p>
              </div>
              <button onClick={() => setEditingDoc(null)} className="text-slate-400 hover:text-slate-600 font-bold text-base p-1">✕</button>
            </div>

            <form onSubmit={handleSaveEditDocument} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Document Category:</label>
                <select
                  value={editingDoc.documentType}
                  onChange={(e) => handleEditCategoryChange(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-800"
                >
                  {DOCUMENT_CATEGORIES.map(cat => {
                    const isUsedByOther = documents.some(d => d.id !== editingDoc.id && d.document_type === cat.value);
                    return (
                      <option key={cat.value} value={cat.value} disabled={isUsedByOther}>
                        {cat.title} {isUsedByOther ? '— (Already Used by another marksheet)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {getScoreMeta(editingDoc.documentType).label}:
                </label>
                <input
                  type="number"
                  step={getScoreMeta(editingDoc.documentType).step}
                  max={getScoreMeta(editingDoc.documentType).max}
                  min="0"
                  required
                  value={editingDoc.percentage}
                  onChange={(e) => setEditingDoc({ ...editingDoc, percentage: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Document Title / Label:</label>
                <input
                  type="text"
                  required
                  value={editingDoc.title}
                  onChange={(e) => setEditingDoc({ ...editingDoc, title: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Replace Certificate File (Optional):</label>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 hover:bg-slate-100 font-bold text-xs text-slate-700 flex items-center gap-1.5 shadow-sm">
                    <span>📄 Browse New File</span>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setEditingDoc({
                            ...editingDoc,
                            fileName: f.name,
                            fileSizeBytes: f.size
                          });
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Current: {editingDoc.fileName || 'marksheet.pdf'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-extrabold rounded-lg bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] shadow-sm"
                >
                  Save Corrections
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT OFFICIAL ACADEMIC RECORD MODAL */}
      {editAcademicModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-base font-extrabold text-[#001F44]">
                  Update Official Academic Profile & CGPA
                </h3>
                <p className="text-xs text-slate-500">
                  Update department, specialization, semester progress, Cumulative CGPA, and standing backlogs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditAcademicModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-base p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAcademicRecord} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Department / Branch: *
                  </label>
                  <input
                    type="text"
                    required
                    value={academicForm.department}
                    onChange={(e) => setAcademicForm(prev => ({ ...prev, department: e.target.value }))}
                    placeholder="e.g. Aerospace Engineering"
                    className="w-full p-2.5 rounded-lg border border-slate-300 font-medium text-slate-800 text-xs focus:ring-2 focus:ring-[#001F44] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Specialization / Domain Focus:
                  </label>
                  <input
                    type="text"
                    value={academicForm.specialization}
                    onChange={(e) => setAcademicForm(prev => ({ ...prev, specialization: e.target.value }))}
                    placeholder="e.g. Avionics, Aerodynamics, Artificial Intelligence, Power Systems"
                    className="w-full p-2.5 rounded-lg border border-slate-300 font-medium text-slate-800 text-xs focus:ring-2 focus:ring-[#001F44] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Current Year of Study:
                  </label>
                  <select
                    value={academicForm.currentYear}
                    onChange={(e) => {
                      const yr = parseInt(e.target.value, 10);
                      const defaultSem = yr === 1 ? 1 : yr === 2 ? 3 : yr === 3 ? 5 : 7;
                      const autoGradYear = 2026 + (4 - yr);
                      setAcademicForm(prev => ({
                        ...prev,
                        currentYear: yr,
                        completedSemesters: defaultSem,
                        graduationYear: autoGradYear
                      }));
                    }}
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-800"
                  >
                    <option value={1}>1st Year (Semester 1 & 2)</option>
                    <option value={2}>2nd Year (Semester 3 & 4)</option>
                    <option value={3}>3rd Year (Semester 5 & 6)</option>
                    <option value={4}>4th Year (Semester 7 & 8)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Completed Semester:
                  </label>
                  <select
                    value={academicForm.completedSemesters}
                    onChange={(e) => setAcademicForm(prev => ({ ...prev, completedSemesters: parseInt(e.target.value, 10) }))}
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-800"
                  >
                    {academicForm.currentYear === 1 && (
                      <>
                        <option value={1}>Semester 1</option>
                        <option value={2}>Semester 2</option>
                      </>
                    )}
                    {academicForm.currentYear === 2 && (
                      <>
                        <option value={3}>Semester 3</option>
                        <option value={4}>Semester 4</option>
                      </>
                    )}
                    {academicForm.currentYear === 3 && (
                      <>
                        <option value={5}>Semester 5</option>
                        <option value={6}>Semester 6</option>
                      </>
                    )}
                    {academicForm.currentYear === 4 && (
                      <>
                        <option value={7}>Semester 7</option>
                        <option value={8}>Semester 8</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Cumulative CGPA (out of 10.00):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="10"
                    required
                    value={academicForm.currentCgpa}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || (parseFloat(val) <= 10 && /^\d*\.?\d{0,2}$/.test(val))) {
                        setAcademicForm(prev => ({ ...prev, currentCgpa: val }));
                      }
                    }}
                    placeholder="e.g. 8.75"
                    className="w-full p-2.5 rounded-lg border border-slate-300 font-bold text-[#001F44] text-sm"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Calculated up to Semester {academicForm.completedSemesters}
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Standing (Active) Arrears:
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    required
                    value={academicForm.standingArrears}
                    onChange={(e) => {
                      const clean = Math.max(0, parseInt(e.target.value || '0', 10));
                      setAcademicForm(prev => ({
                        ...prev,
                        standingArrears: String(clean)
                      }));
                    }}
                    placeholder="0"
                    className="w-full p-2.5 rounded-lg border border-slate-300 font-bold text-[#001F44] text-sm"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Set to 0 if all subjects cleared
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditAcademicModal(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 font-extrabold rounded-lg bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] shadow-sm cursor-pointer transition"
                >
                  Save Academic Profile & CGPA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FORMAL OFFER LETTER MODAL */}
      {selectedOfferLetter && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-8 shadow-2xl border border-slate-200 relative max-h-[90vh] overflow-y-auto">
            {/* Letterhead */}
            <div className="border-b-2 border-[#001F44] pb-4 mb-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-[#001F44] tracking-tight">INDIAN INSTITUTE OF TECHNOLOGY MADRAS</h2>
                  <p className="text-xs font-bold text-slate-600">OFFICE OF CAREER SERVICES & CAMPUS PLACEMENTS</p>
                  <p className="text-[10px] text-slate-400">Chennai - 600036, Tamil Nadu, India</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="text-right">
                    <div className="text-[10px] font-black uppercase tracking-wider text-[#D4AF37] bg-[#001F44] px-3 py-1 rounded">
                      OFFICIAL LETTER
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 font-mono">
                      REF: IITM/OCS/2026/OFF-{selectedOfferLetter.id ? selectedOfferLetter.id.slice(0, 8).toUpperCase() : 'PLACED'}
                    </div>
                  </div>
                  {/* Top-Right Quick Close '✕' Button */}
                  <button
                    type="button"
                    onClick={() => setSelectedOfferLetter(null)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 flex items-center justify-center transition cursor-pointer font-black text-sm shrink-0 -mt-1 shadow-2xs"
                    title="Close Offer Letter (Esc / Close)"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>

            {/* Letter Content */}
            <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
              <div className="flex items-center justify-between text-slate-500 font-semibold">
                <span>Date: {new Date(selectedOfferLetter.created_at || Date.now()).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                <span>Placement Season 2025-2026</span>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-900 text-sm">To:</div>
                <div className="font-extrabold text-[#001F44] text-base mt-0.5">
                  {studentData?.full_name || selectedOfferLetter.student_name || user?.email}
                </div>
                <div className="text-slate-600 mt-0.5">
                  Roll No: <span className="font-semibold text-slate-800">{studentData?.register_number || selectedOfferLetter.register_number}</span> • Department: <span className="font-semibold text-slate-800">{studentData?.department || selectedOfferLetter.department}</span>
                </div>
              </div>

              <div>
                <p className="font-bold text-slate-900 mb-1">
                  Sub: Formal Employment Offer Letter for the position of <u>{selectedOfferLetter.job_title}</u>
                </p>
                <p>
                  Dear <strong>{studentData?.full_name || selectedOfferLetter.student_name || 'Candidate'}</strong>,
                </p>
                <p className="mt-2">
                  On behalf of the Corporate Recruitment Directorate and <strong>{selectedOfferLetter.company_name}</strong>, we are delighted to congratulate you on your outstanding performance throughout the campus placement process. You have successfully cleared all selection stages and technical evaluations.
                </p>
                <p className="mt-2">
                  We are pleased to formally confirm your selection and extend this employment offer letter for the role of <strong>{selectedOfferLetter.job_title}</strong> with <strong>{selectedOfferLetter.company_name}</strong>.
                </p>
              </div>

              {/* Compensation Summary Box */}
              <div className="bg-gradient-to-r from-amber-50 to-emerald-50 rounded-xl p-5 border border-amber-200">
                <div className="text-[11px] font-extrabold text-amber-900 uppercase tracking-wider mb-2">
                  Annual Compensation & Placement Summary
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block">Hiring Organization:</span>
                    <span className="font-extrabold text-slate-900 text-sm">{selectedOfferLetter.company_name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block">Designation / Role:</span>
                    <span className="font-extrabold text-slate-900 text-sm">{selectedOfferLetter.job_title}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block">Expected Joining Date:</span>
                    <span className="font-black text-[#001F44] text-sm">{calculateJoiningDate(selectedOfferLetter.created_at)}</span>
                    <span className="text-[10px] text-slate-400 block font-normal">(Approx. 2-3 months post-offer window)</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block">Placement Status:</span>
                    <span className="font-extrabold text-emerald-700 text-sm flex items-center gap-1">
                      <span>✓</span>
                      <span>Confirmed Campus Placement</span>
                    </span>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-amber-200/60 flex items-center justify-between">
                    <span className="font-bold text-slate-700">Total Annual CTC Package:</span>
                    <span className="text-2xl font-black text-emerald-800">₹ {selectedOfferLetter.ctc_amount} Lakhs Per Annum (LPA)</span>
                  </div>
                </div>
              </div>

              <p>
                Official onboarding schedule, reporting protocols, and joining instructions are tentatively scheduled for <strong>{calculateJoiningDate(selectedOfferLetter.created_at)}</strong> (approximately 2 to 3 months following graduation/selection). Formal joining documentation and induction itinerary will be transmitted directly by the corporate talent acquisition division of {selectedOfferLetter.company_name}.
              </p>

              {/* Sign-off */}
              <div className="pt-6 border-t border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-extrabold text-[#001F44]">Placement Directorate</div>
                  <div className="text-[10px] text-slate-500">IIT Madras Career Services</div>
                </div>
                <div className="text-right">
                  <div className="font-extrabold text-[#001F44]">{selectedOfferLetter.company_name}</div>
                  <div className="text-[10px] text-slate-500">Corporate Talent Acquisition</div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedOfferLetter(null)}
                className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2 font-black rounded-lg bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <span>🖨️</span>
                <span>Print Offer Letter</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentPortal;
