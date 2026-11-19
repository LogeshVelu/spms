import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

export const getApplicantStageInfo = (app, allStages = []) => {
  const stages = (app.stages && app.stages.length > 0) ? app.stages : (allStages || []);
  const stageResults = app.stageResults || [];

  // Check if candidate has completed Round 3 (or the final defined hiring round)
  const isRound3Shortlisted = stageResults.some(
    sr => (sr.sequence_order >= 3 || (stages.length > 0 && sr.sequence_order === stages.length)) &&
          (sr.outcome === 'SHORTLISTED' || sr.outcome === 'PASSED')
  );

  // 1. Rejected state
  const rejectedStage = stageResults.find(sr => sr.outcome === 'REJECTED');
  if (rejectedStage || app.status === 'REJECTED') {
    return {
      status: 'REJECTED',
      currentStage: rejectedStage || stageResults[stageResults.length - 1],
      nextStage: null,
      isScheduled: false,
      canSchedule: false,
      canEditSchedule: false,
      canEvaluate: false,
      canOffer: false
    };
  }

  // 2. Currently SCHEDULED state (waiting for evaluation)
  const scheduledStage = stageResults.find(sr => sr.outcome === 'SCHEDULED');
  if (scheduledStage) {
    const stageObj = stages.find(s => s.id === scheduledStage.job_stage_id || s.sequence_order === scheduledStage.sequence_order) || scheduledStage;
    return {
      status: 'SCHEDULED',
      currentStage: { ...stageObj, ...scheduledStage },
      nextStage: null,
      isScheduled: true,
      canSchedule: false, // Strictly disabled while waiting for this round's evaluation
      canEditSchedule: true, // Recruiter can gracefully update/edit current slot
      canEvaluate: true,  // Recruiter must evaluate this scheduled round
      canOffer: false     // Still in interview, cannot offer yet
    };
  }

  // 3. Shortlisted or Passed state
  const completedResults = stageResults
    .filter(sr => sr.outcome === 'SHORTLISTED' || sr.outcome === 'PASSED')
    .sort((a, b) => (b.sequence_order || 0) - (a.sequence_order || 0));

  if (completedResults.length > 0) {
    const lastCompleted = completedResults[0];
    const nextOrder = (lastCompleted.sequence_order || 1) + 1;
    const nextStageObj = stages.find(s => s.sequence_order === nextOrder);

    if (nextStageObj) {
      return {
        status: 'SHORTLISTED',
        currentStage: lastCompleted,
        nextStage: nextStageObj,
        isScheduled: false,
        canSchedule: app.status !== 'OFFERED' && app.status !== 'ACCEPTED',
        canEditSchedule: false,
        canEvaluate: false,
        canOffer: isRound3Shortlisted // Offer unlocks only when Round 3 is shortlisted
      };
    } else {
      return {
        status: 'ALL_CLEARED',
        currentStage: lastCompleted,
        nextStage: null,
        isScheduled: false,
        canSchedule: false,
        canEditSchedule: false,
        canEvaluate: false,
        canOffer: true // All 3 rounds cleared -> Offer fully enabled!
      };
    }
  }

  // 4. Initial state (no round shortlisted or scheduled yet)
  const firstStage = stages[0] || null;
  return {
    status: 'INITIAL',
    currentStage: stageResults[0] || (firstStage ? { ...firstStage, outcome: 'PENDING' } : null),
    nextStage: firstStage,
    isScheduled: false,
    canSchedule: app.status !== 'OFFERED' && app.status !== 'ACCEPTED',
    canEditSchedule: false,
    canEvaluate: false, // Strictly disabled until this round is scheduled
    canOffer: false // Initial round, cannot offer yet
  };
};

