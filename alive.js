/**
 * alive.js — Keep-alive script for Render free tier
 *
 * Render free services sleep after 15 minutes of inactivity.
 * This script sends a ping to the health endpoint every 2 minutes
 * to prevent the server from sleeping.
 *
 * HOW TO RUN:
 *   node alive.js
 *
 * Or run alongside the server in production using package.json scripts.
 *
 * NOTE: Run this on a separate always-on machine, or use UptimeRobot
 * (https://uptimerobot.com) as a free external pinger — set it to
 * ping your /api/health URL every 5 minutes.
 */

const https = require('https');
const http  = require('http');

// ── Configuration ─────────────────────────────────────────────────────────────
const PING_URL       = process.env.RENDER_URL || 'https://ludo-arena-backend-qg3b.onrender.com/api/health';
const INTERVAL_MS    = 2 * 60 * 1000;   // 2 minutes
const LOG_TIMESTAMPS = true;

// ── Helper ────────────────────────────────────────────────────────────────────
const log = (msg) => {
  const ts = LOG_TIMESTAMPS ? `[${new Date().toISOString()}] ` : '';
  console.log(`${ts}${msg}`);
};

// ── Ping function ─────────────────────────────────────────────────────────────
const ping = () => {
  const url      = new URL(PING_URL);
  const lib      = url.protocol === 'https:' ? https : http;
  const startMs  = Date.now();

  const req = lib.get(PING_URL, { timeout: 10000 }, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      const ms = Date.now() - startMs;
      if (res.statusCode === 200) {
        log(`✅ Ping OK   ${res.statusCode}  ${ms}ms  →  ${PING_URL}`);
      } else {
        log(`⚠️  Ping WARN ${res.statusCode}  ${ms}ms  →  ${PING_URL}`);
      }
    });
  });

  req.on('error', (err) => {
    log(`❌ Ping FAIL  ${err.message}  →  ${PING_URL}`);
  });

  req.on('timeout', () => {
    log(`⏱  Ping TIMEOUT  →  ${PING_URL}`);
    req.destroy();
  });
};

// ── Start ─────────────────────────────────────────────────────────────────────
log(`🏓 Keep-alive started — pinging every ${INTERVAL_MS / 1000}s`);
log(`   Target: ${PING_URL}`);
log(`   Press Ctrl+C to stop.\n`);

ping();                              // First ping immediately
setInterval(ping, INTERVAL_MS);     // Then every 2 minutes
