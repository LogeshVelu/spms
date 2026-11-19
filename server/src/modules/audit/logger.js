import { db } from '../../database/db.js';
import { generateUuid } from '../../utils/security.js';

export function logAudit({ actorId = null, entityName, entityId, action, previousState = null, newState = null, ipAddress = null }) {
  try {
    const id = generateUuid();
    // Validate actor exists if provided to satisfy FK
    let validActorId = null;
    if (actorId) {
      const u = db.get(`SELECT id FROM users WHERE id = ?`, [actorId]);
      if (u) validActorId = u.id;
    }

    db.run(
      `INSERT INTO audit_logs (id, actor_id, entity_name, entity_id, action, previous_state, new_state, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        id,
        validActorId,
        entityName,
        entityId,
        action,
        previousState ? (typeof previousState === 'string' ? previousState : JSON.stringify(previousState)) : null,
        newState ? (typeof newState === 'string' ? newState : JSON.stringify(newState)) : null,
        ipAddress
      ]
    );
  } catch (err) {
    console.error('[Audit Log Error]', err.message);
  }
}

export function sendNotification({ userId, title, message }) {
  try {
    const id = generateUuid();
    db.run(
      `INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, datetime('now'))`,
      [id, userId, title, message]
    );
  } catch (err) {
    console.error('[Notification Error]', err.message);
  }
}
