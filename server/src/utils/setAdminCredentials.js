import { hashPassword } from './security.js';
import { pool } from '../database/postgres.js';

const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.log('Usage: node server/src/utils/setAdminCredentials.js <admin_email> <new_password>');
  console.log('Example: node server/src/utils/setAdminCredentials.js admin@iitm.ac.in Admin@2026');
  process.exit(1);
}

async function updateAdmin() {
  const hash = hashPassword(newPassword);
  try {
    const res = await pool.query(
      `UPDATE users 
       SET email = $1, password_hash = $2, updated_at = NOW() 
       WHERE role = 'ADMIN'`,
      [email, hash]
    );

    if (res.rowCount > 0) {
      console.log('========================================================================');
      console.log('✅ Super Admin credentials updated successfully in PostgreSQL!');
      console.log('📧 Email:', email);
      console.log('🔑 New Password:', newPassword);
      console.log('🔒 Secure PBKDF2 Hash generated and stored in users table.');
      console.log('========================================================================');
    } else {
      console.log('⚠️ No ADMIN user found in users table.');
    }
  } catch (err) {
    console.error('❌ Error updating admin credentials:', err.message);
  } finally {
    await pool.end();
  }
}

updateAdmin();
