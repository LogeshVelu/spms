import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.join(__dirname, 'client');

console.log('========================================================================');
console.log('🚀 Student Placement Management System (SPMS v4.0)');
console.log('🏛️  Indian Institute of Technology Madras');
console.log('========================================================================');

// 1. Build Client CSS & Distribution
try {
  console.log('[1/3] Compiling Tailwind CSS design tokens...');
  execSync('node build-css.js', { cwd: clientDir, stdio: 'inherit' });
  console.log('[2/3] Building production client bundle...');
  execSync('./node_modules/.bin/vite build', { cwd: clientDir, stdio: 'inherit' });
} catch (e) {
  console.warn('Build Notice:', e.message);
}

// 2. Start Unified Server on Port 5050 (Serving both REST API + React SPA)
console.log('[3/3] Starting Unified Express Server on http://localhost:5050...');
const server = spawn('node', ['server/server.js'], {
  cwd: __dirname,
  stdio: 'inherit',
  env: { ...process.env, PORT: process.env.PORT || '5050' }
});

const cleanup = () => {
  console.log('\nStopping SPMS Platform servers...');
  server.kill('SIGINT');
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
