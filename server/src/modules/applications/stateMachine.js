import { db } from '../../database/db.js';
import { logAudit } from '../audit/logger.js';

/**
 * Authoritative Recruitment Progression State Machine
 * Implements Section 3.2 of SPMS Engineering Specification v4.0.
 */
export class ApplicationStateMachine {
  static validTransitions = {
    APPLIED: ['IN_PROGRESS', 'REJECTED', 'WITHDRAWN'],
    IN_PROGRESS: ['OFFERED', 'REJECTED'],
    OFFERED: ['ACCEPTED', 'DECLINED', 'REVOKED'],
    ACCEPTED: [],
    DECLINED: [],
    REJECTED: [],
    WITHDRAWN: []
  };

  /**
   * Executes an atomic state transition on an application
   */
  static transition({ applicationId, newStatus, actorId, notes, ipAddress }) {
    return db.transaction(() => {
      const current = db.get(`SELECT id, status, job_id, student_id FROM applications WHERE id = ?`, [applicationId]);
      if (!current) {
        throw new Error('APPLICATION_NOT_FOUND');
      }

      const currentStatus = current.status;
      const allowed = this.validTransitions[currentStatus] || [];

      if (!allowed.includes(newStatus)) {
        throw new Error(`INVALID_STATE_TRANSITION: Cannot transition application from '${currentStatus}' to '${newStatus}'`);
      }

      // Update application status
      db.run(
        `UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?`,
        [newStatus, applicationId]
      );

      // Record in immutable audit log
      logAudit({
        actorId,
        entityName: 'applications',
        entityId: applicationId,
        action: 'STATUS_TRANSITION',
        previousState: { status: currentStatus },
        newState: { status: newStatus, notes },
        ipAddress
      });

      return {
        applicationId,
        previousStatus: currentStatus,
        newStatus,
        updatedAt: new Date().toISOString()
      };
    });
  }
}