export const toDatetimeLocal = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${mins}`;
};

export const RecruiterPortal = ({ user, profile, onRefresh }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [company, setCompany] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [applicantsData, setApplicantsData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modals & Form states
  const [showCreateJobModal, setShowCreateJobModal] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [editingCompany, setEditingCompany] = useState(null);
  const [evaluatingCandidate, setEvaluatingCandidate] = useState(null); // { applicant, stageId, outcome, feedback }
  const [schedulingInterview, setSchedulingInterview] = useState(null); // { applicant, stageId, start, end, venue, link, notes }
  const [issuingOffer, setIssuingOffer] = useState(null); // { applicant, ctc, days }
  const [offerSuccessMessage, setOfferSuccessMessage] = useState(null);
  const [snapshotViewModal, setSnapshotViewModal] = useState(null);
  const [message, setMessage] = useState(null);

  // Helper to get completely fresh job form state with Zero Arrears default
  const getFreshJobForm = () => {
    const defaultDeadline = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
    return {
      title: '',
      description: '',
      location: '',
      workMode: 'ON_SITE',
      salaryPackageLpa: '',
      applicationDeadline: defaultDeadline,
      maxGraduationYear: '2030',
      minCgpa: '7.00',
      minTenthPercentage: '60.00',
      minTwelfthPercentage: '60.00',
      maxStandingArrears: '0',
      maxHistoryArrears: '0',
      eligibleDegrees: ['B.Tech', 'M.Tech'],
      eligibleDepartments: [
        'All Engineering Branches',
        'Aerospace Engineering',
        'Computer Science and Engineering',
        'Information Technology',
        'Electronics and Communication Engineering',
        'Mechanical Engineering',
        'Electrical and Electronics Engineering',
        'Civil Engineering',
        'Chemical Engineering',
        'Biotechnology'
      ],
      eligibleGraduationYears: [2026]
    };
  };

  const [jobForm, setJobForm] = useState(getFreshJobForm());

  const handleOpenCreateJobModal = () => {
    setJobForm(getFreshJobForm());
    setShowCreateJobModal(true);
  };

  const handleCloseCreateJobModal = () => {
    setShowCreateJobModal(false);
    setJobForm(getFreshJobForm());
  };

  useEffect(() => {
    loadRecruiterData();
  }, [user]);

  const loadRecruiterData = async () => {
    setLoading(true);
    try {
      const [compRes, jobsRes, analyticsRes] = await Promise.all([
        api.getMyCompany().catch(() => ({ data: {} })),
        api.getJobs().catch(() => ({ data: [] })),
        api.getRecruiterAnalytics().catch(() => ({ data: {} }))
      ]);

      setCompany(compRes.data || null);
      setJobs(jobsRes.data || []);
      setAnalytics(analyticsRes.data || null);

      setSelectedJobId('ALL');
      loadJobApplicants('ALL');
    } catch (err) {
      console.error('Recruiter data load error', err);
    } finally {
      setLoading(false);
    }
  };

  const loadJobApplicants = async (jobId = 'ALL') => {
    try {
      const res = await api.getJobApplicants(jobId || 'ALL');
      setApplicantsData(res.data);
    } catch (err) {
      console.error('Applicants load error', err);
    }
  };

  const showToast = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  // Create Job Handler
  const handleCreateJob = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createJob(jobForm);
      showToast(res.message || 'Job opening created successfully.');
      handleCloseCreateJobModal();
      loadRecruiterData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Edit Job Handlers
  const handleStartEditJob = (job) => {
    setEditingJob({
      id: job.id,
      title: job.title || '',
      description: job.description || '',
      location: job.location || '',
      workMode: job.work_mode || 'ON_SITE',
      salaryPackageLpa: String(job.salary_package_lpa || ''),
      applicationDeadline: job.application_deadline ? new Date(job.application_deadline).toISOString().split('T')[0] : '',
      maxGraduationYear: job.max_graduation_year ? String(job.max_graduation_year) : '2030',
      minCgpa: job.min_cgpa !== undefined ? String(job.min_cgpa) : '7.00',
      minTenthPercentage: job.min_tenth_percentage !== undefined ? String(job.min_tenth_percentage) : '60.00',
      minTwelfthPercentage: job.min_twelfth_percentage !== undefined ? String(job.min_twelfth_percentage) : '60.00',
      maxStandingArrears: job.max_standing_arrears !== undefined ? String(job.max_standing_arrears) : '0',
      status: job.status || 'PUBLISHED'
    });
  };

  const handleSaveEditJob = async (e) => {
    e.preventDefault();
    if (!editingJob) return;
    try {
      const res = await api.updateJob(editingJob.id, editingJob);
      showToast(res.message || 'Job opening updated successfully.');
      setEditingJob(null);
      loadRecruiterData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteJob = async (jobId, jobTitle) => {
    if (!window.confirm(`Are you sure you want to close or delete the drive "${jobTitle}"?`)) {
      return;
    }
    try {
      const res = await api.deleteJob(jobId);
      showToast(res.message || 'Job opening updated/removed.');
      loadRecruiterData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Edit Corporate Profile Handlers
  const handleStartEditCompany = () => {
    setEditingCompany({
      description: company?.description || '',
      website: company?.website || '',
      industry: company?.industry || '',
      logoUrl: company?.logo_url || ''
    });
  };

  const handleSaveEditCompany = async (e) => {
    e.preventDefault();
    if (!editingCompany) return;
    try {
      const res = await api.updateMyCompany(editingCompany);
      showToast('Corporate profile updated successfully.');
      setCompany(res.data);
      setEditingCompany(null);
      loadRecruiterData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Stage Evaluation Handler
  const handleSaveEvaluation = async () => {
    if (!evaluatingCandidate) return;
    try {
      await api.updateStageResult(evaluatingCandidate.applicant.id, {
        stageId: evaluatingCandidate.stageId,
        outcome: evaluatingCandidate.outcome,
        feedback: evaluatingCandidate.feedback
      });
      showToast(`Evaluation outcome '${evaluatingCandidate.outcome}' committed.`);
      setEvaluatingCandidate(null);
      loadJobApplicants(selectedJobId);
      loadRecruiterData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Schedule or Edit Interview Handler
  const handleScheduleInterview = async () => {
    if (!schedulingInterview) return;
    try {
      const res = await api.scheduleInterview({
        applicationId: schedulingInterview.applicant.id,
        jobStageId: schedulingInterview.stageId,
        scheduledStart: schedulingInterview.start,
        scheduledEnd: schedulingInterview.end,
        venue: schedulingInterview.venue,
        meetingLink: schedulingInterview.link,
        notes: schedulingInterview.notes
      });
      showToast(res.message || (schedulingInterview.isEditMode ? 'Interview schedule updated successfully!' : 'Interview scheduled successfully!'));
      setSchedulingInterview(null);
      loadJobApplicants(selectedJobId);
      loadRecruiterData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Open New Schedule Modal
  const handleOpenNewSchedule = (app, stageInfo) => {
    if (!stageInfo.canSchedule || !stageInfo.nextStage) return;
    const targetStage = stageInfo.nextStage;

    const start = new Date();
    start.setDate(start.getDate() + 2);
    start.setHours(10, 0, 0, 0);
    const startStr = toDatetimeLocal(start);

    const end = new Date();
    end.setDate(end.getDate() + 2);
    end.setHours(11, 0, 0, 0);
    const endStr = toDatetimeLocal(end);

    setSchedulingInterview({
      applicant: app,
      stageId: targetStage.id,
      targetStage,
      start: startStr,
      end: endStr,
      venue: 'Campus Virtual Conference Room',
      link: 'https://meet.zoho.com/campus-interview',
      notes: `Evaluation for Round ${targetStage.sequence_order}: ${targetStage.stage_name}`,
      isEditMode: false
    });
  };

  // Open Edit Schedule Modal
  const handleOpenEditSchedule = (app, stageInfo) => {
    const active = app.activeInterview;
    const targetStage = stageInfo.currentStage;
    const stageId = active?.job_stage_id || targetStage?.job_stage_id || targetStage?.id;

    let startStr = toDatetimeLocal(active?.scheduled_start);
    let endStr = toDatetimeLocal(active?.scheduled_end);

    if (!startStr) {
      const start = new Date();
      start.setDate(start.getDate() + 2);
      start.setHours(10, 0, 0, 0);
      startStr = toDatetimeLocal(start);
    }
    if (!endStr) {
      const end = new Date();
      end.setDate(end.getDate() + 2);
      end.setHours(11, 0, 0, 0);
      endStr = toDatetimeLocal(end);
    }

    setSchedulingInterview({
      applicant: app,
      stageId,
      targetStage,
      start: startStr,
      end: endStr,
      venue: active?.venue || 'Campus Virtual Conference Room',
      link: active?.meeting_link || 'https://meet.zoho.com/campus-interview',
      notes: active?.notes || `Interview for Round ${targetStage?.sequence_order || 1}: ${targetStage?.stage_name || ''}`,
      isEditMode: true
    });
  };

  // Issue Offer Handler
  const handleIssueOffer = async () => {
    if (!issuingOffer) return;
    try {
      await api.issueOffer({
        applicationId: issuingOffer.applicant.id,
        ctcAmount: issuingOffer.ctc,
        customCompanyName: issuingOffer.companyName,
        customDesignation: issuingOffer.designation,
        validUntilDays: issuingOffer.days || 30,
        notes: issuingOffer.notes
      });
      setIssuingOffer(null);
      setOfferSuccessMessage(null);
      showToast('Super! Congratulations, successfully sent your offer');
      await loadJobApplicants(selectedJobId);
      loadRecruiterData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // View Resume Snapshot
  const handleInspectSnapshot = async (snapshotId) => {
    try {
      const res = await api.getResumeSnapshot(snapshotId);
      setSnapshotViewModal(res.data);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Download Candidate Resume
  const handleDownloadResume = async (app) => {
    if (!app?.snapshot_id) {
      showToast('No resume snapshot available for this applicant.', 'error');
      return;
    }
    try {
      showToast(`Downloading verified resume for ${app.student_name}...`);
      await api.downloadResumePdf(app.snapshot_id, app.student_name);
      showToast(`Resume for ${app.student_name} downloaded successfully!`);
    } catch (err) {
      showToast(err.message || 'Failed to download candidate resume.', 'error');
    }
  };

  const isVerifiedCompany = company?.approval_status === 'VERIFIED';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Toast Alert */}
      {message && (
        <div className={`mb-6 p-4 rounded-xl text-sm font-semibold flex items-center justify-between shadow-md transition-all ${
          message.type === 'error' ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs font-bold underline ml-4">Dismiss</button>
        </div>
      )}

      {/* Recruiter & Company Header Capsule */}
      <div className="bg-gradient-to-r from-[#001F44] to-[#0A1B30] text-white rounded-2xl p-6 shadow-xl mb-8 border border-emerald-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            src={company?.logo_url || 'https://images.unsplash.com/photo-1549923746-c502d488b3ea?auto=format&fit=crop&w=120&h=120&q=80'}
            alt={company?.name}
            className="w-16 h-16 rounded-xl object-cover border border-slate-700 bg-white p-1"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight">{company?.name || 'Corporate Partner'}</h1>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                isVerifiedCompany
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}>
                {company?.approval_status || 'PENDING'} PARTNER
              </span>
            </div>
            <p className="text-slate-300 text-xs mt-1">
              Recruiter: <span className="font-semibold text-[#D4AF37]">{profile?.full_name}</span> ({profile?.designation}) • {company?.industry || 'Technology'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenCreateJobModal}
            className="px-5 py-2.5 text-xs font-extrabold rounded-xl bg-[#D4AF37] text-[#001F44] hover:bg-[#C9A34A] transition shadow-md flex items-center gap-2"
          >
            <span>+</span> Post New Job Opening
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 mb-8 pb-1">
        {[
          { id: 'dashboard', label: '📊 Recruitment Overview' },
          { id: 'applicants', label: `👥 Candidate Review (${applicantsData?.applicants?.length || 0})` },
          { id: 'jobs', label: `💼 Job Openings (${jobs.length})` },
          { id: 'company', label: '🏢 Corporate Profile' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
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

      {/* TAB 1: RECRUITMENT OVERVIEW */}
      {activeTab === 'dashboard' && (
        <div className="space-y-8">
          {/* Recruitment Funnel Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Applications</span>
              <div className="text-3xl font-extrabold text-[#001F44] mt-1">{analytics?.funnel?.totalApplications ?? 0}</div>
              <p className="text-xs text-slate-500 mt-2">Active candidates</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">In Progress / Shortlist</span>
              <div className="text-3xl font-extrabold text-blue-600 mt-1">{analytics?.funnel?.inProgress ?? 0}</div>
              <p className="text-xs text-slate-500 mt-2">Rounds active</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Offers Issued</span>
              <div className="text-3xl font-extrabold text-[#D4AF37] mt-1">{analytics?.funnel?.offered ?? 0}</div>
              <p className="text-xs text-slate-500 mt-2">Extended packages</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Offers Accepted</span>
              <div className="text-3xl font-extrabold text-emerald-600 mt-1">{analytics?.funnel?.accepted ?? 0}</div>
              <p className="text-xs text-slate-500 mt-2">Confirmed hires</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Job Postings</span>
              <div className="text-3xl font-extrabold text-slate-800 mt-1">{jobs.filter(j => j.status === 'PUBLISHED').length}</div>
              <p className="text-xs text-slate-500 mt-2">Campus published</p>
            </div>
          </div>

          {!isVerifiedCompany && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-amber-900 text-xs leading-relaxed">
              ⚠️ <strong>Partner Verification Pending:</strong> Your organization is undergoing review by the IIT Madras Placement Directorate. Jobs you draft will remain in <code>PENDING_APPROVAL</code> status until verified by placement officers.
            </div>
          )}

          {/* Quick List of Active Drives */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#001F44] mb-4">Current Campus Drives</h2>
            <div className="divide-y divide-slate-100">
              {jobs.map(job => (
                <div key={job.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="font-bold text-base text-[#001F44]">{job.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      📍 {job.location} • ₹{job.salary_package_lpa} LPA • Deadline: {new Date(job.application_deadline).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold bg-slate-100 px-3 py-1 rounded-full text-slate-700">
                      {job.applicant_count || 0} Candidates Applied
                    </span>
                    <button
                      onClick={() => {
                        setSelectedJobId(job.id);
                        loadJobApplicants(job.id);
                        setActiveTab('applicants');
                      }}
                      className="text-xs font-bold text-[#001F44] hover:underline px-3 py-1 bg-slate-50 rounded-lg border border-slate-200"
                    >
                      Review Applicants
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: APPLICANT REVIEWS (WITH IMMUTABLE RESUME SNAPSHOTS) */}
      {activeTab === 'applicants' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[#001F44]">
                Applicant Review {applicantsData?.applicants ? `(${applicantsData.applicants.length})` : ''}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Multiple round evaluation and candidate review across campus recruitment drives.
              </p>
            </div>

            {/* Job Opening Selector */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600">Select Drive:</label>
              <select
                value={selectedJobId || 'ALL'}
                onChange={(e) => {
                  setSelectedJobId(e.target.value);
                  loadJobApplicants(e.target.value);
                }}
                className="text-xs font-semibold p-2 rounded-lg border border-slate-300 bg-white"
              >
                <option value="ALL">All Drives</option>
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>{j.title}</option>
                ))}
              </select>
            </div>
          </div>

          {applicantsData?.applicants?.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center text-slate-400 border border-slate-200 text-xs">
              {selectedJobId === 'ALL'
                ? 'No applications submitted yet across any campus recruitment drives.'
                : 'No applications submitted yet for this job opening.'}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[760px]">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200 text-[11px]">
                    <tr>
                      <th className="p-4">Candidate Profile</th>
                      <th className="p-4">Discipline & CGPA</th>
                      <th className="p-4">Resume</th>
                      <th className="p-4">Stage Results</th>
                      <th className="p-4">Application Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {applicantsData?.applicants?.map(app => {
                      const isSelected = app.status === 'OFFERED' || app.status === 'ACCEPTED' || Boolean(app.offer_status) || Boolean(app.offer_id);

                      return (
                      <tr key={app.id} className={`transition ${isSelected ? 'bg-emerald-50/30 hover:bg-emerald-50/50' : 'hover:bg-slate-50/80'}`}>
                        <td className="p-4">
                          <div className="font-extrabold text-[#001F44] text-sm">{app.student_name}</div>
                          <div className="text-slate-500 text-[11px] font-mono mt-0.5">{app.register_number} • {app.student_email}</div>
                          {app.job_title && (
                            <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px] border border-blue-100">
                              <span>💼</span>
                              <span>{app.job_title}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-slate-800">{app.department}</div>
                          <div className="text-slate-500 text-[11px]">
                            CGPA: <span className="font-black text-[#001F44]">{Number(app.current_cgpa).toFixed(2)}</span> • Backlogs: <span className={app.standing_arrears > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>{app.standing_arrears}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          {app.snapshot_id ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleDownloadResume(app)}
                                className="px-2.5 py-1.5 rounded-lg bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] text-[11px] font-extrabold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                                title="Download Candidate Resume PDF"
                              >
                                <span>📥</span>
                                <span>Download</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">No resume</span>
                          )}
                        </td>
                        <td className="p-4">
                          {(() => {
                            const stageInfo = getApplicantStageInfo(app, applicantsData.stages);
                            if (!stageInfo.currentStage) {
                              return <span className="text-slate-400 italic text-[11px]">Not evaluated</span>;
                            }

                            const { sequence_order, outcome, stage_name, feedback } = stageInfo.currentStage;
                            const isShortlisted = outcome === 'SHORTLISTED' || outcome === 'PASSED';
                            const isScheduled = outcome === 'SCHEDULED';
                            const isRejected = outcome === 'REJECTED';
                            const active = app.activeInterview;

                            return (
                              <div>
                                <span
                                  className={`px-2.5 py-1 rounded text-[10px] font-extrabold uppercase inline-block ${
                                    isShortlisted
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : isScheduled
                                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                      : isRejected
                                      ? 'bg-rose-100 text-rose-800'
                                      : outcome === 'ON_HOLD'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                  title={`Round ${sequence_order || 1}: ${stage_name || ''} - ${feedback || outcome}`}
                                >
                                  R{sequence_order || 1}: {outcome}
                                </span>
                                {isScheduled && active?.scheduled_start && (
                                  <div className="text-[10px] text-slate-500 mt-1 flex flex-col font-medium leading-tight">
                                    <span>🕒 {new Date(active.scheduled_start).toLocaleDateString([], { month: 'short', day: 'numeric' })} at {new Date(active.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    {active.venue && (
                                      <span className="truncate max-w-[150px] text-slate-400 mt-0.5" title={active.venue}>📍 {active.venue}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-4">
                          {isSelected ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Selected
                            </span>
                          ) : (
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                              app.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-800' :
                              app.status === 'OFFERED' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                              app.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                              app.status === 'REJECTED' ? 'bg-rose-100 text-rose-800' :
                              'bg-slate-100 text-slate-800'
                            }`}>
                              {app.status}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          {isSelected ? (
                            <div className="flex items-center justify-end">
                              <button
                                type="button"
                                disabled
                                className="px-3.5 py-1.5 text-xs font-black rounded-lg bg-emerald-600 text-white shadow-sm flex items-center gap-1.5 tracking-wider uppercase border border-emerald-500 cursor-default select-none opacity-100"
                                title="Candidate Selected & Offered (No further actions)"
                              >
                                <span>✓</span>
                                <span>Selected</span>
                              </button>
                            </div>
                          ) : (() => {
                            const stageInfo = getApplicantStageInfo(app, applicantsData.stages);

                            return (
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Evaluate Stage Button */}
                                <button
                                  disabled={!stageInfo.canEvaluate}
                                  onClick={() => {
                                    const targetStage = stageInfo.isScheduled
                                      ? stageInfo.currentStage
                                      : stageInfo.nextStage || stageInfo.currentStage;
                                    const targetStageId = targetStage?.job_stage_id || targetStage?.id || (app.stages || applicantsData.stages)?.[0]?.id;

                                    setEvaluatingCandidate({
                                      applicant: app,
                                      stageId: targetStageId,
                                      outcome: 'SHORTLISTED',
                                      feedback: ''
                                    });
                                  }}
                                  className={`px-2.5 py-1 text-[11px] font-bold rounded transition ${
                                    stageInfo.canEvaluate
                                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer'
                                      : 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'
                                  }`}
                                  title={
                                    stageInfo.canEvaluate
                                      ? `Evaluate Round ${stageInfo.currentStage?.sequence_order || ''}: ${stageInfo.currentStage?.stage_name || ''}`
                                      : 'Interview must be scheduled before evaluating this round'
                                  }
                                >
                                  Evaluate
                                </button>

                                {/* If interview is currently SCHEDULED: Show "Edit Slot" button */}
                                {stageInfo.isScheduled ? (
                                  <button
                                    onClick={() => handleOpenEditSchedule(app, stageInfo)}
                                    className="px-2.5 py-1 text-[11px] font-bold rounded border bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-300 cursor-pointer shadow-xs flex items-center gap-1 transition"
                                    title={`Edit scheduled interview slot (time, room/venue, or link) for Round ${stageInfo.currentStage?.sequence_order || ''}`}
                                  >
                                    <span>✏️</span>
                                    <span>Edit Slot</span>
                                  </button>
                                ) : (
                                  /* Otherwise: Show "Schedule" button for next eligible round */
                                  <button
                                    disabled={!stageInfo.canSchedule}
                                    onClick={() => handleOpenNewSchedule(app, stageInfo)}
                                    className={`px-2.5 py-1 text-[11px] font-bold rounded border transition ${
                                      stageInfo.canSchedule
                                        ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 cursor-pointer shadow-xs'
                                        : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                                    }`}
                                    title={
                                      stageInfo.status === 'REJECTED'
                                        ? 'Candidate rejected'
                                        : stageInfo.status === 'ALL_CLEARED'
                                        ? 'All rounds completed'
                                        : `Schedule Round ${stageInfo.nextStage?.sequence_order || ''}: ${stageInfo.nextStage?.stage_name || ''}`
                                    }
                                  >
                                    Schedule
                                  </button>
                                )}

                                {/* Issue Formal Offer */}
                                <button
                                  disabled={!stageInfo.canOffer}
                                  onClick={() => {
                                    if (!stageInfo.canOffer) return;
                                    setIssuingOffer({
                                      applicant: app,
                                      companyName: company?.name || app.company_name || applicantsData.job?.company_name || 'Zoho Corporation',
                                      designation: app.job_title || applicantsData.job?.title || 'Member Technical Staff',
                                      ctc: applicantsData.job?.salary_package_lpa || '14.50',
                                      notes: `Congratulations on clearing all 3 recruitment rounds! We are pleased to extend this formal offer letter.`
                                    });
                                  }}
                                  className={`px-2.5 py-1 text-[11px] font-extrabold rounded border transition shadow-xs ${
                                    stageInfo.canOffer
                                      ? 'bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] border-[#D4AF37]/50 cursor-pointer shadow-md'
                                      : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50'
                                  }`}
                                  title={
                                    stageInfo.canOffer
                                      ? 'Extend Formal Placement Offer Letter (Round 3 Cleared)'
                                      : 'Offer unlocks after candidate is shortlisted in Round 3'
                                  }
                                >
                                  Offer
                                </button>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* EVALUATION MODAL */}
      {evaluatingCandidate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-extrabold text-[#001F44] mb-1">
              Evaluate Candidate: {evaluatingCandidate.applicant.student_name}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Roll No: {evaluatingCandidate.applicant.register_number} • Drive: {evaluatingCandidate.applicant.job_title || applicantsData.job?.title}
            </p>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select Stage / Round:</label>
                <select
                  value={evaluatingCandidate.stageId}
                  onChange={(e) => setEvaluatingCandidate({ ...evaluatingCandidate, stageId: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-medium"
                >
                  {(evaluatingCandidate.applicant.stages?.length ? evaluatingCandidate.applicant.stages : applicantsData.stages)?.map(st => (
                    <option key={st.id} value={st.id}>Round {st.sequence_order}: {st.stage_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Evaluation Outcome:</label>
                <div className="grid grid-cols-4 gap-2">
                  {['SHORTLISTED', 'PASSED', 'ON_HOLD', 'REJECTED'].map(oc => (
                    <button
                      key={oc}
                      type="button"
                      onClick={() => setEvaluatingCandidate({ ...evaluatingCandidate, outcome: oc })}
                      className={`py-2 rounded-lg font-extrabold text-[10px] uppercase border transition ${
                        evaluatingCandidate.outcome === oc
                          ? oc === 'REJECTED'
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {oc}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Evaluator Feedback / Comments:</label>
                <textarea
                  rows="3"
                  value={evaluatingCandidate.feedback}
                  onChange={(e) => setEvaluatingCandidate({ ...evaluatingCandidate, feedback: e.target.value })}
                  placeholder="e.g. Strong foundation in data structures, cleared round 2."
                  className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setEvaluatingCandidate(null)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEvaluation}
                  className="px-5 py-2 font-extrabold rounded-lg bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B]"
                >
                  Save Evaluation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCHEDULE / EDIT INTERVIEW MODAL */}
      {schedulingInterview && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-extrabold text-[#001F44] flex items-center gap-2">
                <span>{schedulingInterview.isEditMode ? '✏️' : '📅'}</span>
                <span>{schedulingInterview.isEditMode ? 'Edit Scheduled Interview Slot' : 'Schedule Interview Slot'}</span>
              </h3>
              {schedulingInterview.isEditMode && (
                <span className="text-[10px] bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded border border-amber-300 uppercase tracking-wider">
                  Edit Mode
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Candidate: <span className="font-bold text-slate-800">{schedulingInterview.applicant.student_name}</span> ({schedulingInterview.applicant.department})
            </p>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {schedulingInterview.isEditMode ? 'Scheduled Hiring Round:' : 'Hiring Round to Schedule:'}
                </label>
                <div className={`p-3 rounded-lg border flex items-center justify-between ${
                  schedulingInterview.isEditMode ? 'border-amber-200 bg-amber-50/50' : 'border-blue-200 bg-blue-50/50'
                }`}>
                  <div>
                    <span className={`font-extrabold text-xs ${schedulingInterview.isEditMode ? 'text-amber-900' : 'text-blue-900'}`}>
                      Round {schedulingInterview.targetStage?.sequence_order || 1}: {schedulingInterview.targetStage?.stage_name || 'Interview'}
                    </span>
                    {schedulingInterview.targetStage?.description && (
                      <p className="text-[11px] text-slate-500 mt-0.5">{schedulingInterview.targetStage.description}</p>
                    )}
                  </div>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider ${
                    schedulingInterview.isEditMode ? 'bg-amber-200 text-amber-900' : 'bg-blue-200 text-blue-900'
                  }`}>
                    {schedulingInterview.isEditMode ? 'Active Round' : 'Next Round'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Start Time:</label>
                  <input
                    type="datetime-local"
                    value={schedulingInterview.start}
                    onChange={(e) => setSchedulingInterview({ ...schedulingInterview, start: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">End Time:</label>
                  <input
                    type="datetime-local"
                    value={schedulingInterview.end}
                    onChange={(e) => setSchedulingInterview({ ...schedulingInterview, end: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Meeting Link / Virtual Hall:</label>
                <input
                  type="text"
                  value={schedulingInterview.link}
                  onChange={(e) => setSchedulingInterview({ ...schedulingInterview, link: e.target.value })}
                  placeholder="e.g. https://meet.zoho.com/campus-interview or Zoom / Teams URL"
                  className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Room / Venue / Lab:</label>
                <input
                  type="text"
                  value={schedulingInterview.venue}
                  onChange={(e) => setSchedulingInterview({ ...schedulingInterview, venue: e.target.value })}
                  placeholder="e.g. Campus Virtual Conference Room or Executive Boardroom 2"
                  className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Instructions for Candidate:</label>
                <textarea
                  rows="2"
                  value={schedulingInterview.notes}
                  onChange={(e) => setSchedulingInterview({ ...schedulingInterview, notes: e.target.value })}
                  placeholder="e.g. Technical system architecture & coding round. Have code editor ready."
                  className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setSchedulingInterview(null)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleScheduleInterview}
                  className={`px-5 py-2 font-extrabold rounded-lg text-white cursor-pointer shadow-xs ${
                    schedulingInterview.isEditMode
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {schedulingInterview.isEditMode ? 'Save Changes' : 'Schedule Interview'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ISSUE FORMAL OFFER MODAL */}
      {issuingOffer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            {offerSuccessMessage ? (
              <div className="py-8 px-4 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto shadow-sm">
                  🎉
                </div>
                <div>
                  <h4 className="text-xl font-black text-emerald-700">
                    {offerSuccessMessage}
                  </h4>
                  <p className="text-xs text-slate-600 mt-2 font-medium">
                    Formal offer letter successfully issued to <strong>{issuingOffer.applicant.student_name}</strong> for <strong>{issuingOffer.designation}</strong> at <strong>{issuingOffer.companyName}</strong> (₹{issuingOffer.ctc} LPA).
                  </p>
                </div>
                <div className="pt-2 flex items-center justify-center gap-2 text-xs font-bold text-emerald-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  <span>Closing window in 2 seconds...</span>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-extrabold text-[#001F44] flex items-center gap-2">
                    <span>🎓</span>
                    <span>Issue Formal Placement Offer Letter</span>
                  </h3>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-0.5 rounded border border-emerald-300 uppercase tracking-wider">
                    Round 3 Cleared
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Candidate: <span className="font-bold text-slate-800">{issuingOffer.applicant.student_name}</span> ({issuingOffer.applicant.department}) • Roll No: <span className="font-semibold text-slate-700">{issuingOffer.applicant.register_number}</span>
                </p>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Hiring Company Entity / Corporate Name:</label>
                    <input
                      type="text"
                      value={issuingOffer.companyName}
                      onChange={(e) => setIssuingOffer({ ...issuingOffer, companyName: e.target.value })}
                      placeholder="e.g. Zoho Corporation or Zoho Technologies Private Limited"
                      className="w-full p-2.5 rounded-lg border border-slate-300 font-bold text-slate-800 bg-white"
                      required
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">You can customize the corporate division or legal hiring partner name.</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Job Designation / Offered Role:</label>
                    <input
                      type="text"
                      value={issuingOffer.designation}
                      onChange={(e) => setIssuingOffer({ ...issuingOffer, designation: e.target.value })}
                      placeholder="e.g. Member Technical Staff or Software Development Engineer"
                      className="w-full p-2.5 rounded-lg border border-slate-300 font-medium bg-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Offered Annual CTC Package (in INR Lakhs):</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 font-extrabold text-slate-400">₹</span>
                      <input
                        type="number"
                        step="0.1"
                        value={issuingOffer.ctc}
                        onChange={(e) => setIssuingOffer({ ...issuingOffer, ctc: e.target.value })}
                        className="w-full p-2.5 pl-8 pr-12 rounded-lg border border-slate-300 font-black text-base text-[#001F44]"
                        required
                      />
                      <span className="absolute right-3 top-3 text-[10px] text-slate-400 uppercase font-black">LPA</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">This annual CTC package will be featured prominently on the candidate's formal offer letter.</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Offer Letter Remarks / Congratulatory Notes:</label>
                    <textarea
                      rows="2"
                      value={issuingOffer.notes}
                      onChange={(e) => setIssuingOffer({ ...issuingOffer, notes: e.target.value })}
                      placeholder="e.g. Congratulations on successfully clearing all 3 recruitment rounds!"
                      className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                    />
                  </div>

                  <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-emerald-900 text-[11px] flex items-start gap-2">
                    <span className="text-base">📜</span>
                    <span>
                      Extending this formal offer will immediately generate the official offer letter for <strong>{issuingOffer.applicant.student_name}</strong> and send it directly to their student portal.
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      onClick={() => {
                        setOfferSuccessMessage(null);
                        setIssuingOffer(null);
                      }}
                      className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleIssueOffer}
                      className="px-5 py-2 font-black rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer shadow-md flex items-center gap-1.5"
                    >
                      <span>🚀</span>
                      <span>Send Formal Offer Letter</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CAMPUS JOB OPENINGS MANAGEMENT */}
      {activeTab === 'jobs' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[#001F44]">Campus Job Openings & Recruitment Drives</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage, edit cut-offs, review applicant volumes, and publish recruitment drives for IIT Madras students.
              </p>
            </div>
            <button
              onClick={handleOpenCreateJobModal}
              className="px-4 py-2.5 text-xs font-extrabold rounded-xl bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] transition shadow-md flex items-center gap-2 self-start sm:self-auto"
            >
              <span>+</span> Post New Job Opening
            </button>
          </div>

          {jobs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 text-[#001F44] flex items-center justify-center text-3xl mx-auto mb-4">
                💼
              </div>
              <h3 className="text-base font-extrabold text-[#001F44]">No Job Openings Posted Yet</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-6">
                Create your first campus recruitment drive to publish role details, set academic cut-offs, and begin receiving applications from IIT Madras students.
              </p>
              <button
                onClick={handleOpenCreateJobModal}
                className="px-6 py-2.5 text-xs font-extrabold rounded-xl bg-[#D4AF37] text-[#001F44] hover:bg-[#C9A34A] transition shadow-md"
              >
                + Post Your First Job Opening
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {jobs.map(job => {
                const isDeadlinePassed = job.application_deadline && (new Date(job.application_deadline) < new Date(new Date().setHours(0,0,0,0)));
                return (
                  <div key={job.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:border-[#D4AF37]/50 transition space-y-4">
                    {/* Top Row: Title, Status, Compensation */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-extrabold text-[#001F44]">{job.title}</h3>
                          <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                            job.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                            job.status === 'PENDING_APPROVAL' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {job.status === 'PUBLISHED' ? '● Published (Live)' : job.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Role ID: <span className="font-mono">{job.id.slice(0, 8)}...</span> • Posted for {company?.name || 'Your Organization'}
                        </p>
                      </div>

                      <div className="text-left sm:text-right">
                        <div className="text-lg font-black text-[#001F44]">₹{job.salary_package_lpa} LPA</div>
                        <span className="text-[11px] text-slate-400">Annual CTC Package</span>
                      </div>
                    </div>

                    {/* Role Description */}
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                      {job.description}
                    </p>

                    {/* Metadata & Cut-off Matrix */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                      <div>
                        <span className="text-slate-400 text-[10px] block font-medium">Work Mode & Location:</span>
                        <span className="font-bold text-slate-800">{job.location || 'On-Site'} ({job.work_mode})</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block font-medium">Application Deadline:</span>
                        <span className={`font-bold ${isDeadlinePassed ? 'text-rose-600' : 'text-slate-800'}`}>
                          {new Date(job.application_deadline).toLocaleDateString()} {isDeadlinePassed ? '(Expired)' : '(Active)'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block font-medium">Eligible Batch (Grad Year):</span>
                        <span className="font-bold text-[#001F44]">
                          {job.max_graduation_year ? `Up to ${job.max_graduation_year}` : 'All Batches'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block font-medium">Authoritative Cut-Offs:</span>
                        <span className="font-bold text-[#001F44]">
                          CGPA: {job.min_cgpa ?? '7.00'} • 10th: {job.min_tenth_percentage ?? '60'}% • 12th: {job.min_twelfth_percentage ?? '60'}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block font-medium">Max Arrears Allowed:</span>
                        <span className={`font-bold ${job.max_standing_arrears > 0 ? 'text-blue-600' : 'text-emerald-700'}`}>
                          {job.max_standing_arrears ?? 0} {job.max_standing_arrears === 0 ? '(Strict Zero Arrears)' : 'Allowed'}
                        </span>
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
                          👥
                        </span>
                        <span className="text-xs font-extrabold text-[#001F44]">
                          {job.applicant_count || 0} Registered Candidates
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => {
                            setSelectedJobId(job.id);
                            loadJobApplicants(job.id);
                            setActiveTab('applicants');
                          }}
                          className="px-3.5 py-1.5 text-xs font-extrabold rounded-lg bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] shadow-sm transition"
                        >
                          👥 Review Candidates
                        </button>
                        <button
                          onClick={() => handleStartEditJob(job)}
                          className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition"
                        >
                          ✏️ Edit Drive
                        </button>
                        <button
                          onClick={() => handleDeleteJob(job.id, job.title)}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition"
                        >
                          🗑️ Close / Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CORPORATE ORGANIZATION PROFILE */}
      {activeTab === 'company' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[#001F44]">Corporate Organization Profile</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Official institutional profile and contact credentials registered with IIT Madras Placement Directorate.
              </p>
            </div>
            <button
              onClick={handleStartEditCompany}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition flex items-center gap-2 self-start sm:self-auto shadow-sm"
            >
              <span>✏️</span> Edit Corporate Details
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Organization Identity Card */}
            <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#001F44] to-[#032D5B] text-[#D4AF37] font-black text-2xl flex items-center justify-center border border-[#D4AF37]/30 shadow-md">
                  {company?.name ? company.name.charAt(0).toUpperCase() : 'C'}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xl font-extrabold text-[#001F44]">{company?.name || 'Corporate Partner'}</h3>
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      company?.approval_status === 'VERIFIED'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}>
                      {company?.approval_status === 'VERIFIED' ? '✓ Verified Partner' : 'Verification Underway'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Industry: <span className="font-bold text-slate-700">{company?.industry || 'Technology & Engineering'}</span>
                  </p>
                </div>
              </div>

              {/* Company Bio */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Company Description</h4>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200">
                  {company?.description || 'Leading enterprise partner engaged in campus placement drives, summer internships, and core recruitment.'}
                </p>
              </div>

              {/* Grid of Key Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-400 text-[10px] block">Corporate Website</span>
                  {company?.website ? (
                    <a
                      href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-blue-600 hover:underline mt-0.5 block truncate"
                    >
                      {company.website} ↗
                    </a>
                  ) : (
                    <span className="font-semibold text-slate-500">Not provided</span>
                  )}
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-400 text-[10px] block">Placement Directorate Status</span>
                  <span className="font-bold text-[#001F44] mt-0.5 block">
                    {company?.approval_status === 'VERIFIED' ? 'Institutional Partner (IIT Madras)' : 'Pending Directorate Approval'}
                  </span>
                </div>
              </div>
            </div>

            {/* Recruiter Contact & Engagement Stats */}
            <div className="space-y-6">
              {/* Recruiter Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Authorized Recruiter</h4>
                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Full Name:</span>
                    <span className="font-extrabold text-[#001F44] text-sm">{profile?.full_name || 'Recruiter Lead'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Designation:</span>
                    <span className="font-bold text-slate-700">{profile?.designation || 'Campus Talent Acquisition'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Official Email:</span>
                    <span className="font-mono text-slate-700">{user?.email}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Contact Phone:</span>
                    <span className="font-bold text-slate-700">{profile?.phone || '+91 98765 43210'}</span>
                  </div>
                </div>
              </div>

              {/* Recruitment Stats */}
              <div className="bg-gradient-to-br from-[#001F44] to-[#032D5B] text-white rounded-2xl p-6 shadow-md space-y-3">
                <h4 className="text-[11px] font-bold text-[#D4AF37] uppercase tracking-wider">Campus Engagement Stats</h4>
                <div className="grid grid-cols-2 gap-3 text-center pt-1">
                  <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
                    <div className="text-2xl font-black text-white">{jobs.length}</div>
                    <div className="text-[10px] text-slate-300 mt-1">Drives Created</div>
                  </div>
                  <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
                    <div className="text-2xl font-black text-[#D4AF37]">{analytics?.funnel?.accepted ?? 0}</div>
                    <div className="text-[10px] text-slate-300 mt-1">Hires Accepted</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INSPECT IMMUTABLE SNAPSHOT MODAL */}
      {snapshotViewModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                  {snapshotViewModal.integrityStatus}
                </span>
                <h3 className="text-base font-extrabold text-[#001F44] mt-1">
                  Candidate Resume & Verification
                </h3>
              </div>
              <button onClick={() => setSnapshotViewModal(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div>
                  <span className="text-slate-400 text-[11px]">Candidate:</span>
                  <div className="font-bold text-slate-800 text-sm">{snapshotViewModal.candidate.name} ({snapshotViewModal.candidate.registerNumber})</div>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">Original Document:</span>
                  <div className="font-semibold text-slate-700">{snapshotViewModal.fileDetails.originalTitle}</div>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">Cryptographic SHA-256 Checksum:</span>
                  <div className="font-mono text-slate-800 text-[11px] break-all bg-white p-2 rounded border border-slate-200">
                    {snapshotViewModal.fileDetails.checksumSha256}
                  </div>
                </div>
                <div className="flex items-center justify-between text-slate-500 pt-1">
                  <span>File Size: {(snapshotViewModal.fileDetails.sizeBytes / 1024).toFixed(1)} KB</span>
                  <span>Frozen At: {new Date(snapshotViewModal.fileDetails.frozenAt).toLocaleString()}</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 italic">
                🔒 In compliance with placement regulations, this document is guaranteed immutable and identical to what the candidate submitted at application time.
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  onClick={() => handleDownloadResume({
                    snapshot_id: snapshotViewModal.snapshotId,
                    student_name: snapshotViewModal.candidate.name
                  })}
                  className="px-4 py-2 font-extrabold text-xs bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] rounded-lg transition shadow flex items-center gap-1.5 cursor-pointer"
                >
                  <span>📥</span>
                  <span>Download Resume (.PDF)</span>
                </button>
                <button
                  onClick={() => setSnapshotViewModal(null)}
                  className="px-4 py-2 font-bold text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg border border-slate-300 transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE JOB MODAL */}
      {showCreateJobModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-lg font-extrabold text-[#001F44]">Post New Campus Job Opening</h3>
                <p className="text-xs text-slate-500">Configure job details and authoritative server-side cut-off criteria.</p>
              </div>
              <button onClick={handleCloseCreateJobModal} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleCreateJob} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Job Designation / Role Title:</label>
                  <input
                    type="text"
                    required
                    value={jobForm.title}
                    onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                    placeholder="e.g. Associate Systems Engineer"
                    className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Annual Compensation (LPA):</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={jobForm.salaryPackageLpa}
                    onChange={(e) => setJobForm({ ...jobForm, salaryPackageLpa: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Job Description & Responsibilities:</label>
                <textarea
                  rows="3"
                  required
                  value={jobForm.description}
                  onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                  placeholder="Outline core responsibilities, skill expectations, and tech stack..."
                  className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Job Location:</label>
                  <input
                    type="text"
                    value={jobForm.location}
                    onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Work Mode:</label>
                  <select
                    value={jobForm.workMode}
                    onChange={(e) => setJobForm({ ...jobForm, workMode: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="ON_SITE">On-Site</option>
                    <option value="HYBRID">Hybrid</option>
                    <option value="REMOTE">Remote</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Application Deadline:</label>
                  <input
                    type="date"
                    required
                    value={jobForm.applicationDeadline}
                    onChange={(e) => setJobForm({ ...jobForm, applicationDeadline: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Eligible Grad Year (Up to):
                  </label>
                  <input
                    type="number"
                    min="2020"
                    max="2050"
                    placeholder="e.g. 2030"
                    required
                    value={jobForm.maxGraduationYear}
                    onChange={(e) => setJobForm({ ...jobForm, maxGraduationYear: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 font-bold text-[#001F44]"
                  />
                  <p className="text-[10px] text-slate-500 mt-1 font-medium">
                    Batch up to this year (e.g. 2030 allows ≤ 2030)
                  </p>
                </div>
              </div>

              {/* Cut-off Criteria Configuration */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h4 className="font-extrabold text-[#001F44] text-xs mb-3">Authoritative Cut-Off Engine Thresholds</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-slate-500 text-[11px] mb-1">Min CGPA:</label>
                    <input
                      type="number"
                      step="0.01"
                      value={jobForm.minCgpa}
                      onChange={(e) => setJobForm({ ...jobForm, minCgpa: e.target.value })}
                      className="w-full p-2 rounded border border-slate-300 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 text-[11px] mb-1">Min 10th %:</label>
                    <input
                      type="number"
                      value={jobForm.minTenthPercentage}
                      onChange={(e) => setJobForm({ ...jobForm, minTenthPercentage: e.target.value })}
                      className="w-full p-2 rounded border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 text-[11px] mb-1">Min 12th %:</label>
                    <input
                      type="number"
                      value={jobForm.minTwelfthPercentage}
                      onChange={(e) => setJobForm({ ...jobForm, minTwelfthPercentage: e.target.value })}
                      className="w-full p-2 rounded border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 text-[11px] mb-1">Max Active Backlogs:</label>
                    <input
                      type="number"
                      value={jobForm.maxStandingArrears}
                      onChange={(e) => setJobForm({ ...jobForm, maxStandingArrears: e.target.value })}
                      className="w-full p-2 rounded border border-slate-300 font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Eligible Engineering Disciplines Selection */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-extrabold text-[#001F44] text-xs">Eligible Engineering Disciplines</h4>
                  <button
                    type="button"
                    onClick={() => {
                      const allDepts = [
                        'All Engineering Branches',
                        'Aerospace Engineering',
                        'Computer Science and Engineering',
                        'Information Technology',
                        'Electronics and Communication Engineering',
                        'Mechanical Engineering',
                        'Electrical and Electronics Engineering',
                        'Civil Engineering',
                        'Chemical Engineering',
                        'Biotechnology'
                      ];
                      const isAll = jobForm.eligibleDepartments?.includes('All Engineering Branches');
                      setJobForm(prev => ({
                        ...prev,
                        eligibleDepartments: isAll ? ['Computer Science and Engineering'] : allDepts
                      }));
                    }}
                    className="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer"
                  >
                    {jobForm.eligibleDepartments?.includes('All Engineering Branches') ? 'Deselect All' : 'Select All Disciplines (Open to All)'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {[
                    'All Engineering Branches',
                    'Aerospace Engineering',
                    'Computer Science and Engineering',
                    'Information Technology',
                    'Electronics and Communication Engineering',
                    'Mechanical Engineering',
                    'Electrical and Electronics Engineering',
                    'Civil Engineering',
                    'Chemical Engineering',
                    'Biotechnology'
                  ].map(dept => {
                    const checked = jobForm.eligibleDepartments?.includes(dept);
                    return (
                      <label key={dept} className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-100 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (dept === 'All Engineering Branches') {
                              setJobForm(prev => ({
                                ...prev,
                                eligibleDepartments: e.target.checked
                                  ? [
                                      'All Engineering Branches',
                                      'Aerospace Engineering',
                                      'Computer Science and Engineering',
                                      'Information Technology',
                                      'Electronics and Communication Engineering',
                                      'Mechanical Engineering',
                                      'Electrical and Electronics Engineering',
                                      'Civil Engineering',
                                      'Chemical Engineering',
                                      'Biotechnology'
                                    ]
                                  : []
                              }));
                            } else {
                              const next = e.target.checked
                                ? [...(jobForm.eligibleDepartments || []).filter(d => d !== dept), dept]
                                : (jobForm.eligibleDepartments || []).filter(d => d !== dept && d !== 'All Engineering Branches');
                              setJobForm(prev => ({ ...prev, eligibleDepartments: next }));
                            }
                          }}
                          className="rounded text-[#001F44] focus:ring-[#001F44]"
                        />
                        <span className={`font-medium ${checked ? 'text-[#001F44] font-bold' : 'text-slate-600'}`}>{dept}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseCreateJobModal}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 font-extrabold rounded-lg bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] shadow-md"
                >
                  Create & Publish Job
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* EDIT JOB MODAL */}
      {editingJob && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-lg font-extrabold text-[#001F44]">Edit Campus Job Opening</h3>
                <p className="text-xs text-slate-500">Update job details, compensation, deadlines, and authoritative cut-offs.</p>
              </div>
              <button onClick={() => setEditingJob(null)} className="text-slate-400 hover:text-slate-600 font-bold text-base p-1">✕</button>
            </div>

            <form onSubmit={handleSaveEditJob} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Job Designation / Role Title:</label>
                  <input
                    type="text"
                    required
                    value={editingJob.title}
                    onChange={(e) => setEditingJob({ ...editingJob, title: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Annual Compensation (LPA):</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={editingJob.salaryPackageLpa}
                    onChange={(e) => setEditingJob({ ...editingJob, salaryPackageLpa: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Job Description & Responsibilities:</label>
                <textarea
                  rows="3"
                  required
                  value={editingJob.description}
                  onChange={(e) => setEditingJob({ ...editingJob, description: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Job Location:</label>
                  <input
                    type="text"
                    required
                    value={editingJob.location}
                    onChange={(e) => setEditingJob({ ...editingJob, location: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Work Mode:</label>
                  <select
                    value={editingJob.workMode}
                    onChange={(e) => setEditingJob({ ...editingJob, workMode: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="ON_SITE">On-Site</option>
                    <option value="HYBRID">Hybrid</option>
                    <option value="REMOTE">Remote</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Application Deadline:</label>
                  <input
                    type="date"
                    required
                    value={editingJob.applicationDeadline}
                    onChange={(e) => setEditingJob({ ...editingJob, applicationDeadline: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Eligible Grad Year (Up to):
                  </label>
                  <input
                    type="number"
                    min="2020"
                    max="2050"
                    placeholder="e.g. 2030"
                    required
                    value={editingJob.maxGraduationYear}
                    onChange={(e) => setEditingJob({ ...editingJob, maxGraduationYear: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 font-bold text-[#001F44]"
                  />
                  <p className="text-[10px] text-slate-500 mt-1 font-medium">
                    Batch up to this year (e.g. 2030 allows ≤ 2030)
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h4 className="font-extrabold text-[#001F44] text-xs mb-3">Authoritative Cut-Off Engine Thresholds</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold text-[11px] mb-1">Min CGPA:</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingJob.minCgpa}
                      onChange={(e) => setEditingJob({ ...editingJob, minCgpa: e.target.value })}
                      className="w-full p-2 rounded border border-slate-300 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold text-[11px] mb-1">Min 10th %:</label>
                    <input
                      type="number"
                      value={editingJob.minTenthPercentage}
                      onChange={(e) => setEditingJob({ ...editingJob, minTenthPercentage: e.target.value })}
                      className="w-full p-2 rounded border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold text-[11px] mb-1">Min 12th %:</label>
                    <input
                      type="number"
                      value={editingJob.minTwelfthPercentage}
                      onChange={(e) => setEditingJob({ ...editingJob, minTwelfthPercentage: e.target.value })}
                      className="w-full p-2 rounded border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold text-[11px] mb-1">Max Active Backlogs:</label>
                    <input
                      type="number"
                      min="0"
                      value={editingJob.maxStandingArrears}
                      onChange={(e) => setEditingJob({ ...editingJob, maxStandingArrears: e.target.value })}
                      className="w-full p-2 rounded border border-slate-300 font-bold"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Drive Status:</label>
                <select
                  value={editingJob.status}
                  onChange={(e) => setEditingJob({ ...editingJob, status: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-bold"
                >
                  <option value="PUBLISHED">PUBLISHED (Active & Open for Applications)</option>
                  <option value="CLOSED">CLOSED (Locked from new submissions)</option>
                  <option value="PENDING_APPROVAL">PENDING APPROVAL</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingJob(null)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 font-extrabold rounded-lg bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] shadow-md"
                >
                  Save Drive Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CORPORATE PROFILE MODAL */}
      {editingCompany && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-base font-extrabold text-[#001F44]">Edit Corporate Organization Details</h3>
                <p className="text-xs text-slate-500">Update corporate profile info displayed to placement officers and candidates.</p>
              </div>
              <button onClick={() => setEditingCompany(null)} className="text-slate-400 hover:text-slate-600 font-bold text-base p-1">✕</button>
            </div>

            <form onSubmit={handleSaveEditCompany} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Industry Sector:</label>
                <input
                  type="text"
                  required
                  value={editingCompany.industry}
                  onChange={(e) => setEditingCompany({ ...editingCompany, industry: e.target.value })}
                  placeholder="e.g. Technology / FinTech / Cloud Computing"
                  className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Official Website URL:</label>
                <input
                  type="text"
                  required
                  value={editingCompany.website}
                  onChange={(e) => setEditingCompany({ ...editingCompany, website: e.target.value })}
                  placeholder="e.g. https://www.google.com"
                  className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Company Description & Culture:</label>
                <textarea
                  rows="4"
                  required
                  value={editingCompany.description}
                  onChange={(e) => setEditingCompany({ ...editingCompany, description: e.target.value })}
                  placeholder="Brief overview of company mission, culture, and core operations..."
                  className="w-full p-2.5 rounded-lg border border-slate-300 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-extrabold rounded-lg bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] shadow-sm"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default RecruiterPortal;
