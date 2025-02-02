// routes/payoutRoutes.js
const express = require('express');
const { requestPayout } = require('../controllers/PayoutController');
const router = express.Router();

router.post('/request-payout', requestPayout);

module.exports = router;










// // routes/paymentRoutes.js
// const express = require('express');
// const router = express.Router();
// const { initiatePayoutTransfer, payoutCallback } = require('../controllers/PayoutController');

// // Add this new route
// router.post('/', initiatePayoutTransfer);
// router.get('/callback', payoutCallback);

// module.exports = router; 