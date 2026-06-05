// server.js
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
require('dotenv').config();
require('./config/passport');

// PostgreSQL connection (replaces mongoose)
const { pool } = require('./config/db');

// Import routes
const authRoutes = require('./routes/authRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const aiRoutes = require('./routes/aiRoutes');

// Ad Promoter
const createWebsiteRoutes = require('./AdPromoter/routes/createWebsiteRoutes');
const createCategoryRoutes = require('./AdPromoter/routes/createCategoryRoutes');
const adDisplayRoutes = require('./AdPromoter/routes/AdDisplayRoutes');
const businessCategoriesRoutes = require('./AdPromoter/routes/businessCategoriesRoutes');
const analyticsRoutes = require('./AdPromoter/routes/analyticsRoutes');

// Password Reset
const passwordRoutes = require('./routes/passwordRoutes');

// AdOwner
const webAdvertiseRoutes = require('./AdOwner/routes/WebAdvertiseRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

app.use(express.json());

const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://yepper.cc',
  'https://yepper.cc',
  'https://www.yepper.cc',
  'https://yepper-backend.onrender.com',
  'https://yep-strator.vercel.app',
  'http://yep-strator.vercel.app',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'https://yepper.cc',
  'https://yeffddfdper.vercel.app',
  'http://yeffddfdper.vercel.app',
  'https://www.yepper.cc',
  'http://yepper.cc',
  'http://www.yepper.cc',
];

const allowNullOriginPaths = [
  '/api/ads/display',
  '/api/ads/view',
  '/api/ads/click',
  '/api/ads/script',
  '/api/ad-categories/ads/customization',
  '/api/analytics/track',
  '/api/p/',
  '/api/c/',
];

const normalizeOrigin = (origin) => {
  if (!origin) return null;
  return origin.endsWith('/') ? origin.slice(0, -1) : origin;
};

const shouldAllowNullOrigin = (path) => {
  return allowNullOriginPaths.some(allowedPath => path.startsWith(allowedPath));
};

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || origin === 'null') {
    if (shouldAllowNullOrigin(req.path)) {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') return res.sendStatus(200);
      return next();
    }
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, x-node-key, x-node-ref');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    return next();
  }

  const normalizedOrigin = normalizeOrigin(origin);

  if (shouldAllowNullOrigin(req.path)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    return next();
  }

  if (allowedOrigins.includes(normalizedOrigin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, x-node-key, x-node-ref');
    res.header('Access-Control-Expose-Headers', 'Content-Range, X-Content-Range');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    return next();
  }

  console.error('✗ Origin rejected:', origin);
  return res.status(403).json({ error: 'CORS Error', message: `The CORS policy does not allow access from origin: ${origin}`, allowedOrigins });
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/password', passwordRoutes);

// AdPromoter
app.use('/api/websites',       createWebsiteRoutes);
app.use('/api/createWebsite',  createWebsiteRoutes);
app.use('/api/business-categories', businessCategoriesRoutes);
app.use('/api/ad-categories', createCategoryRoutes);
app.use('/api/ads', adDisplayRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/p', adDisplayRoutes);
app.use('/api/c', createCategoryRoutes);

// AdOwner
app.use('/api/web-advertise', webAdvertiseRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), environment: process.env.NODE_ENV || 'development' });
});

app.use((err, req, res, next) => {
  console.error('Error Details:', { message: err.message, stack: err.stack, url: req.url, method: req.method });
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Cannot ${req.method} ${req.url}` });
});

// PostgreSQL Connection Test
pool.query('SELECT NOW()').then(() => {
  console.log('✅ PostgreSQL connected');
}).catch(err => {
  console.error('❌ PostgreSQL connection error:', err.message);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

require('./keepAlive');
require('./AdPromoter/jobs/expireGrantWindows');
