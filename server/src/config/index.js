import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../');

export const config = {
  port: parseInt(process.env.PORT || '5050', 10),
  jwtSecret: process.env.JWT_SECRET || 'spms_master_production_secret_key_2026_iitm_secure',
  jwtExpiresIn: '24h',
  uploadsDir: path.resolve(rootDir, 'uploads/private'),
  dbPath: path.resolve(rootDir, 'data/spms.db'),
  brand: {
    institution: 'Indian Institute of Technology Madras',
    shortName: 'SPMS',
    fullName: 'Student Placement Management System',
    version: '4.0'
  }
};
