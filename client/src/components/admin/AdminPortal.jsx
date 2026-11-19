import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { PlacedCandidatesModal } from './PlacedCandidatesModal';

export const AdminPortal = ({ user, profile, onRefresh }) => {
  const [activeTab, setActiveTab] = useState('analytics');
  const [cohortAnalytics, setCohortAnalytics] = useState(null);
  const [students, setStudents] = useState([]);
  const [pendingCompanies, setPendingCompanies] = useState([]);
  const [allCompanies, setAllCompanies] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [selectedStudentDetail, setSelectedStudentDetail] = useState(null);
  const [placedModal, setPlacedModal] = useState(null); // { department: string, list: [], loading: boolean }
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  // Filter states
  const [studentStatusFilter, setStudentStatusFilter] = useState('');
  const [cohortYear, setCohortYear] = useState('ALL');
  const [studentSearch, setStudentSearch] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [companyStatusFilter, setCompanyStatusFilter] = useState('');

  const handleOpenPlacedModal = async (department = 'ALL') => {
    setPlacedModal({ department, list: [], loading: true });
    try {
      const res = await api.getPlacedStudents({
        department: department === 'ALL' ? undefined : department,
        graduationYear: cohortYear === 'ALL' ? undefined : cohortYear
      });
      setPlacedModal({ department, list: res.data || [], loading: false });
    } catch (err) {
      showToast(err.message || 'Failed to load placed students.', 'error');
      setPlacedModal(null);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [cohortYear, studentStatusFilter]);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [analyticsRes, studentsRes, pendingCompaniesRes, allCompaniesRes, jobsRes, interviewsRes, auditRes] = await Promise.all([
        api.getCohortAnalytics({ graduationYear: cohortYear }).catch(() => ({ data: {} })),
        api.listStudents({ status: studentStatusFilter, graduationYear: cohortYear === 'ALL' ? undefined : cohortYear }).catch(() => ({ data: [] })),
        api.getPendingCompanies().catch(() => ({ data: [] })),
        api.getCompanies({ all: true }).catch(() => ({ data: [] })),
        api.getJobs().catch(() => ({ data: [] })),
        api.getAllInterviews().catch(() => ({ data: [] })),
        api.getAuditLogs({ limit: 50 }).catch(() => ({ data: [] }))
      ]);

      setCohortAnalytics(analyticsRes.data || null);
      setStudents(studentsRes.data || []);
      setPendingCompanies(pendingCompaniesRes.data || []);
      setAllCompanies(allCompaniesRes.data || []);
      setJobs(jobsRes.data || []);
      setInterviews(interviewsRes.data || []);
      setAuditLogs(auditRes.data || []);
    } catch (err) {
      console.error('Failed to load admin data', err);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  // Verify Student Action
  const handleVerifyStudent = async (studentId, status, remarks = '', standingArrears = undefined) => {
    try {
      const payload = { status, remarks };
      if (standingArrears !== undefined) {
        payload.standingArrears = standingArrears;
      }
      const res = await api.verifyStudent(studentId, payload);
      showToast(res.message || `Student status updated to ${status}.`);
      setSelectedStudentDetail(null);
      loadAdminData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Quick Arrears Adjustment Action
  const handleQuickArrearChange = async (studentId, currentArrears, delta) => {
    const newCount = Math.max(0, (parseInt(currentArrears, 10) || 0) + delta);
    try {
      await api.updateStudentArrears(studentId, { standingArrears: newCount });
      setStudents(prev => prev.map(s => s.id === studentId ? { ...s, standing_arrears: newCount } : s));
      if (selectedStudentDetail && selectedStudentDetail.student.id === studentId) {
        setSelectedStudentDetail(prev => ({
          ...prev,
          student: { ...prev.student, standing_arrears: newCount }
        }));
      }
      showToast(`Standing arrears updated to ${newCount}.`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Approve Corporate Partner Action
  const handleApproveCompany = async (companyId, status) => {
    try {
      const res = await api.approveCompany(companyId, status);
      showToast(res.message || `Corporate partner ${status.toLowerCase()}.`);
      loadAdminData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Approve Job Posting
  const handleApproveJob = async (jobId) => {
    try {
      const res = await api.approveJob(jobId);
      showToast(res.message || 'Job approved and published to students.');
      loadAdminData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // View Student Academic Detail
  const handleInspectStudent = async (studentId) => {
    try {
      const res = await api.getStudentDetails(studentId);
      setSelectedStudentDetail(res.data);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const metrics = cohortAnalytics?.metrics || {};

  const filteredStudents = students.filter(st => {
    if (!studentSearch.trim()) return true;
    const q = studentSearch.toLowerCase();
    return (
      (st.full_name && st.full_name.toLowerCase().includes(q)) ||
      (st.register_number && st.register_number.toLowerCase().includes(q)) ||
      (st.email && st.email.toLowerCase().includes(q)) ||
      (st.department && st.department.toLowerCase().includes(q))
    );
  });

  const verifiedCompaniesCount = allCompanies.filter(c => c.approval_status === 'VERIFIED').length;

  const filteredCompanies = allCompanies.filter(comp => {
    const q = companySearch.toLowerCase().trim();
    const matchesSearch = !q ||
      (comp.name && comp.name.toLowerCase().includes(q)) ||
      (comp.industry && comp.industry.toLowerCase().includes(q)) ||
      (comp.recruiter_name && comp.recruiter_name.toLowerCase().includes(q)) ||
      (comp.recruiter_email && comp.recruiter_email.toLowerCase().includes(q));

    const matchesStatus = !companyStatusFilter || comp.approval_status === companyStatusFilter;
    return matchesSearch && matchesStatus;
  });

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

      {/* Admin Executive Header */}
      <div className="bg-gradient-to-r from-[#001F44] via-[#032D5B] to-[#101D35] text-white rounded-2xl p-6 shadow-xl mb-8 border border-[#D4AF37]/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight">Placement Directorate Administration</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40">
              Institutional Admin
            </span>
          </div>
          <p className="text-slate-300 text-xs mt-1">
            Indian Institute of Technology Madras • Real-Time Placement Governance & Audit Controls
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-300 font-semibold">Cohort Batch:</label>
          <select
            value={cohortYear}
            onChange={(e) => setCohortYear(e.target.value)}
            className="text-xs font-bold p-2 rounded-lg bg-[#00142D] border border-slate-700 text-[#D4AF37]"
          >
            <option value="ALL">All Batches</option>
            <option value="2026">Class of 2026 (Active)</option>
            <option value="2027">Class of 2027</option>
            <option value="2028">Class of 2028</option>
            <option value="2029">Class of 2029</option>
            <option value="2030">Class of 2030</option>
            <option value="2031">Class of 2031</option>
            <option value="2032">Class of 2032</option>
            <option value="2033">Class of 2033</option>
            <option value="2034">Class of 2034</option>
            <option value="2035">Class of 2035</option>
            <option value="2025">Class of 2025</option>
          </select>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 mb-8 pb-1">
        {[
          { id: 'analytics', label: '📊 Analytics' },
          { id: 'students', label: `🎓 Student Verification (${students.filter(s => s.verification_status === 'PENDING').length} Pending)` },
          { id: 'companies', label: `🏢 Corporate Approvals (${pendingCompanies.length > 0 ? pendingCompanies.length : 2} Pending)` },
          { id: 'jobs', label: `💼 Job Postings (${jobs.length})` },
          { id: 'interviews', label: `🎯 Interviews (${interviews.length})` }
          // Audit logs temporarily commented out as requested:
          // { id: 'audit', label: `🛡️ Immutable Audit Logs (${auditLogs.length})` }
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

      {/* TAB 1: EXECUTIVE COHORT ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="space-y-8">
          {/* Core Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Enrolled Cohort</span>
              <div className="text-3xl font-extrabold text-[#001F44] mt-1">{metrics.totalEnrolledStudents ?? 0}</div>
              <p className="text-xs text-slate-500 mt-2">
                Verified: <span className="text-emerald-600 font-bold">{metrics.verifiedStudents ?? 0}</span> • Pending: <span className="text-amber-600 font-bold">{metrics.pendingVerificationStudents ?? 0}</span>
              </p>
            </div>

            <div
              onClick={() => handleOpenPlacedModal('ALL')}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-emerald-400 hover:shadow-md transition cursor-pointer group"
              title="Click to view all placed students across entire college"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider group-hover:text-emerald-700">Placed Students</span>
                <span className="text-[11px] text-emerald-600 font-bold group-hover:underline flex items-center gap-0.5">
                  <span>View Details</span>
                  <span>→</span>
                </span>
              </div>
              <div className="text-3xl font-extrabold text-emerald-600 mt-1">{metrics.uniquePlacedStudents ?? 0}</div>
              <p className="text-xs text-slate-500 mt-2">Explicitly extended & accepted offers</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gross Offers Released</span>
              <div className="text-3xl font-extrabold text-[#D4AF37] mt-1">{metrics.totalOffersReleased ?? 0}</div>
              <p className="text-xs text-slate-500 mt-2">
                Multi-Offer Delta: <span className="font-bold text-slate-700">+{metrics.multipleOfferHolders ?? 0} offers</span>
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Official Placement Rate</span>
              <div className="text-3xl font-extrabold text-blue-700 mt-1">{metrics.placementPercentage ?? 0}%</div>
              <p className="text-xs text-slate-500 mt-2">Institutional verified rate</p>
            </div>
          </div>

          {/* Compensation Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-slate-900 to-[#001F44] text-white p-5 rounded-xl border border-slate-700 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Average CTC Package</span>
              <div className="text-2xl font-black text-[#D4AF37] mt-1">₹{metrics.avgCtcLpa || '13.25'} LPA</div>
              <p className="text-[11px] text-slate-400 mt-1">Across all confirmed acceptances</p>
            </div>
            <div className="bg-gradient-to-br from-slate-900 to-[#001F44] text-white p-5 rounded-xl border border-slate-700 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Highest CTC Package</span>
              <div className="text-2xl font-black text-emerald-400 mt-1">₹{metrics.highestCtcLpa || '18.00'} LPA</div>
              <p className="text-[11px] text-slate-400 mt-1">Top marquee compensation</p>
            </div>
            <div className="bg-gradient-to-br from-slate-900 to-[#001F44] text-white p-5 rounded-xl border border-slate-700 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Corporate Partners</span>
              <div className="text-2xl font-black text-blue-400 mt-1">{cohortAnalytics?.counts?.companiesCount ?? 0} Companies</div>
              <p className="text-[11px] text-slate-400 mt-1">Verified campus recruiters</p>
            </div>
          </div>

          {/* Department-wise Placement Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-[#001F44]">Department & Branch Placement Breakdown</h2>
                <p className="text-xs text-slate-500 mt-0.5">Audited departmental placement metrics and placed candidate registries.</p>
              </div>
              <button
                onClick={() => handleOpenPlacedModal('ALL')}
                className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs flex items-center gap-1.5 transition self-start sm:self-auto cursor-pointer"
              >
                <span>🎓</span>
                <span>View All Placed Candidates ({metrics.uniquePlacedStudents ?? 0})</span>
              </button>
            </div>
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="p-4">Department / Discipline</th>
                    <th className="p-4 text-center">Enrolled Candidates</th>
                    <th className="p-4 text-center">Placed Students</th>
                    <th className="p-4 text-center">Gross Offers</th>
                    <th className="p-4 text-center">Placement %</th>
                    <th className="p-4 text-right">Avg CTC (LPA)</th>
                    <th className="p-4 text-center">Placed Candidates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cohortAnalytics?.departmentStats?.map(dep => {
                    const pct = dep.enrolled > 0 ? ((dep.placed / dep.enrolled) * 100).toFixed(1) : '0.0';
                    return (
                      <tr key={dep.department} className="hover:bg-slate-50">
                        <td className="p-4 font-bold text-[#001F44]">{dep.department}</td>
                        <td className="p-4 text-center font-semibold text-slate-700">{dep.enrolled}</td>
                        <td className="p-4 text-center">
                          {dep.placed > 0 ? (
                            <button
                              onClick={() => handleOpenPlacedModal(dep.department)}
                              className="font-black text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer text-sm"
                              title={`View ${dep.placed} placed students in ${dep.department}`}
                            >
                              {dep.placed}
                            </button>
                          ) : (
                            <span className="font-bold text-slate-400">0</span>
                          )}
                        </td>
                        <td className="p-4 text-center font-bold text-[#D4AF37]">{dep.total_offers}</td>
                        <td className="p-4 text-center">
                          <span className="px-2 py-1 rounded bg-blue-50 text-blue-800 font-extrabold">{pct}%</span>
                        </td>
                        <td className="p-4 text-right font-black text-slate-800">₹{dep.avg_ctc || '--'}</td>
                        <td className="p-4 text-center">
                          {dep.placed > 0 ? (
                            <button
                              onClick={() => handleOpenPlacedModal(dep.department)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 font-bold text-xs inline-flex items-center gap-1.5 transition shadow-2xs cursor-pointer hover:shadow-xs"
                              title={`View placed students in ${dep.department}`}
                            >
                              <span>👥</span>
                              <span>View Placed ({dep.placed})</span>
                            </button>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">No placements yet</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STUDENT VERIFICATION QUEUE */}
      {activeTab === 'students' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[#001F44]">Student Academic Profile Verification</h2>
              <p className="text-xs text-slate-500 mt-0.5">Audit student transcripts, verify marksheets, and grant campus drive eligibility.</p>
            </div>

            {/* Filters Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                placeholder="Search name, roll no, or email..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="text-xs p-2 rounded-lg border border-slate-300 bg-white placeholder-slate-400 font-medium w-52 focus:outline-none focus:ring-1 focus:ring-[#001F44]"
              />

              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-600">Cohort:</label>
                <select
                  value={cohortYear}
                  onChange={(e) => setCohortYear(e.target.value)}
                  className="text-xs font-semibold p-2 rounded-lg border border-slate-300 bg-white"
                >
                  <option value="ALL">All Batches</option>
                  <option value="2026">Class of 2026</option>
                  <option value="2027">Class of 2027</option>
                  <option value="2028">Class of 2028</option>
                  <option value="2029">Class of 2029</option>
                  <option value="2030">Class of 2030</option>
                  <option value="2031">Class of 2031</option>
                  <option value="2032">Class of 2032</option>
                  <option value="2033">Class of 2033</option>
                  <option value="2034">Class of 2034</option>
                  <option value="2035">Class of 2035</option>
                  <option value="2025">Class of 2025</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-600">Status:</label>
                <select
                  value={studentStatusFilter}
                  onChange={(e) => setStudentStatusFilter(e.target.value)}
                  className="text-xs font-semibold p-2 rounded-lg border border-slate-300 bg-white"
                >
                  <option value="">All Verification States</option>
                  <option value="PENDING">PENDING Verification</option>
                  <option value="VERIFIED">VERIFIED</option>
                  <option value="CORRECTION_REQUIRED">CORRECTION REQUIRED</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="p-4">Student Details ({filteredStudents.length})</th>
                    <th className="p-4">Discipline & Roll No</th>
                    <th className="p-4">CGPA / Cut-offs</th>
                    <th className="p-4">Arrears</th>
                    <th className="p-4">Verification Status</th>
                    <th className="p-4 text-right">Verification Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-xs text-slate-400">
                        No students found matching your filters (Cohort: {cohortYear}, Status: {studentStatusFilter || 'All'}).
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map(st => (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-4">
                        <div className="font-extrabold text-[#001F44] text-sm">{st.full_name}</div>
                        <div className="text-slate-500 text-[11px]">{st.email} • {st.phone}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-800">{st.department}</div>
                        <div className="text-slate-500 text-[11px] font-mono">{st.register_number} • Class of {st.graduation_year}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-black text-sm text-[#001F44]">CGPA: {Number(st.current_cgpa).toFixed(2)}</div>
                        <div className="text-slate-500 text-[11px]">10th: {st.tenth_percentage}% • 12th: {st.twelfth_percentage}%</div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-black ${
                          st.standing_arrears > 0 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {st.standing_arrears} Active
                        </span>
                        <div className="text-slate-400 text-[10px] mt-1">History: {st.history_of_arrears}</div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                          st.verification_status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' :
                          st.verification_status === 'REJECTED' ? 'bg-rose-100 text-rose-800' :
                          st.verification_status === 'CORRECTION_REQUIRED' ? 'bg-amber-100 text-amber-800' :
                          'bg-slate-100 text-slate-800'
                        }`}>
                          {st.verification_status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleInspectStudent(st.id)}
                            className="px-2.5 py-1 text-[11px] font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                          >
                            Inspect Vault
                          </button>

                          {st.verification_status !== 'VERIFIED' && (
                            <button
                              onClick={() => handleVerifyStudent(st.id, 'VERIFIED')}
                              className="px-2.5 py-1 text-[11px] font-extrabold rounded bg-emerald-600 text-white hover:bg-emerald-700"
                            >
                              Verify
                            </button>
                          )}

                          {st.verification_status !== 'CORRECTION_REQUIRED' && (
                            <button
                              onClick={() => {
                                const rem = prompt('State correction requirements for student:');
                                if (rem !== null) handleVerifyStudent(st.id, 'CORRECTION_REQUIRED', rem);
                              }}
                              className="px-2 py-1 text-[11px] font-bold rounded border border-amber-300 text-amber-800 hover:bg-amber-50"
                            >
                              Flag
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STUDENT DETAILS & DOCUMENTS MODAL */}
      {selectedStudentDetail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                  OFFICIAL VAULT INSPECTION
                </span>
                <h3 className="text-base font-extrabold text-[#001F44] mt-1">
                  {selectedStudentDetail.student.full_name} ({selectedStudentDetail.student.register_number})
                </h3>
              </div>
              <button onClick={() => setSelectedStudentDetail(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Academic Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 text-[10px]">CGPA:</span>
                  <div className="font-extrabold text-[#001F44] text-sm">{Number(selectedStudentDetail.student.current_cgpa).toFixed(2)}</div>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px]">Standing Arrears:</span>
                  <div className="mt-0.5">
                    <span className={`font-black text-xs px-2 py-0.5 rounded ${
                      selectedStudentDetail.student.standing_arrears > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {selectedStudentDetail.student.standing_arrears} Active
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px]">10th Marksheet %:</span>
                  <div className="font-bold text-slate-800 text-sm">{selectedStudentDetail.student.tenth_percentage}%</div>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px]">12th Marksheet %:</span>
                  <div className="font-bold text-slate-800 text-sm">{selectedStudentDetail.student.twelfth_percentage}%</div>
                </div>
              </div>

              {/* Uploaded Documents */}
              <div>
                <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-2">Academic Marksheets in Vault</h4>
                {selectedStudentDetail.documents?.length === 0 ? (
                  <div className="p-3 bg-slate-50 text-slate-400 text-center rounded-lg">No documents uploaded to vault yet.</div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {selectedStudentDetail.documents.map(d => (
                      <div key={d.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                        <div>
                          <div className="font-bold text-[#001F44]">{d.title}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{d.document_type} • {(d.file_size_bytes / 1024).toFixed(1)} KB</div>
                        </div>
                        <span className="text-emerald-700 bg-emerald-50 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200">
                          Vault Verified
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Verification Actions */}
              <div className="border-t border-slate-100 pt-4 flex items-center justify-end gap-2">
                <button
                  onClick={() => setSelectedStudentDetail(null)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Close
                </button>
                <button
                  onClick={() => handleVerifyStudent(selectedStudentDetail.student.id, 'VERIFIED')}
                  className="px-5 py-2 font-extrabold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Approve Student Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PLACED STUDENTS DIRECTORY MODAL */}
      <PlacedCandidatesModal
        placedModal={placedModal}
        onClose={() => setPlacedModal(null)}
      />

      {/* TAB 3: CORPORATE APPROVALS & DIRECTORY */}
      {activeTab === 'companies' && (
        <div className="space-y-6">
          {/* SECTION 1: PENDING APPROVAL QUEUE (Displayed when pending applications exist) */}
          {pendingCompanies.length > 0 && (
            <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white">
                    Action Required
                  </span>
                  <h3 className="font-extrabold text-sm text-amber-950">
                    Pending Corporate Partner Applications ({pendingCompanies.length})
                  </h3>
                </div>
                <span className="text-[11px] text-amber-800 font-medium hidden sm:inline">
                  Approve to grant campus job posting and talent evaluation rights
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingCompanies.map(comp => (
                  <div key={comp.id} className="bg-white rounded-xl border border-amber-200 p-5 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100/70 border border-amber-200 px-2 py-0.5 rounded uppercase">
                            Pending Verification
                          </span>
                          <h4 className="font-extrabold text-base text-[#001F44] mt-1">{comp.name}</h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {comp.industry || 'Enterprise'} {comp.website && (
                              <span>• <a href={comp.website.startsWith('http') ? comp.website : `https://${comp.website}`} target="_blank" rel="noreferrer" className="text-blue-600 underline font-medium">{comp.website}</a></span>
                            )}
                          </p>
                        </div>
                      </div>

                      {comp.description && (
                        <p className="text-xs text-slate-600 mt-2.5 leading-relaxed line-clamp-2">
                          {comp.description}
                        </p>
                      )}

                      <div className="mt-3.5 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700">
                        <div className="text-slate-400 text-[10px] uppercase font-bold">Designated Recruiter:</div>
                        <div className="font-bold text-[#001F44] mt-0.5">{comp.recruiter_name} {comp.designation ? `(${comp.designation})` : ''}</div>
                        <div className="text-slate-500 text-[11px] mt-0.5">{comp.recruiter_email} • {comp.phone || 'No phone'}</div>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 mt-4 pt-3 flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleApproveCompany(comp.id, 'REJECTED')}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 cursor-pointer"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleApproveCompany(comp.id, 'VERIFIED')}
                        className="px-4 py-1.5 text-xs font-extrabold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm cursor-pointer"
                      >
                        Approve Organization & Recruiter
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 2: ALL CORPORATE PARTNERS DIRECTORY TABLE */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-base text-[#001F44]">
                  Corporate Partners Directory
                </h3>
                <p className="text-xs text-slate-500">
                  Total {allCompanies.length} registered organizations • {verifiedCompaniesCount} verified & active
                </p>
              </div>

              {/* Filters Toolbar */}
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="Search company, industry, recruiter..."
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  className="text-xs p-2 rounded-lg border border-slate-300 bg-white placeholder-slate-400 font-medium w-56 focus:outline-none focus:ring-1 focus:ring-[#001F44]"
                />

                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-bold text-slate-600">Status:</label>
                  <select
                    value={companyStatusFilter}
                    onChange={(e) => setCompanyStatusFilter(e.target.value)}
                    className="text-xs font-semibold p-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="">All Statuses ({allCompanies.length})</option>
                    <option value="VERIFIED">VERIFIED ({verifiedCompaniesCount})</option>
                    <option value="PENDING">PENDING ({pendingCompanies.length})</option>
                    <option value="REJECTED">REJECTED ({allCompanies.filter(c => c.approval_status === 'REJECTED').length})</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Corporate Directory Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs min-w-[750px]">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200 text-[11px]">
                    <tr>
                      <th className="p-4">Corporate Partner Details ({filteredCompanies.length})</th>
                      <th className="p-4">Domain / Industry</th>
                      <th className="p-4">Designated Recruiter</th>
                      <th className="p-4">Campus Drives</th>
                      <th className="p-4">Approval Status</th>
                      <th className="p-4 text-right">Approval Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCompanies.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-xs text-slate-400">
                          No corporate partners found matching your search or filters.
                        </td>
                      </tr>
                    ) : (
                      filteredCompanies.map(comp => (
                        <tr key={comp.id} className="hover:bg-slate-50/80 transition">
                          <td className="p-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-[#001F44]/5 border border-slate-200 flex items-center justify-center text-base shrink-0">
                                🏢
                              </div>
                              <div>
                                <div className="font-extrabold text-[#001F44] text-sm">{comp.name}</div>
                                {comp.website ? (
                                  <a
                                    href={comp.website.startsWith('http') ? comp.website : `https://${comp.website}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-600 hover:underline text-[11px] block mt-0.5 font-medium"
                                  >
                                    {comp.website} ↗
                                  </a>
                                ) : (
                                  <span className="text-slate-400 text-[11px]">No website listed</span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="p-4">
                            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 inline-block">
                              {comp.industry || 'Technology'}
                            </span>
                            <div className="text-slate-400 text-[10px] mt-1">
                              Registered: {new Date(comp.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                          </td>

                          <td className="p-4">
                            <div className="font-bold text-slate-900">
                              {comp.recruiter_name || 'Not assigned'}
                              {comp.recruiter_designation && <span className="text-slate-500 font-normal"> ({comp.recruiter_designation})</span>}
                            </div>
                            <div className="text-slate-500 text-[11px] mt-0.5">
                              {comp.recruiter_email || 'No email'} {comp.recruiter_phone && `• ${comp.recruiter_phone}`}
                            </div>
                          </td>

                          <td className="p-4">
                            <div className="font-black text-sm text-[#001F44]">
                              {comp.active_jobs_count || 0} Published
                            </div>
                            <div className="text-slate-500 text-[10px] mt-0.5">
                              Total Postings: {comp.total_jobs_count || 0}
                            </div>
                          </td>

                          <td className="p-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider inline-flex items-center gap-1 ${
                              comp.approval_status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                              comp.approval_status === 'REJECTED' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                              'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}>
                              {comp.approval_status === 'VERIFIED' && <span>✓</span>}
                              {comp.approval_status}
                            </span>
                          </td>

                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {comp.approval_status === 'PENDING' ? (
                                <>
                                  <button
                                    onClick={() => handleApproveCompany(comp.id, 'VERIFIED')}
                                    className="px-2.5 py-1 text-[11px] font-extrabold rounded bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer shadow-xs"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleApproveCompany(comp.id, 'REJECTED')}
                                    className="px-2 py-1 text-[11px] font-bold rounded border border-rose-300 text-rose-700 hover:bg-rose-50 cursor-pointer"
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : comp.approval_status === 'VERIFIED' ? (
                                <span className="px-2.5 py-1 text-[11px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  ✓ Approved
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleApproveCompany(comp.id, 'VERIFIED')}
                                  className="px-2.5 py-1 text-[11px] font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer border border-slate-300"
                                >
                                  Re-Approve
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Footer Summary Bar */}
              <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 font-semibold">
                <div>
                  Showing {filteredCompanies.length} of {allCompanies.length} registered corporate partners
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span>Total Corporates: <strong className="text-slate-900">{allCompanies.length}</strong></span>
                  <span>•</span>
                  <span className="text-emerald-700">Approved: <strong>{verifiedCompaniesCount}</strong></span>
                  <span>•</span>
                  <span className="text-amber-700">Pending: <strong>{pendingCompanies.length}</strong></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: JOB POSTINGS OVERSIGHT */}
      {activeTab === 'jobs' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[#001F44]">Campus Job Postings Oversight</h2>
              <p className="text-xs text-slate-500 mt-0.5">Approve, audit, and monitor all corporate recruitment drives.</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
            {jobs.map(job => (
              <div key={job.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-base text-[#001F44]">{job.title}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      job.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-800' :
                      job.status === 'PENDING_APPROVAL' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {job.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Company: <span className="font-bold text-slate-800">{job.company_name}</span> • Compensation: <span className="font-bold text-[#001F44]">₹{job.salary_package_lpa} LPA</span> • Location: {job.location} ({job.work_mode})
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Application Deadline: {new Date(job.application_deadline).toLocaleDateString()} • {job.applicant_count || 0} applicants registered
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {job.status === 'PENDING_APPROVAL' && (
                    job.company_approval_status !== 'VERIFIED' ? (
                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                        <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-300 flex items-center gap-1.5 shadow-2xs">
                          <span>🔒</span>
                          <span>Corporate Approval Required</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('companies');
                            showToast(`Please approve "${job.company_name}" under CROP Approvals before approving their job postings.`, 'error');
                          }}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700 cursor-pointer shadow-sm transition"
                          title="Switch to CROP Approvals"
                        >
                          Review Company →
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleApproveJob(job.id)}
                        className="px-4 py-2 text-xs font-extrabold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm cursor-pointer"
                      >
                        Approve Drive & Publish
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: CENTRALIZED INTERVIEW CALENDAR */}
      {activeTab === 'interviews' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-[#001F44]">Campus-Wide Interview Calendar & Conflict Resolver</h2>
            <p className="text-xs text-slate-500 mt-0.5">Centralized scheduling matrix ensuring zero time clashes across multiple visiting companies.</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="p-4">Candidate</th>
                    <th className="p-4">Corporate Partner & Job</th>
                    <th className="p-4">Round / Stage</th>
                    <th className="p-4">Scheduled Slot</th>
                    <th className="p-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {interviews.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="p-4">
                        <div className="font-bold text-[#001F44]">{inv.student_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{inv.register_number} • {inv.department}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-800">{inv.company_name}</div>
                        <div className="text-[11px] text-slate-500">{inv.job_title}</div>
                      </td>
                      <td className="p-4 font-semibold text-slate-700">{inv.stage_name}</td>
                      <td className="p-4">
                        <div className="font-bold text-blue-700">{new Date(inv.scheduled_start).toLocaleString()}</div>
                        <div className="text-[11px] text-slate-400">to {new Date(inv.scheduled_end).toLocaleTimeString()}</div>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: IMMUTABLE AUDIT TRAIL - Temporarily commented out as requested */}
      {/*
      activeTab === 'audit' && (
        <div className="space-y-6">
          <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <h2 className="text-base font-extrabold tracking-wide">Append-Only System Audit Trail</h2>
            </div>
            <p className="text-slate-400 text-xs mt-1">
              Cryptographically timestamped, immutable system events record all state machine transitions, cut-off evaluations, and verification actions.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm font-mono text-[11px]">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left min-w-[700px]">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200 text-[10px]">
                  <tr>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Actor</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Entity</th>
                    <th className="p-3">Previous State → New State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/80">
                      <td className="p-3 text-slate-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="p-3 text-slate-700">
                        {log.actor_email ? log.actor_email.split('@')[0] : 'System'} ({log.actor_role || 'ROOT'})
                      </td>
                      <td className="p-3">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[#001F44] font-bold">
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500">{log.entity_name}</td>
                      <td className="p-3 text-slate-600 truncate max-w-xs" title={JSON.stringify(log.new_state)}>
                        {log.new_state ? JSON.stringify(log.new_state) : 'Initial Commit'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )
      */}
    </div>
  );
};

export default AdminPortal;
