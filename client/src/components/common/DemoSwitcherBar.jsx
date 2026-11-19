import React, { useState } from 'react';

export const DemoSwitcherBar = ({ activeEmail, onSwitch, onOpenAuthModal }) => {
  const [copiedEmail, setCopiedEmail] = useState(null);

  const accounts = [
    {
      role: 'ADMIN',
      label: 'Admin',
      name: 'Directorate Admin',
      email: 'admin@college.edu',
      sub: 'Cohort Analytics & Audit',
      color: 'bg-purple-900/90 text-purple-200 border-purple-500/40 hover:bg-purple-800'
    },
    {
      role: 'RECRUITER',
      label: 'Recruiter',
      name: 'Zoho Corporation',
      email: 'recruiter@zoho.com',
      sub: 'Approved & Active',
      color: 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40 hover:bg-emerald-900'
    },
    {
      role: 'RECRUITER',
      label: 'Recruiter (Pending)',
      name: 'Cloudscale Systems',
      email: 'hr@cloudscale.io',
      sub: 'Edge Case: Pending Review',
      color: 'bg-amber-950/90 text-amber-200 border-amber-500/40 hover:bg-amber-900'
    },
    {
      role: 'STUDENT',
      label: 'Student 1',
      name: 'Priya Sharma (CSE)',
      email: 'priya.cse@college.edu',
      sub: 'CGPA 9.10 • Fully Eligible',
      color: 'bg-blue-950/90 text-blue-200 border-blue-500/40 hover:bg-blue-900'
    },
    {
      role: 'STUDENT',
      label: 'Student 2',
      name: 'Rajesh Kumar (ECE)',
      email: 'rajesh.ece@college.edu',
      sub: 'CGPA 6.80 • Cut-off Blocker',
      color: 'bg-rose-950/90 text-rose-200 border-rose-500/40 hover:bg-rose-900'
    },
    {
      role: 'STUDENT',
      label: 'Student 3',
      name: 'Dinesh M (MECH)',
      email: 'dinesh.mech@college.edu',
      sub: 'Unverified Profile Blocker',
      color: 'bg-slate-800/90 text-slate-200 border-slate-600/40 hover:bg-slate-700'
    }
  ];

  const handleCopy = (email) => {
    navigator.clipboard?.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  return (
    <div className="bg-[#00142D] border-b border-[#001F44] text-xs py-2 px-4 shadow-inner">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-[#D4AF37] animate-pulse"></span>
          <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
            1-Click Demo Accounts:
          </span>
          <span className="text-[11px] text-slate-400 hidden md:inline">
            (Password: <code className="bg-slate-900 px-1 py-0.5 rounded text-[#D4AF37] font-mono">DemoPassword123!</code>)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto py-0.5">
          {accounts.map((acc) => {
            const isActive = activeEmail === acc.email;
            return (
              <button
                key={acc.email}
                onClick={() => onSwitch(acc.email)}
                title={`Switch to ${acc.name} (${acc.email})`}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'ring-2 ring-[#D4AF37] bg-[#D4AF37] text-[#001F44] border-transparent font-bold shadow-md'
                    : acc.color
                }`}
              >
                <span>{acc.label}:</span>
                <span className="truncate max-w-[110px]">{acc.name}</span>
                {isActive && <span className="text-[10px] bg-[#001F44] text-white px-1 rounded">Active</span>}
              </button>
            );
          })}

          <button
            onClick={onOpenAuthModal}
            className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600 ml-1"
          >
            Manual Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default DemoSwitcherBar;
