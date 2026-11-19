import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from './src/config/index.js';
import { initDb } from './src/database/db.js';
import { runSeed } from './src/database/seed.js';
import apiRouter from './src/routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIST = path.resolve(__dirname, '../client/dist');

const app = express();
const PORT = config.port;

// Initialize Database and Seed Baseline Data
initDb();
runSeed();

// CORS setup
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Disposition']
}));

// Request body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    system: config.brand.fullName,
    institution: config.brand.institution,
    version: config.brand.version,
    timestamp: new Date().toISOString()
  });
});

// Mount V1 REST API
app.use('/api/v1', apiRouter);

// Serve static build if present
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.originalUrl.startsWith('/api')) {
      return res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    }
    next();
  });
}

// 404 Handler for API
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: `The requested endpoint '${req.originalUrl}' does not exist.`
      }
    });
  }
  next();
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('[SPMS Server Error]', err.stack);
  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected internal server error occurred.'
    }
  });
});

function startServer(portToTry) {
  const server = app.listen(portToTry, () => {
    console.log(`========================================================================`);
    console.log(`🏛️  ${config.brand.fullName} (SPMS v${config.brand.version})`);
    console.log(`🎓  ${config.brand.institution}`);
    console.log(`🌐  Portal Web App: http://localhost:${portToTry}`);
    console.log(`🚀  REST API Gateway: http://localhost:${portToTry}/api/v1`);
    console.log(`🩺  Health Check: http://localhost:${portToTry}/api/health`);
    console.log(`========================================================================`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️  Port ${portToTry} is in use by another app. Trying port ${portToTry + 1}...`);
      startServer(portToTry + 1);
    } else {
      console.error('Server Listen Error:', err);
    }
  });
}

startServer(PORT);
