// keepAlive.js
// ─────────────────────────────────────────────────────────────
// Pings the backend /health endpoint every 10 minutes so Render
// never spins the server down. Run this on any always-on machine
// (your laptop, a free Railway cron, or a Vercel cron job).
//
// To run locally:   node keepAlive.js
// To run on server: add to package.json scripts and use pm2
// ─────────────────────────────────────────────────────────────

const https = require('https');

const BACKEND_URL = process.env.BACKEND_URL || 'https://yepper-backend-test.onrender.com';
const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

function ping() {
  const url = new URL('/health', BACKEND_URL);
  const timestamp = new Date().toISOString();

  const req = https.get(url.toString(), (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log(`[${timestamp}] ✓ Server alive — status ${res.statusCode}`);
      } else {
        console.warn(`[${timestamp}] ⚠ Unexpected status ${res.statusCode}: ${data}`);
      }
    });
  });

  req.on('error', (err) => {
    console.error(`[${timestamp}] ✗ Ping failed: ${err.message}`);
  });

  req.setTimeout(8000, () => {
    console.warn(`[${timestamp}] ⚠ Ping timed out`);
    req.destroy();
  });
}

// Ping immediately on start, then every 10 minutes
ping();
setInterval(ping, PING_INTERVAL_MS);

console.log(`Keep-alive started — pinging ${BACKEND_URL}/health every 10 minutes`);