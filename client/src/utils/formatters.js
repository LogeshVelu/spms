/**
 * Formatting and Utility Helpers
 * Shared across Student, Recruiter, and Admin portals.
 */

/**
 * Checks whether an application or job deadline has passed.
 * Supports date strings (e.g. 'YYYY-MM-DD') by setting end of day.
 * 
 * @param {string|Date} deadlineStr 
 * @returns {boolean}
 */
export const checkDeadlineExceeded = (deadlineStr) => {
  if (!deadlineStr) return false;
  const deadline = new Date(deadlineStr);
  if (typeof deadlineStr === 'string' && deadlineStr.trim().length <= 10) {
    deadline.setHours(23, 59, 59, 999);
  }
  return new Date() > deadline;
};

/**
 * Calculates authoritative formal joining date for candidate offer letters.
 * Formula: 1st of the month ~2-3 months ahead from issuance date.
 * 
 * @param {string|Date} createdAt 
 * @returns {string} Formatted joining date (e.g., 'January 1, 2027')
 */
export const calculateJoiningDate = (createdAt) => {
  const base = createdAt ? new Date(createdAt) : new Date();
  if (isNaN(base.getTime())) return 'January 1, 2027';
  const d = new Date(base.getFullYear(), base.getMonth() + 3, 1);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
};

/**
 * Converts ISO date strings to datetime-local input value format (YYYY-MM-DDTHH:mm).
 * 
 * @param {string|Date} isoString 
 * @returns {string}
 */
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

/**
 * Determines applicant stage progression, scheduled status, and permitted recruiter actions.
 * 
 * @param {Object} app Applicant object
 * @param {Array} allStages Defined job stages
 * @returns {Object} Stage progression state and permission flags
 */
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

/**
 * Formats a currency amount into Indian Lakhs (LPA) or Rupees.
 * 
 * @param {number|string} amount 
 * @returns {string} e.g. "₹12.50 LPA" or "₹1,200,000"
 */
export const formatLPA = (amount) => {
  if (amount === undefined || amount === null) return 'N/A';
  const num = Number(amount);
  if (isNaN(num)) return String(amount);
  return `₹${num.toLocaleString('en-IN')} LPA`;
};
