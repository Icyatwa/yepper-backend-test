// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
require('dotenv').config();
require('./config/passport');

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
const adminRoutes = require('./admin/routes/adminRoutes');

const app = express(); // ← INITIALIZE APP FIRST

// Middleware
app.use(express.json());

const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://yepper.cc',
  'https://yepper.cc',
  'https://www.yepper.cc',
  'https://yepper-backend-test.onrender.com',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'https://yepper.cc',
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
  // Stealth paths — neutral names that bypass ad-blocker filter lists
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

  // ── No origin header (curl, mobile app, server-to-server, sendBeacon with no origin) ──
  if (!origin || origin === 'null') {
    // Public ad/analytics endpoints: use * (no credentials needed for these fire-and-forget calls)
    if (shouldAllowNullOrigin(req.path)) {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') return res.sendStatus(200);
      return next();
    }
    // Everything else with no origin: allow through
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    return next();
  }

  const normalizedOrigin = normalizeOrigin(origin);

  // ── Public ad/analytics endpoints: accept ANY real origin ──
  // Must echo back the exact origin (not *) and set credentials true
  // because browsers send these with credentials mode include
  if (shouldAllowNullOrigin(req.path)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    return next();
  }

  // ── Known dashboard/app origins ──
  if (allowedOrigins.includes(normalizedOrigin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
    res.header('Access-Control-Expose-Headers', 'Content-Range, X-Content-Range');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    return next();
  }

  // ── Origin not allowed ──
  console.error('✗ Origin rejected:', origin);
  return res.status(403).json({
    error: 'CORS Error',
    message: `The CORS policy does not allow access from origin: ${origin}`,
    allowedOrigins: allowedOrigins
  });
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

// Auth Routes
app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/ai', aiRoutes);

// Password Reset Routes
app.use('/api/password', passwordRoutes);

// AdPromoter Routes
app.use('/api/createWebsite', createWebsiteRoutes);
app.use('/api/business-categories', businessCategoriesRoutes);
app.use('/api/ad-categories', createCategoryRoutes);
app.use('/api/ads', adDisplayRoutes);
app.use('/api/analytics', analyticsRoutes);

// ── Stealth mounts — same handlers, neutral URL prefixes ──────────────────
// /api/p  mirrors /api/ads     (avoids "ads" in the path)
// /api/c  mirrors /api/ad-categories  (avoids "ad-categories" in the path)
app.use('/api/p', adDisplayRoutes);
app.use('/api/c', createCategoryRoutes);

// AdOwner Routes
app.use('/api/web-advertise', webAdvertiseRoutes);

// Admin Panel
app.use('/api/admin', adminRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error Details:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    origin: req.headers.origin
  });
  
  // Handle CORS errors specifically
  if (err.message && err.message.includes('CORS policy')) {
    return res.status(403).json({
      error: 'CORS Error',
      message: err.message,
      origin: req.headers.origin,
      allowedOrigins: allowedOrigins
    });
  }
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.url}`,
    availableRoutes: [
      '/api/auth',
      '/api/conversations',
      '/api/ai',
      '/api/password',
      '/api/campaign-selections',
      '/api/adult-campaign',
      '/api/carOwners-campaign',
      '/api/countrySide-campaign',
      '/api/parents-campaign',
      '/api/transport-campaign',
      '/api/youth-campaign',
      '/api/createWebsite',
      '/api/business-categories',
      '/api/ad-categories',
      '/api/ads',
      '/api/web-advertise'
    ]
  });
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mern-auth', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.log('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

require('./keepAlive');