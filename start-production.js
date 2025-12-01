#!/usr/bin/env node

// Production starter script
// Loads .env.production before starting Next.js

const { spawn } = require('child_process');
const path = require('path');

// Load environment variables from .env.production
require('dotenv').config({
  path: path.resolve(__dirname, '.env.production')
});

console.log('[Production] Loaded .env.production');
console.log('[Production] Starting Next.js...');

// Start Next.js production server
const nextServer = spawn('npm', ['start'], {
  stdio: 'inherit',
  env: process.env
});

nextServer.on('error', (error) => {
  console.error('[Production] Failed to start:', error);
  process.exit(1);
});

nextServer.on('exit', (code) => {
  console.log(`[Production] Process exited with code ${code}`);
  process.exit(code);
});
