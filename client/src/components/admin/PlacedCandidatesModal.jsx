import React, { useState } from 'react';

/**
 * PlacedCandidatesModal
 * Renders the verified list of placed candidates for Super Admin analytics review,
 * either college-wide or filtered by department.
 */
export const PlacedCandidatesModal = ({ placedModal, onClose }) => {
  const [placedSearch, setPlacedSearch] = useState('');

  if (!placedModal) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 relative max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300">
              INSTITUTIONAL PLACEMENT AUDIT
            </span>
            <h3 className="text-base font-extrabold text-[#001F44] mt-1 flex items-center gap-2">
              <span>🎓</span>
              <span>
                Placed Students Directory: {placedModal.department === 'ALL' ? 'Entire College (All Departments)' : placedModal.department}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Audited campus recruitment registry showing student details and hiring companies.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg text-lg font-bold self-end sm:self-auto cursor-pointer"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Search & Quick Filter Bar */}
        <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={placedSearch}
              onChange={(e) => setPlacedSearch(e.target.value)}
              placeholder="Search by student name, roll number, or company..."
              className="text-xs p-2.5 rounded-lg border border-slate-300 bg-white placeholder-slate-400 font-medium w-full max-w-md focus:outline-none focus:ring-1 focus:ring-[#001F44]"
            />
            {placedSearch && (
              <button
                onClick={() => setPlacedSearch('')}
                className="text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <div className="text-xs text-slate-600 font-semibold flex items-center gap-2 self-start sm:self-auto">
            <span>Placed Count:</span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs border border-emerald-200">
              {placedModal.list.length} Students
            </span>
          </div>
        </div>

        {/* Modal Body / Table */}
        <div className="overflow-y-auto flex-1 py-2">
          {placedModal.loading ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Loading placed student records...
            </div>
          ) : (() => {
            const filtered = placedModal.list.filter(st => {
              if (!placedSearch.trim()) return true;
              const term = placedSearch.toLowerCase();
              return (
                (st.student_name && st.student_name.toLowerCase().includes(term)) ||
                (st.register_number && st.register_number.toLowerCase().includes(term)) ||
                (st.company_name && st.company_name.toLowerCase().includes(term)) ||
                (st.department && st.department.toLowerCase().includes(term)) ||
                (st.job_title && st.job_title.toLowerCase().includes(term))
              );
            });

            if (filtered.length === 0) {
              return (
                <div className="py-12 text-center text-slate-400 text-xs">
                  {placedSearch ? 'No matching placed candidates found for your search query.' : 'No placed candidates recorded for this department yet.'}
                </div>
              );
            }

            return (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs min-w-[650px]">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-3">Student Candidate</th>
                      <th className="p-3">Department & Batch</th>
                      <th className="p-3">Hiring Company Entity</th>
                      <th className="p-3">Offered Role / Designation</th>
                      <th className="p-3 text-right">Placement Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(st => (
                      <tr key={`${st.student_id}-${st.offer_id}`} className="hover:bg-slate-50/80 transition">
                        <td className="p-3">
                          <div className="font-extrabold text-[#001F44] text-xs">{st.student_name}</div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {st.register_number} • {st.student_email}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{st.department}</div>
                          <div className="text-[11px] text-slate-500">
                            {st.degree} • Class of {st.graduation_year}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded bg-blue-50 text-blue-700 flex items-center justify-center text-xs font-black border border-blue-100">
                              🏢
                            </span>
                            <span className="font-black text-slate-900 text-xs">{st.company_name}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{st.job_title}</div>
                          {st.ctc_amount && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Package: <span className="text-slate-600 font-semibold">₹{st.ctc_amount} LPA</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <span className="px-2.5 py-1 text-[10px] font-black uppercase rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1 shadow-2xs">
                            <span>✓</span>
                            <span>Placed</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>

        {/* Modal Footer */}
        <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            Placement Directorate • Master Placed Student Registry
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlacedCandidatesModal;
