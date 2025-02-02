// server.js
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const axios = require('axios');
const setupWebSocketServer = require('./config/websocketServer'); // Add this line
const waitlistRoutes = require('./routes/WaitlistRoutes');
const sitePartnersRoutes = require('./routes/SitePartnersRoutes');
const importAdRoutes = require('./routes/ImportAdRoutes');
const requestAdRoutes = require('./routes/RequestAdRoutes');
const websiteRoutes = require('./routes/WebsiteRoutes');
const adCategoryRoutes = require('./routes/AdCategoryRoutes');
const apiGeneratorRoutes = require('./routes/ApiGeneratorRoutes');
const adApprovalRoutes = require('./routes/AdApprovalRoutes');
const adDisplayRoutes = require('./routes/AdDisplayRoutes');
const paymentRoutes = require('./routes/PaymentRoutes');
const payoutRoutes = require('./routes/payoutRoutes');
const pictureRoutes = require('./routes/PictureRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests from all your deployment URLs and development environments
    const allowedOrigins = [
      'http://payment-test-page.vercel.app/',
      'https://payment-test-page.vercel.app',
      'https://www.payment-test-page.vercel.app/',
      'http://localhost:3000',
      'http://localhost:5000',
      undefined // Allow requests with no origin (like mobile apps or curl requests)
    ];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('Blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Added OPTIONS
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'X-Requested-With']
};

// Add CORS pre-flight handling
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/join-site-waitlist', sitePartnersRoutes);
app.use('/api/join-waitlist', waitlistRoutes);
app.use('/api/importAds', importAdRoutes);
app.use('/api/requestAd', requestAdRoutes);
app.use('/api/websites', websiteRoutes);
app.use('/api/ad-categories', adCategoryRoutes);
app.use('/api/generate-api', apiGeneratorRoutes);
app.use('/api/accept', adApprovalRoutes);
app.use('/api/ads', adDisplayRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/picture', pictureRoutes);
app.use('/api/payout', payoutRoutes);

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Set up WebSocket server with existing socket.io instance
setupWebSocketServer(server, io); // Add this line

module.exports.io = io;
connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.log(error);
  });