// // routes/withdrawalRoutes.js
// const express = require('express');
// const router = express.Router();
// const { WithdrawalController } = require('../controllers/WithdrawalController');
// const authMiddleware = require('../../middleware/authmiddleware');

// // User routes (protected)
// router.get('/wallet-info', authMiddleware, WithdrawalController.getWalletInfo);
// router.get('/methods', authMiddleware, WithdrawalController.getWithdrawalMethods);
// router.post('/request', authMiddleware, WithdrawalController.requestWithdrawal);
// router.patch('/:withdrawalId/cancel', authMiddleware, WithdrawalController.cancelWithdrawal);

// // Admin routes (protected with admin middleware)
// router.get('/admin/all', authMiddleware, WithdrawalController.getAllWithdrawals);
// router.patch('/admin/:withdrawalId/process', authMiddleware, WithdrawalController.processWithdrawal);

// // Webhook routes (no auth needed)
// router.post('/webhook/transfer', WithdrawalController.handleTransferWebhook);

// module.exports = router;