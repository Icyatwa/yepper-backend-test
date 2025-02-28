// // WithdrawalController.js
// const Withdrawal = require('../models/WebOwnerWithdrawalModel');
// const WebOwnerBalance = require('../models/WebOwnerBalanceModel'); // Balance tracking model
// const Payment = require('../models/PaymentModel');
// const Flutterwave = require('flutterwave-node-v3');
// const axios = require('axios');

// // Handle withdrawal requests
// exports.withdrawFunds = async (req, res) => {
//   try {
//     const { userId, phoneNumber, amount } = req.body;

//     if (!userId || !phoneNumber || !amount) {
//       return res.status(400).json({ message: 'User ID, phone number, and amount are required.' });
//     }

//     const userBalance = await WebOwnerBalance.findOne({ userId });
//     if (!userBalance || userBalance.availableBalance < amount) {
//       return res.status(400).json({ message: 'Insufficient balance.' });
//     }

//     const withdrawal = new Withdrawal({
//       userId,
//       phoneNumber,
//       amount,
//       status: 'pending',
//     });

//     await withdrawal.save();

//     // Simulate the money transfer via Flutterwave
//     const flutterwaveResponse = await axios.post('https://api.flutterwave.com/v3/transfers', {
//       account_bank: "MPS", // For mobile money
//       account_number: phoneNumber,
//       amount,
//       currency: "RWF",
//       narration: "Withdrawal",
//     }, {
//       headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
//     });

//     if (flutterwaveResponse.data.status === 'success') {
//       withdrawal.status = 'successful';
//       await withdrawal.save();

//       // Update user balance
//       await WebOwnerBalance.findOneAndUpdate(
//         { userId },
//         { $inc: { availableBalance: -amount } },
//       );

//       res.status(200).json({ message: 'Withdrawal successful', withdrawal });
//     } else {
//       withdrawal.status = 'failed';
//       await withdrawal.save();
//       res.status(500).json({ message: 'Withdrawal failed', details: flutterwaveResponse.data });
//     }
//   } catch (error) {
//     console.error('Error processing withdrawal:', error);
//     res.status(500).json({ message: 'Error processing withdrawal.', error });
//   }
// };

// // Fetch withdrawal history
// exports.getWithdrawalHistory = async (req, res) => {
//   try {
//     const { userId } = req.params;

//     if (!userId) {
//       return res.status(400).json({ message: 'User ID is required.' });
//     }

//     const withdrawals = await Withdrawal.find({ userId });

//     res.status(200).json({ withdrawals });
//   } catch (error) {
//     console.error('Error fetching withdrawal history:', error);
//     res.status(500).json({ message: 'Error fetching withdrawal history.', error });
//   }
// };
