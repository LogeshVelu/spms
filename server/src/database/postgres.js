import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables if available
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../');
const envPath = path.resolve(rootDir, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const { Pool } = pg;

export const pgConfig = {
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'spms',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000
};

// Create connection pool (supports local PostgreSQL & Cloud Neon/Render with SSL)
const isCloudDb = process.env.DATABASE_URL && (
  process.env.DATABASE_URL.includes('sslmode=require') ||
  process.env.DATABASE_URL.includes('neon.tech') ||
  process.env.DATABASE_URL.includes('render.com') ||
  process.env.DATABASE_URL.includes('supabase.co') ||
  process.env.NODE_ENV === 'production'
);

export const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: isCloudDb ? { rejectUnauthorized: false } : undefined
      }
    : pgConfig
);

// Graceful pool error logging
pool.on('error', (err) => {
  console.warn('⚠️ [PostgreSQL Pool Warning]:', err.message);
});

/**
 * Test connectivity to PostgreSQL
 */
export async function testPostgresConnection() {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW() as current_time, current_database() as db_name;');
    client.release();
    return {
      connected: true,
      time: res.rows[0].current_time,
      database: res.rows[0].db_name
    };
  } catch (err) {
    return {
      connected: false,
      error: err.message
    };
  }
}

/**
 * Execute query on PostgreSQL
 */
export async function pgQuery(text, params = []) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  return res;
}

export default pool;
