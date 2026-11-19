import express from 'express';
import { db } from '../../database/db.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, (req, res) => {
  const notifications = db.all(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 50`,
    [req.user.id]
  );
  return res.json({ success: true, data: notifications });
});

router.put('/:id/read', authenticateToken, (req, res) => {
  db.run(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
  return res.json({ success: true, message: 'Notification marked as read.' });
});

router.put('/read-all', authenticateToken, (req, res) => {
  db.run(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`, [req.user.id]);
  return res.json({ success: true, message: 'All notifications marked as read.' });
});

export default router;
