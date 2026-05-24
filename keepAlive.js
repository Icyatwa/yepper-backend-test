// keepAlive.js
// Pings /health every 10 minutes to prevent Render cold starts.
// Skips pinging entirely on localhost — no need to keep local server alive.

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const PING_INTERVAL_MS = 10 * 60 * 1000;

// Don't run on localhost — pointless and causes the http/https mismatch error
const isLocal = BACKEND_URL.includes('localhost') || BACKEND_URL.includes('127.0.0.1');
if (isLocal) {
  console.log(`[keepAlive] Local environment detected — pinging disabled.`);
} else {
  const http  = require('http');
  const https = require('https');

  function ping() {
    const url = new URL('/health', BACKEND_URL);
    const lib = url.protocol === 'https:' ? https : http;
    const timestamp = new Date().toISOString();

    const req = lib.get(url.toString(), (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`[${timestamp}] ✓ Server alive — ${res.statusCode}`);
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

  ping();
  setInterval(ping, PING_INTERVAL_MS);
  console.log(`[keepAlive] Pinging ${BACKEND_URL}/health every 10 minutes`);
}