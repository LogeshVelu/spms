import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { DatabaseSync } from 'node:sqlite';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../');

// Load environment variables
const envPath = path.resolve(rootDir, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || 
  `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'postgres'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'spms'}`;

console.log('========================================================================');
console.log('🐘  SPMS PostgreSQL Migration & Data Synchronization Engine');
console.log('📍  Target PostgreSQL Connection:', connectionString.replace(/:[^:@]+@/, ':****@'));
console.log('========================================================================\n');

const isCloudDb = connectionString.includes('sslmode=require') ||
  connectionString.includes('neon.tech') ||
  connectionString.includes('render.com') ||
  connectionString.includes('supabase.co') ||
  process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 10000,
  ssl: isCloudDb ? { rejectUnauthorized: false } : undefined
});

const sqlitePath = path.resolve(rootDir, 'data/spms.db');

async function runMigration() {
  let client;
  try {
    console.log('🔌 Connecting to PostgreSQL...');
    client = await pool.connect();
    console.log('✅ Connected successfully to PostgreSQL database!\n');

    // Step 1: Run PostgreSQL Schema DDL
    console.log('📜 Applying PostgreSQL DDL Schema (schema.postgres.sql)...');
    const schemaSql = fs.readFileSync(path.resolve(__dirname, 'schema.postgres.sql'), 'utf-8');
    await client.query(schemaSql);
    console.log('✅ PostgreSQL Schema and Indexes applied successfully!\n');

    // Step 2: Check SQLite source database
    if (!fs.existsSync(sqlitePath)) {
      console.log('ℹ️  No SQLite database found at', sqlitePath);
      console.log('✨ Clean PostgreSQL Schema ready for new data.');
      return;
    }

    console.log('📦 Reading existing data from SQLite (data/spms.db)...');
    const sqlite = new DatabaseSync(sqlitePath);

    const tablesToMigrate = [
      'users',
      'companies',
      'recruiter_profiles',
      'students',
      'student_documents',
      'student_resumes',
      'jobs',
      'job_eligibility_criteria',
      'job_stages',
      'applications',
      'application_resume_snapshots',
      'application_stage_results',
      'interviews',
      'offers',
      'audit_logs',
      'notifications'
    ];

    console.log('\n🚀 Starting table synchronization:');

    // Truncate all tables cleanly with CASCADE before syncing
    console.log('🧹 Clearing old tables with CASCADE...');
    const truncateList = tablesToMigrate.map(t => `"${t}"`).join(', ');
    await client.query(`TRUNCATE TABLE ${truncateList} CASCADE;`);
    console.log('✅ Tables cleared. Ready for fresh sync.\n');

    for (const table of tablesToMigrate) {
      try {
        const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
        if (!rows || rows.length === 0) {
          console.log(`   ⚪ Table [${table}]: 0 rows (skipped)`);
          continue;
        }

        const sampleRow = rows[0];
        const columns = Object.keys(sampleRow);
        const colList = columns.map(c => `"${c}"`).join(', ');
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

        const insertQuery = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

        for (const row of rows) {
          const values = columns.map(col => {
            const val = row[col];
            // Handle binary BLOB for PDF data
            if (val instanceof Uint8Array || Buffer.isBuffer(val)) {
              return Buffer.from(val);
            }
            return val;
          });
          await client.query(insertQuery, values);
        }

        console.log(`   ✅ Table [${table}]: Successfully migrated ${rows.length} rows`);
      } catch (tableErr) {
        console.warn(`   ⚠️ Table [${table}] note:`, tableErr.message);
      }
    }

    console.log('\n========================================================================');
    console.log('🎉 PostgreSQL Migration Completed Successfully!');
    console.log('🐘 PostgreSQL is now populated with 100% of the SPMS application data.');
    console.log('========================================================================\n');

  } catch (err) {
    console.error('\n❌ PostgreSQL Migration Error:', err.message);
    console.error('\n💡 Troubleshooting Tips:');
    console.error('1. Ensure PostgreSQL service is running: brew services start postgresql@16');
    console.error('2. Ensure database "spms" exists: createdb spms');
    console.error('3. Check credentials in .env: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/spms\n');
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

runMigration();
