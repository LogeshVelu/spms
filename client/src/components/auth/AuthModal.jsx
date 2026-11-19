import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

const initialStudentState = {
  email: '',
  password: '',
  fullName: '',
  registerNumber: '',
  phone: '',
  degree: 'B.Tech',
  department: '',
  specialization: '',
  graduationYear: 2026,
  currentYear: '',
  completedSemesters: '',
  currentCgpa: '',
  standingArrears: '0',
  tenthPercentage: '',
  twelfthPercentage: ''
};

const initialRecruiterState = {
  email: '',
  password: '',
  fullName: '',
  phone: '',
  designation: '',
  companyName: '',
  website: '',
  industry: 'Enterprise Technology',
  description: ''
};

export const calculateGraduationYear = (yr, degree = 'B.Tech') => {
  if (!yr) return 2026;
  const totalYears = (degree === 'M.Tech' || degree === 'MCA') ? 2 : (degree === 'Dual Degree' ? 5 : 4);
  const baseYear = 2026;
  return baseYear + Math.max(0, totalYears - parseInt(yr, 10));
};

export const AuthModal = ({ isOpen, onClose, onAuthSuccess, targetRole = null }) => {
  const [mode, setMode] = useState('login'); // 'login' | 'register_student' | 'register_recruiter'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [regSuccess, setRegSuccess] = useState(null); // { role, name, email, message }

  // Form states
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [studentForm, setStudentForm] = useState(initialStudentState);
  const [recruiterForm, setRecruiterForm] = useState(initialRecruiterState);

  // Auto-switch to login mode after successful registration
  useEffect(() => {
    if (!regSuccess) return;
    const timer = setTimeout(() => {
      setMode('login');
      setRegSuccess(null);
    }, 12000);
    return () => clearTimeout(timer);
  }, [regSuccess]);

  // Reset all forms whenever modal opens or closes or targetRole changes
  useEffect(() => {
    if (isOpen) {
      setMode('login');
      resetAllForms();
    }
  }, [isOpen, targetRole]);

  const resetAllForms = () => {
    setLoginEmail('');
    setLoginPassword('');
    setStudentForm({ ...initialStudentState });
    setRecruiterForm({ ...initialRecruiterState });
    setError(null);
    setRegSuccess(null);
  };

  const handleClose = () => {
    resetAllForms();
    onClose();
  };

  // Strict CGPA change handler: numbers and decimal only, cannot exceed 10.00
  const handleCgpaChange = (e) => {
    const val = e.target.value.trim();
    if (val === '') {
      setStudentForm(prev => ({ ...prev, currentCgpa: '' }));
      return;
    }
    // Only allow numbers and at most one decimal point (up to 2 decimal places)
    if (!/^\d*\.?\d{0,2}$/.test(val)) {
      return; // ignores alphabets, special characters, extra dots
    }
    const num = parseFloat(val);
    if (!isNaN(num) && num > 10) {
      return; // strictly prevents typing numbers > 10
    }
    setStudentForm(prev => ({ ...prev, currentCgpa: val }));
  };

  // Register number change handler: alphanumeric only, automatically uppercase
  const handleRegisterNumberChange = (e) => {
    const clean = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    setStudentForm(prev => ({ ...prev, registerNumber: clean }));
  };

  // Phone number change handler: digits only, max 10 digits
  const handlePhoneChange = (e) => {
    const clean = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
    setStudentForm(prev => ({ ...prev, phone: clean }));
  };

  const handleRecruiterPhoneChange = (e) => {
    const clean = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
    setRecruiterForm(prev => ({ ...prev, phone: clean }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(loginEmail, loginPassword);
      resetAllForms();
      onAuthSuccess(res.data);
      onClose();
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterStudent = async (e) => {
    e.preventDefault();
    setError(null);

    // Validation 1: Full Name
    if (!studentForm.fullName.trim() || studentForm.fullName.trim().length < 2) {
      setError('Please enter your full legal name.');
      return;
    }

    // Validation 2: Register Number
    if (!studentForm.registerNumber.trim() || studentForm.registerNumber.trim().length < 5) {
      setError('Please enter a valid Register Number (e.g. 2022CS1042, minimum 5 characters).');
      return;
    }

    // Validation 3: Email Address
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(studentForm.email.trim())) {
      setError('Please enter a valid email address (e.g. student@college.edu).');
      return;
    }

    // Validation 4: Password
    if (!studentForm.password || studentForm.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    // Validation 5: Phone Number
    if (!studentForm.phone || studentForm.phone.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    // Validation 6: Department
    if (!studentForm.department.trim()) {
      setError('Please enter your Department (e.g. Computer Science and Engineering).');
      return;
    }

    // Validation 7: Year of Study & Completed Semester
    if (!studentForm.currentYear) {
      setError('Please select your Current Year of Study.');
      return;
    }
    if (!studentForm.completedSemesters) {
      setError('Please select your Completed Semester.');
      return;
    }

    // Validation 8: Current CGPA
    if (studentForm.currentCgpa === '') {
      setError('Please enter your Current CGPA (between 0.00 and 10.00).');
      return;
    }
    const cgpaVal = parseFloat(studentForm.currentCgpa);
    if (isNaN(cgpaVal) || cgpaVal < 0 || cgpaVal > 10) {
      setError('CGPA must be a valid number between 0.00 and 10.00.');
      return;
    }

    setLoading(true);
    try {
      const arrearsVal = Math.max(0, parseInt(studentForm.standingArrears || '0', 10));
      const registeredEmail = studentForm.email.trim();
      const registeredName = studentForm.fullName.trim();
      await api.registerStudent({
        ...studentForm,
        email: registeredEmail,
        fullName: registeredName,
        registerNumber: studentForm.registerNumber.trim().toUpperCase(),
        department: studentForm.department.trim(),
        currentYear: parseInt(studentForm.currentYear, 10),
        completedSemesters: parseInt(studentForm.completedSemesters, 10),
        currentCgpa: cgpaVal,
        standingArrears: arrearsVal,
        historyOfArrears: arrearsVal
      });
      setStudentForm({ ...initialStudentState });
      setLoginEmail(registeredEmail);
      setRegSuccess({
        role: 'STUDENT',
        name: registeredName,
        email: registeredEmail,
        message: 'Successfully registered student profile! Please sign in with your credentials to access your student portal.'
      });
    } catch (err) {
      setError(err.message || 'Student registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterRecruiter = async (e) => {
    e.preventDefault();
    setError(null);

    if (!recruiterForm.companyName.trim()) {
      setError('Please enter your company or organization name.');
      return;
    }
    if (!recruiterForm.fullName.trim()) {
      setError('Please enter recruiter full name.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recruiterForm.email.trim())) {
      setError('Please enter a valid corporate email address.');
      return;
    }
    if (!recruiterForm.password || recruiterForm.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const registeredEmail = recruiterForm.email.trim();
      const registeredCompany = recruiterForm.companyName.trim();
      await api.registerRecruiter(recruiterForm);
      setRecruiterForm({ ...initialRecruiterState });
      setLoginEmail(registeredEmail);
      setRegSuccess({
        role: 'RECRUITER',
        name: registeredCompany,
        email: registeredEmail,
        message: 'Successfully registered corporate partner account! Please sign in to access your recruitment portal once verified by the Placement Office.'
      });
    } catch (err) {
      setError(err.message || 'Recruiter registration failed.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="text-lg font-extrabold text-[#001F44]">
              {targetRole === 'STUDENT'
                ? (mode === 'login' ? 'Student Sign In' : 'Student Registration')
                : targetRole === 'RECRUITER'
                ? (mode === 'login' ? 'Corporate Recruiter Sign In' : 'Recruiter Partner Onboarding')
                : targetRole === 'ADMIN'
                ? 'Placement Admin Sign In'
                : (mode === 'login' ? 'Authentication Gateway' : mode === 'register_student' ? 'Student Registration' : 'Recruiter Partner Onboarding')}
            </h3>
            <p className="text-xs text-slate-500">
              {targetRole === 'STUDENT'
                ? 'IIT Madras Student Placement Portal'
                : targetRole === 'RECRUITER'
                ? 'Corporate Hiring & Recruitment Partner Portal'
                : targetRole === 'ADMIN'
                ? 'Directorate of Placement & Training Administration'
                : 'Secure Role-Based Access Control (RBAC)'}
            </p>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
        </div>

        {/* REGISTRATION SUCCESS STATE OR AUTH FORMS */}
        {regSuccess ? (
          <div className="py-8 px-3 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto shadow-sm">
              🎉
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full border border-emerald-300">
                REGISTRATION SUCCESSFUL
              </span>
              <h3 className="text-xl font-extrabold text-[#001F44] mt-3">
                Super! Successfully Registered
              </h3>
              <p className="text-xs text-slate-600 mt-2 font-medium max-w-sm mx-auto leading-relaxed">
                {regSuccess.message}
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mt-4 text-xs font-mono text-slate-700 max-w-sm mx-auto">
                Registered Account: <strong className="text-[#001F44]">{regSuccess.email}</strong>
              </div>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setRegSuccess(null);
                }}
                className="w-full sm:w-auto px-7 py-2.5 rounded-lg bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] font-extrabold text-xs shadow-md cursor-pointer transition flex items-center justify-center gap-2"
              >
                <span>🔑</span>
                <span>Proceed to Sign In</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Navigating to Sign In screen automatically in a moment...
            </p>
          </div>
        ) : (
          <>
            {/* Mode Selector Tabs (Hidden for ADMIN since only Sign In applies) */}
            {targetRole !== 'ADMIN' && (
              <div className="flex rounded-lg bg-slate-100 p-1 mb-4 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); }}
                  className={`flex-1 py-1.5 rounded-md transition ${mode === 'login' ? 'bg-[#001F44] text-[#D4AF37] shadow' : 'text-slate-600'}`}
                >
                  Sign In
                </button>
                {(!targetRole || targetRole === 'STUDENT') && (
                  <button
                    type="button"
                    onClick={() => { setMode('register_student'); setError(null); }}
                    className={`flex-1 py-1.5 rounded-md transition ${mode === 'register_student' ? 'bg-[#001F44] text-[#D4AF37] shadow' : 'text-slate-600'}`}
                  >
                    Student Register
                  </button>
                )}
                {(!targetRole || targetRole === 'RECRUITER') && (
                  <button
                    type="button"
                    onClick={() => { setMode('register_recruiter'); setError(null); }}
                    className={`flex-1 py-1.5 rounded-md transition ${mode === 'register_recruiter' ? 'bg-[#001F44] text-[#D4AF37] shadow' : 'text-slate-600'}`}
                  >
                    Recruiter Onboard
                  </button>
                )}
              </div>
            )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* 1. LOGIN FORM */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {targetRole === 'STUDENT' ? 'Email or Roll / Register Number:' : 'Email Address:'}
              </label>
              <input
                type="text"
                required
                placeholder={
                  targetRole === 'STUDENT'
                    ? "Enter email or Roll No (e.g. 2022CS1042 / priya.cse@college.edu)"
                    : targetRole === 'RECRUITER'
                    ? "e.g. recruiter@zoho.com or corporate email"
                    : targetRole === 'ADMIN'
                    ? "e.g. admin@college.edu"
                    : "Enter email or Roll No (e.g. 2022CS1042)"
                }
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 font-medium focus:ring-2 focus:ring-[#001F44] focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Password:</label>
              <input
                type="password"
                required
                placeholder="Enter password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 font-medium focus:ring-2 focus:ring-[#001F44] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg font-extrabold bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] transition shadow-md"
            >
              {loading ? 'Authenticating...' : 'Sign In to Portal'}
            </button>
          </form>
        )}

        {/* 2. STUDENT REGISTRATION FORM */}
        {mode === 'register_student' && (
          <form onSubmit={handleRegisterStudent} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Full Legal Name:</label>
                <input
                  type="text"
                  required
                  value={studentForm.fullName}
                  onChange={(e) => setStudentForm({ ...studentForm, fullName: e.target.value })}
                  placeholder="e.g. Ramesh S"
                  className="w-full p-2 rounded border border-slate-300 focus:ring-2 focus:ring-[#001F44] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Roll / Register No:</label>
                <input
                  type="text"
                  required
                  value={studentForm.registerNumber}
                  onChange={handleRegisterNumberChange}
                  placeholder="e.g. 2022CS2040"
                  className="w-full p-2 rounded border border-slate-300 font-mono uppercase focus:ring-2 focus:ring-[#001F44] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Email Address:</label>
                <input
                  type="email"
                  required
                  value={studentForm.email}
                  onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })}
                  placeholder="e.g. student@college.edu"
                  className="w-full p-2 rounded border border-slate-300 focus:ring-2 focus:ring-[#001F44] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Password:</label>
                <input
                  type="password"
                  required
                  value={studentForm.password}
                  onChange={(e) => setStudentForm({ ...studentForm, password: e.target.value })}
                  placeholder="Min 6 characters"
                  className="w-full p-2 rounded border border-slate-300 focus:ring-2 focus:ring-[#001F44] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Mobile Phone (10 digits):</label>
                <input
                  type="tel"
                  required
                  maxLength="10"
                  value={studentForm.phone}
                  onChange={handlePhoneChange}
                  placeholder="e.g. 9840123456"
                  className="w-full p-2 rounded border border-slate-300 focus:ring-2 focus:ring-[#001F44] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Department / Branch:</label>
                <input
                  type="text"
                  required
                  value={studentForm.department}
                  onChange={(e) => setStudentForm({ ...studentForm, department: e.target.value })}
                  placeholder="e.g. Computer Science and Engineering"
                  className="w-full p-2 rounded border border-slate-300 focus:ring-2 focus:ring-[#001F44] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Current CGPA (0-10):</label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={studentForm.currentCgpa}
                  onChange={handleCgpaChange}
                  placeholder="e.g. 8.50"
                  className="w-full p-2 rounded border border-slate-300 font-bold text-[#001F44] focus:ring-2 focus:ring-[#001F44] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Standing (Active) Arrears:</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  required
                  value={studentForm.standingArrears}
                  onChange={(e) => {
                    const clean = Math.max(0, parseInt(e.target.value || '0', 10));
                    setStudentForm(prev => ({ ...prev, standingArrears: String(clean) }));
                  }}
                  placeholder="0 (None)"
                  className="w-full p-2 rounded border border-slate-300 font-bold text-[#001F44] focus:ring-2 focus:ring-[#001F44] focus:outline-none"
                />
              </div>
            </div>

            {/* Year of Study & Completed Semesters */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Year of Study: *
                </label>
                <select
                  value={studentForm.currentYear}
                  onChange={(e) => {
                    const yr = e.target.value ? parseInt(e.target.value, 10) : '';
                    const autoGradYear = calculateGraduationYear(yr, studentForm.degree);
                    // Dynamically set default completed semester for that specific year:
                    const defaultSem = yr === 1 ? 1 : yr === 2 ? 3 : yr === 3 ? 5 : yr === 4 ? 7 : '';
                    setStudentForm(prev => ({
                      ...prev,
                      currentYear: yr,
                      completedSemesters: defaultSem,
                      graduationYear: autoGradYear
                    }));
                  }}
                  required
                  className="w-full p-2 rounded border border-slate-300 bg-white font-medium text-slate-800"
                >
                  <option value="">Select Year of Study</option>
                  <option value={1}>1st Year (Semester 1 & 2)</option>
                  <option value={2}>2nd Year (Semester 3 & 4)</option>
                  <option value={3}>3rd Year (Semester 5 & 6)</option>
                  <option value={4}>4th Year (Semester 7 & 8)</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Completed Semester: *
                </label>
                <select
                  value={studentForm.completedSemesters}
                  onChange={(e) => {
                    const sem = e.target.value ? parseInt(e.target.value, 10) : '';
                    setStudentForm(prev => ({ ...prev, completedSemesters: sem }));
                  }}
                  disabled={!studentForm.currentYear}
                  required
                  className="w-full p-2 rounded border border-slate-300 bg-white font-medium text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">
                    {!studentForm.currentYear ? 'Select Year First' : 'Select Semester'}
                  </option>
                  {studentForm.currentYear === 1 && (
                    <>
                      <option value={1}>Semester 1</option>
                      <option value={2}>Semester 2</option>
                    </>
                  )}
                  {studentForm.currentYear === 2 && (
                    <>
                      <option value={3}>Semester 3</option>
                      <option value={4}>Semester 4</option>
                    </>
                  )}
                  {studentForm.currentYear === 3 && (
                    <>
                      <option value={5}>Semester 5</option>
                      <option value={6}>Semester 6</option>
                    </>
                  )}
                  {studentForm.currentYear === 4 && (
                    <>
                      <option value={7}>Semester 7</option>
                      <option value={8}>Semester 8</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* Degree Program & Graduation Year (Next 10 years available) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Degree Program:</label>
                <select
                  value={studentForm.degree}
                  onChange={(e) => {
                    const deg = e.target.value;
                    const autoGradYear = calculateGraduationYear(studentForm.currentYear, deg);
                    setStudentForm(prev => ({
                      ...prev,
                      degree: deg,
                      graduationYear: autoGradYear
                    }));
                  }}
                  className="w-full p-2 rounded border border-slate-300 bg-white font-medium"
                >
                  <option value="B.Tech">B.Tech (4 Years)</option>
                  <option value="M.Tech">M.Tech (2 Years)</option>
                  <option value="MCA">MCA (2 Years)</option>
                  <option value="Dual Degree">Dual Degree (5 Years)</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Graduation Year:
                </label>
                <select
                  value={studentForm.graduationYear}
                  onChange={(e) => setStudentForm({ ...studentForm, graduationYear: parseInt(e.target.value, 10) })}
                  className="w-full p-2 rounded border border-slate-300 bg-white font-bold text-[#001F44]"
                >
                  <option value={2026}>2026 (Batch of 2026)</option>
                  <option value={2027}>2027 (Batch of 2027)</option>
                  <option value={2028}>2028 (Batch of 2028)</option>
                  <option value={2029}>2029 (Batch of 2029)</option>
                  <option value={2030}>2030 (Batch of 2030)</option>
                  <option value={2031}>2031 (Batch of 2031)</option>
                  <option value={2032}>2032 (Batch of 2032)</option>
                  <option value={2033}>2033 (Batch of 2033)</option>
                  <option value={2034}>2034 (Batch of 2034)</option>
                  <option value={2035}>2035 (Batch of 2035)</option>
                  <option value={2025}>2025 (Batch of 2025)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Specialization / Domain Focus:
              </label>
              <input
                type="text"
                value={studentForm.specialization}
                onChange={(e) => setStudentForm({ ...studentForm, specialization: e.target.value })}
                placeholder="e.g. Avionics, Aerodynamics, Artificial Intelligence, Power Systems"
                className="w-full p-2 rounded border border-slate-300 font-medium focus:ring-2 focus:ring-[#001F44] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-extrabold bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] shadow-md mt-2"
            >
              {loading ? 'Submitting Registration...' : 'Complete Registration'}
            </button>
          </form>
        )}

        {/* 3. RECRUITER ONBOARDING FORM */}
        {mode === 'register_recruiter' && (
          <form onSubmit={handleRegisterRecruiter} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Company / Organization Name:</label>
              <input
                type="text"
                required
                placeholder="e.g. Acme Tech Solutions"
                value={recruiterForm.companyName}
                onChange={(e) => setRecruiterForm({ ...recruiterForm, companyName: e.target.value })}
                className="w-full p-2 rounded border border-slate-300 font-bold focus:ring-2 focus:ring-[#001F44] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Recruiter Full Name:</label>
                <input
                  type="text"
                  required
                  value={recruiterForm.fullName}
                  onChange={(e) => setRecruiterForm({ ...recruiterForm, fullName: e.target.value })}
                  placeholder="e.g. Ananya Roy"
                  className="w-full p-2 rounded border border-slate-300 focus:ring-2 focus:ring-[#001F44] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Corporate Email:</label>
                <input
                  type="email"
                  required
                  value={recruiterForm.email}
                  onChange={(e) => setRecruiterForm({ ...recruiterForm, email: e.target.value })}
                  placeholder="e.g. hr@company.com"
                  className="w-full p-2 rounded border border-slate-300 focus:ring-2 focus:ring-[#001F44] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Password:</label>
                <input
                  type="password"
                  required
                  value={recruiterForm.password}
                  onChange={(e) => setRecruiterForm({ ...recruiterForm, password: e.target.value })}
                  placeholder="Min 6 characters"
                  className="w-full p-2 rounded border border-slate-300 focus:ring-2 focus:ring-[#001F44] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Mobile Phone (10 digits):</label>
                <input
                  type="tel"
                  maxLength="10"
                  value={recruiterForm.phone}
                  onChange={handleRecruiterPhoneChange}
                  placeholder="e.g. 9930488219"
                  className="w-full p-2 rounded border border-slate-300 focus:ring-2 focus:ring-[#001F44] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Company Website:</label>
              <input
                type="url"
                placeholder="https://example.com"
                value={recruiterForm.website}
                onChange={(e) => setRecruiterForm({ ...recruiterForm, website: e.target.value })}
                className="w-full p-2 rounded border border-slate-300 focus:ring-2 focus:ring-[#001F44] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-extrabold bg-[#001F44] text-[#D4AF37] hover:bg-[#032D5B] shadow-md mt-2"
            >
              {loading ? 'Submitting Application...' : 'Submit Corporate Onboarding'}
            </button>
          </form>
        )}
      </>
    )}
  </div>
</div>
  );
};

export default AuthModal;
