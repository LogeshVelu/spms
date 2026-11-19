import express from 'express';
import { db } from '../../database/db.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/v1/audit/logs
 * Read-only append logs for Admin audit compliance
 */
router.get('/logs', authenticateToken, requireRole('ADMIN'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 200);
  const entity = req.query.entity || null;

  let sql = `
    SELECT a.*, u.email as actor_email, u.role as actor_role
    FROM audit_logs a
    LEFT JOIN users u ON a.actor_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (entity) {
    sql += ` AND a.entity_name = ?`;
    params.push(entity);
  }

  sql += ` ORDER BY a.created_at DESC LIMIT ?`;
  params.push(limit);

  const logs = db.all(sql, params);

  const parsed = logs.map(l => ({
    ...l,
    previous_state: l.previous_state ? JSON.parse(l.previous_state) : null,
    new_state: l.new_state ? JSON.parse(l.new_state) : null
  }));

  return res.json({ success: true, data: parsed });
});

export default router;
